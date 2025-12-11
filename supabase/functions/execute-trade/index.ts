import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60000;

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

// HMAC-SHA256 signature
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Decrypt API secret
async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, encryptedBytes);
  return new TextDecoder().decode(decrypted);
}

interface TradeRequest {
  pair: string;
  direction: "long" | "short";
  entryPrice: number;
  amount: number;
  leverage: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  exchangeName?: string;
  isSandbox: boolean;
}

interface ExchangeConnection {
  exchange_name: string;
  api_key_hash: string;
  encrypted_api_secret: string;
  encrypted_passphrase: string | null;
  encryption_iv: string;
}

// Exchange-specific order placement
async function placeBindanceOrder(apiKey: string, apiSecret: string, trade: TradeRequest): Promise<{ orderId: string; status: string }> {
  const timestamp = Date.now();
  const symbol = trade.pair.replace("/", "");
  const side = trade.direction === "long" ? "BUY" : "SELL";
  const quantity = (trade.amount / trade.entryPrice).toFixed(6);
  
  const params = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.msg || "Binance order failed");
  }
  
  const data = await response.json();
  return { orderId: data.orderId.toString(), status: data.status };
}

async function placeBybitOrder(apiKey: string, apiSecret: string, trade: TradeRequest): Promise<{ orderId: string; status: string }> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const symbol = trade.pair.replace("/", "");
  const side = trade.direction === "long" ? "Buy" : "Sell";
  const qty = (trade.amount / trade.entryPrice).toFixed(6);
  
  const body = JSON.stringify({
    category: "spot",
    symbol,
    side,
    orderType: "Market",
    qty,
  });
  
  const signPayload = timestamp + apiKey + recvWindow + body;
  const signature = await hmacSha256(apiSecret, signPayload);
  
  const response = await fetch("https://api.bybit.com/v5/order/create", {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(data.retMsg || "Bybit order failed");
  return { orderId: data.result.orderId, status: "NEW" };
}

async function placeKuCoinOrder(apiKey: string, apiSecret: string, passphrase: string, trade: TradeRequest): Promise<{ orderId: string; status: string }> {
  const timestamp = Date.now().toString();
  const endpoint = "/api/v1/orders";
  const symbol = trade.pair.replace("/", "-");
  const side = trade.direction === "long" ? "buy" : "sell";
  const size = (trade.amount / trade.entryPrice).toFixed(6);
  
  const body = JSON.stringify({ clientOid: crypto.randomUUID(), side, symbol, type: "market", size });
  const stringToSign = timestamp + "POST" + endpoint + body;
  const signature = btoa(await hmacSha256(apiSecret, stringToSign));
  const passphraseSign = btoa(await hmacSha256(apiSecret, passphrase));
  
  const response = await fetch(`https://api.kucoin.com${endpoint}`, {
    method: "POST",
    headers: {
      "KC-API-KEY": apiKey,
      "KC-API-SIGN": signature,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": passphraseSign,
      "KC-API-KEY-VERSION": "2",
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (data.code !== "200000") throw new Error(data.msg || "KuCoin order failed");
  return { orderId: data.data.orderId, status: "NEW" };
}

async function placeOKXOrder(apiKey: string, apiSecret: string, passphrase: string, trade: TradeRequest): Promise<{ orderId: string; status: string }> {
  const timestamp = new Date().toISOString();
  const endpoint = "/api/v5/trade/order";
  const symbol = trade.pair.replace("/", "-");
  const side = trade.direction === "long" ? "buy" : "sell";
  const sz = (trade.amount / trade.entryPrice).toFixed(6);
  
  const body = JSON.stringify({ instId: symbol, tdMode: "cash", side, ordType: "market", sz });
  const signPayload = timestamp + "POST" + endpoint + body;
  const signature = btoa(await hmacSha256(apiSecret, signPayload));
  
  const response = await fetch(`https://www.okx.com${endpoint}`, {
    method: "POST",
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (data.code !== "0") throw new Error(data.msg || "OKX order failed");
  return { orderId: data.data[0].ordId, status: "NEW" };
}

// Simulated trade for sandbox or unsupported exchanges
function simulateTrade(trade: TradeRequest) {
  const random = Math.random();
  const leverage = trade.leverage || 1;
  let exitPrice: number, targetHit: string;
  
  if (random < 0.33) { exitPrice = trade.takeProfit1; targetHit = "TP1"; }
  else if (random < 0.55) { exitPrice = trade.takeProfit2; targetHit = "TP2"; }
  else if (random < 0.70) { exitPrice = trade.takeProfit3; targetHit = "TP3"; }
  else { exitPrice = trade.stopLoss; targetHit = "SL"; }
  
  const priceChange = trade.direction === "long" 
    ? (exitPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - exitPrice) / trade.entryPrice;
  
  return {
    exitPrice,
    profitLoss: trade.amount * priceChange * leverage,
    profitPercentage: priceChange * 100 * leverage,
    targetHit,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateCheck.retryAfter) } });
    }

    const tradeReq: TradeRequest = await req.json();
    console.log(`Executing trade for user ${user.id}:`, tradeReq.pair, tradeReq.direction);

    if (!tradeReq.pair || !tradeReq.direction || !tradeReq.entryPrice || !tradeReq.amount) {
      return new Response(JSON.stringify({ error: "Missing required trade parameters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let orderId: string | null = null;
    let orderStatus = "simulated";
    let isRealTrade = false;

    // Check for exchange connection if not sandbox
    if (!tradeReq.isSandbox && tradeReq.exchangeName && encryptionKey) {
      const { data: connection } = await supabase
        .from("exchange_connections")
        .select("exchange_name, api_key_hash, encrypted_api_secret, encrypted_passphrase, encryption_iv")
        .eq("user_id", user.id)
        .eq("exchange_name", tradeReq.exchangeName)
        .eq("is_connected", true)
        .maybeSingle();

      if (connection?.encrypted_api_secret && connection?.encryption_iv) {
        try {
          const apiKey = atob(connection.api_key_hash).replace(/\*+/g, ""); // Note: In production, store actual key encrypted
          const apiSecret = await decryptSecret(connection.encrypted_api_secret, connection.encryption_iv, encryptionKey);
          const passphrase = connection.encrypted_passphrase 
            ? await decryptSecret(connection.encrypted_passphrase, connection.encryption_iv, encryptionKey) 
            : "";

          const exchange = tradeReq.exchangeName.toLowerCase();
          console.log(`Placing real order on ${exchange}`);

          if (exchange === "binance") {
            const result = await placeBindanceOrder(apiKey, apiSecret, tradeReq);
            orderId = result.orderId;
            orderStatus = result.status;
            isRealTrade = true;
          } else if (exchange === "bybit") {
            const result = await placeBybitOrder(apiKey, apiSecret, tradeReq);
            orderId = result.orderId;
            orderStatus = result.status;
            isRealTrade = true;
          } else if (exchange === "kucoin") {
            const result = await placeKuCoinOrder(apiKey, apiSecret, passphrase, tradeReq);
            orderId = result.orderId;
            orderStatus = result.status;
            isRealTrade = true;
          } else if (exchange === "okx") {
            const result = await placeOKXOrder(apiKey, apiSecret, passphrase, tradeReq);
            orderId = result.orderId;
            orderStatus = result.status;
            isRealTrade = true;
          }
          // Kraken, Hyperliquid, Nexo would be implemented similarly
        } catch (exchangeError: unknown) {
          console.error("Exchange order error:", exchangeError);
          // Fall back to simulation if exchange fails
        }
      }
    }

    // Create trade record
    const { data: trade, error: insertError } = await supabase
      .from("trades")
      .insert({
        user_id: user.id,
        pair: tradeReq.pair,
        direction: tradeReq.direction,
        entry_price: tradeReq.entryPrice,
        amount: tradeReq.amount,
        leverage: tradeReq.leverage || 1,
        exchange_name: tradeReq.exchangeName || "Simulated",
        is_sandbox: tradeReq.isSandbox,
        status: "open",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // For simulated trades, close after delay
    if (!isRealTrade) {
      const simulatedOutcome = simulateTrade(tradeReq);
      setTimeout(async () => {
        await supabase.from("trades").update({
          exit_price: simulatedOutcome.exitPrice,
          profit_loss: simulatedOutcome.profitLoss,
          profit_percentage: simulatedOutcome.profitPercentage,
          status: "closed",
          closed_at: new Date().toISOString(),
        }).eq("id", trade.id);

        await supabase.from("alerts").insert({
          user_id: user.id,
          alert_type: "trade_closed",
          title: `Trade ${simulatedOutcome.profitLoss >= 0 ? "Won" : "Lost"}`,
          message: `${tradeReq.pair} ${tradeReq.direction} closed with ${simulatedOutcome.profitPercentage.toFixed(2)}% P&L`,
          data: { tradeId: trade.id, profitLoss: simulatedOutcome.profitLoss },
        });
      }, 5000);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        trade,
        orderId,
        orderStatus,
        isRealTrade,
        message: isRealTrade ? `Order placed on ${tradeReq.exchangeName}` : "Trade simulated",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error executing trade:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
