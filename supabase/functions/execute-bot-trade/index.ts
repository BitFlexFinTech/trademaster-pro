import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// Fetch real-time price from Binance
async function fetchPrice(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.replace('/', '')}`);
    const data = await response.json();
    return parseFloat(data.price);
  } catch {
    return 0;
  }
}

// Get Binance lot size filters for proper order sizing
async function getBinanceLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    
    if (!data.symbols || data.symbols.length === 0) {
      return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
    }
    
    const filters = data.symbols[0].filters;
    const lotSizeFilter = filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    const notionalFilter = filters.find((f: { filterType: string }) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
    
    return {
      stepSize: lotSizeFilter?.stepSize || '0.00001',
      minQty: lotSizeFilter?.minQty || '0.00001',
      minNotional: parseFloat(notionalFilter?.minNotional || notionalFilter?.notional || '10') || 10
    };
  } catch (e) {
    console.error('Failed to fetch Binance lot size:', e);
    return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
  }
}

// Round quantity to valid step size
function roundToStepSize(quantity: number, stepSize: string): string {
  const step = parseFloat(stepSize);
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(quantity / step) * step;
  return rounded.toFixed(precision);
}

// Fetch free USDT balance from Binance account (for live position sizing)
async function getBinanceFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
      {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Failed to fetch Binance account balance:", error);
      return 0;
    }

    const data = await response.json();
    if (!data.balances || !Array.isArray(data.balances)) return 0;

    const usdt = data.balances.find(
      (b: { asset: string }) => b.asset === "USDT",
    );
    if (!usdt) return 0;

    const free = parseFloat(usdt.free ?? "0");
    return Number.isFinite(free) ? free : 0;
  } catch (e) {
    console.error("Error fetching Binance account balance:", e);
    return 0;
  }
}

// Top 10 liquid USDT pairs
const TOP_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'
];

// Safety limits
const DEFAULT_POSITION_SIZE = 100; // Default $100 per trade
const MAX_POSITION_SIZE_CAP = 5000; // Hard cap at $5000 for safety
const DAILY_LOSS_LIMIT = -5; // Stop if daily loss exceeds $5

interface BotTradeRequest {
  botId: string;
  mode: 'spot' | 'leverage';
  profitTarget: number;
  exchanges: string[];
  leverages?: Record<string, number>;
  isSandbox: boolean;
  maxPositionSize?: number; // NEW: user-configurable position size
}

// ============ EXCHANGE ORDER PLACEMENT FUNCTIONS ============

async function placeBinanceOrder(apiKey: string, apiSecret: string, symbol: string, side: string, quantity: string): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string }> {
  const timestamp = Date.now();
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
  // Calculate average fill price from fills
  let avgPrice = 0;
  if (data.fills && data.fills.length > 0) {
    const totalQty = data.fills.reduce((sum: number, f: { qty: string }) => sum + parseFloat(f.qty), 0);
    const totalValue = data.fills.reduce((sum: number, f: { qty: string; price: string }) => sum + parseFloat(f.qty) * parseFloat(f.price), 0);
    avgPrice = totalValue / totalQty;
  } else {
    avgPrice = parseFloat(data.price) || 0;
  }
  
  // Return executedQty for accurate exit orders
  return { orderId: data.orderId.toString(), status: data.status, avgPrice, executedQty: data.executedQty || quantity };
}

// Helper: Place Binance order with retry logic
async function placeBinanceOrderWithRetry(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  maxRetries: number = 3
): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity);
      console.log(`${side} order succeeded on attempt ${attempt}`);
      return result;
    } catch (e) {
      console.warn(`${side} order attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
      }
    }
  }
  console.error(`All ${maxRetries} ${side} order attempts failed for ${symbol}`);
  return null;
}

async function placeBybitOrder(apiKey: string, apiSecret: string, symbol: string, side: string, qty: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  
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
  return { orderId: data.result.orderId, status: "FILLED", avgPrice: parseFloat(data.result.avgPrice) || 0 };
}

async function placeOKXOrder(apiKey: string, apiSecret: string, passphrase: string, symbol: string, side: string, sz: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = new Date().toISOString();
  const endpoint = "/api/v5/trade/order";
  
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
  return { orderId: data.data[0].ordId, status: "FILLED", avgPrice: parseFloat(data.data[0].avgPx) || 0 };
}

async function placeKrakenOrder(apiKey: string, apiSecret: string, pair: string, type: string, volume: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const nonce = Date.now() * 1000;
  const endpoint = "/0/private/AddOrder";
  const postData = `nonce=${nonce}&ordertype=market&type=${type}&pair=${pair}&volume=${volume}`;
  
  const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + postData));
  const sha256Bytes = new Uint8Array(sha256Hash);
  const pathBytes = new TextEncoder().encode(endpoint);
  const message = new Uint8Array([...pathBytes, ...sha256Bytes]);
  
  const keyBytes = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://api.kraken.com${endpoint}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sig,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  });
  
  const data = await response.json();
  if (data.error && data.error.length > 0) throw new Error(data.error[0] || "Kraken order failed");
  return { orderId: data.result?.txid?.[0] || crypto.randomUUID(), status: "FILLED", avgPrice: 0 };
}

async function placeNexoOrder(apiKey: string, apiSecret: string, symbol: string, side: string, quantity: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const endpoint = "/api/v1/orders";
  
  const body = JSON.stringify({ pair: symbol, side, type: "market", quantity });
  const signPayload = `${nonce}${timestamp}POST${endpoint}${body}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const msgData = encoder.encode(signPayload);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://pro-api.nexo.io${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "X-NONCE": nonce,
      "X-SIGNATURE": sig,
      "X-TIMESTAMP": timestamp.toString(),
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (!data.orderId) throw new Error(data.errorMessage || "Nexo order failed");
  return { orderId: data.orderId, status: "FILLED", avgPrice: parseFloat(data.avgPrice) || 0 };
}

// ============ MAIN HANDLER ============

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { botId, mode, profitTarget, exchanges, leverages, isSandbox, maxPositionSize }: BotTradeRequest = await req.json();
    
    // Apply user-configured position size with hard cap
    const userPositionSize = Math.min(maxPositionSize || DEFAULT_POSITION_SIZE, MAX_POSITION_SIZE_CAP);
    
    console.log('========================================');
    console.log(`🤖 BOT TRADE EXECUTION REQUEST`);
    console.log(`   Bot ID: ${botId}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Sandbox: ${isSandbox}`);
    console.log(`   Profit Target: $${profitTarget}`);
    console.log(`   Max Position Size: $${userPositionSize} (requested: $${maxPositionSize || 'default'})`);
    console.log(`   Exchanges: ${exchanges.join(', ')}`);
    console.log('========================================');

    // Check daily loss limit from bot_runs
    const { data: bot } = await supabase
      .from("bot_runs")
      .select("current_pnl, trades_executed, hit_rate")
      .eq("id", botId)
      .single();

    if (bot && bot.current_pnl <= DAILY_LOSS_LIMIT) {
      console.log(`Daily loss limit reached: ${bot.current_pnl}`);
      return new Response(JSON.stringify({ 
        error: "Daily loss limit reached", 
        dailyPnL: bot.current_pnl 
      }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get connected exchanges with API keys
    const { data: connections } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .in("exchange_name", exchanges);

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No connected exchanges", 
        simulated: true,
        message: "Running in simulation mode - no exchange connections found"
      }), { 
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Select a random pair and fetch real-time price
    const pair = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
    const currentPrice = await fetchPrice(pair);
    
    if (currentPrice === 0) {
      return new Response(JSON.stringify({ error: "Failed to fetch price" }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Determine direction based on mode
    // SPOT mode: Only LONG trades (we don't own assets to short)
    // LEVERAGE mode: Both long and short
    let direction: 'long' | 'short' = 'long';
    if (mode === 'leverage') {
      direction = Math.random() > 0.5 ? 'long' : 'short';
    }
    
    // Calculate position size - use user-configured value, capped for safety
    const expectedMove = 0.005; // 0.5% average move
    const leverage = mode === 'leverage' ? (leverages?.[connections[0].exchange_name] || 5) : 1;

    // Base position size from target and user cap
    let positionSize = Math.min(profitTarget / (expectedMove * leverage), userPositionSize);

    // In SPOT mode, start with a conservative cap (e.g. $30)
    if (mode === 'spot') {
      positionSize = Math.min(positionSize, 30);
      console.log(`SPOT mode: Base conservative position size: $${positionSize}`);
    }

    // In LIVE mode, further cap by available stablecoin balance on the selected exchange
    let availableBalance = 0;
    try {
      const { data: holdings, error: holdingsError } = await supabase
        .from("portfolio_holdings")
        .select("asset_symbol, quantity")
        .eq("user_id", user.id)
        .eq("exchange_name", connections[0].exchange_name)
        .in("asset_symbol", ["USDT", "USDC", "USD"]);

      if (holdingsError) {
        console.error("Failed to fetch portfolio holdings for position sizing:", holdingsError);
      } else if (holdings && holdings.length > 0) {
        availableBalance = holdings.reduce(
          (sum: number, h: { quantity: number | null }) => sum + (h.quantity || 0),
          0,
        );
      }
    } catch (e) {
      console.error("Unexpected error fetching portfolio holdings for position sizing:", e);
    }

    if (!isSandbox) {
      console.log(
        `Available stable balance on ${connections[0].exchange_name}: $${availableBalance}`,
      );

      if (availableBalance <= 0) {
        return new Response(
          JSON.stringify({
            error: "Insufficient stablecoin balance",
            reason: `No USDT/USDC/USD balance on ${connections[0].exchange_name} for live trade`,
            exchange: connections[0].exchange_name,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const maxByBalance = availableBalance * 0.9; // keep 10% buffer
      positionSize = Math.min(positionSize, maxByBalance);
      console.log(
        `LIVE MODE: Position size capped by available balance: $${positionSize} (max by balance: $${maxByBalance})`,
      );
    }

    
    const selectedExchange = connections[0];
    const exchangeName = selectedExchange.exchange_name.toLowerCase();
    
    let tradeResult = {
      success: true,
      pair,
      direction,
      entryPrice: currentPrice,
      positionSize,
      exchange: selectedExchange.exchange_name,
      leverage,
      simulated: isSandbox,
      exitPrice: 0,
      pnl: 0,
      orderId: null as string | null,
      realTrade: false,
    };

    // ============ REAL TRADE EXECUTION (LIVE MODE) ============
    const hasApiCredentials = selectedExchange.encrypted_api_key &&
      selectedExchange.encrypted_api_secret &&
      selectedExchange.encryption_iv;
    const canExecuteRealTrade = !isSandbox && encryptionKey && hasApiCredentials;
    
    console.log('----------------------------------------');
    console.log(`🔍 TRADE EXECUTION CHECK:`);
    console.log(`   isSandbox: ${isSandbox}`);
    console.log(`   encryptionKey exists: ${!!encryptionKey}`);
    console.log(`   API Key exists: ${!!selectedExchange.encrypted_api_key}`);
    console.log(`   API Secret exists: ${!!selectedExchange.encrypted_api_secret}`);
    console.log(`   IV exists: ${!!selectedExchange.encryption_iv}`);
    console.log(`   => CAN EXECUTE REAL TRADE: ${canExecuteRealTrade}`);
    console.log('----------------------------------------');

    // In LIVE mode, if we cannot execute a real trade, return a clear error
    if (!isSandbox && !canExecuteRealTrade) {
      console.error('❌ Live mode enabled but no valid API credentials or encryption key.');
      return new Response(
        JSON.stringify({
          error: "Cannot execute live trade",
          reason:
            "Live mode requires valid exchange API credentials and encryption key. Please verify your exchange connection and permissions.",
          exchange: selectedExchange.exchange_name,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (canExecuteRealTrade) {
      console.log(`✅ REAL TRADE MODE ACTIVATED for ${exchangeName.toUpperCase()}`);
      
      try {
        const apiKey = await decryptSecret(selectedExchange.encrypted_api_key, selectedExchange.encryption_iv, encryptionKey);
        const apiSecret = await decryptSecret(selectedExchange.encrypted_api_secret, selectedExchange.encryption_iv, encryptionKey);
        const passphrase = selectedExchange.encrypted_passphrase 
          ? await decryptSecret(selectedExchange.encrypted_passphrase, selectedExchange.encryption_iv, encryptionKey)
          : "";

        const symbol = pair.replace("/", "");
        const side = direction === 'long' ? 'BUY' : 'SELL';
        
        // Get lot size requirements and calculate proper quantity
        const lotInfo = await getBinanceLotSize(symbol);
        console.log(`Lot size info for ${symbol}:`, lotInfo);

        // Determine final position size for order
        let adjustedPositionSize = positionSize;

        // In LIVE SPOT mode on Binance, cap by real free USDT balance from the exchange
        if (!isSandbox && exchangeName === "binance") {
          const freeStable = await getBinanceFreeStableBalance(apiKey, apiSecret);
          console.log(`Binance free USDT balance: $${freeStable}`);
          if (freeStable <= 0) {
            // Business-level error: not enough free balance to trade
            return new Response(
              JSON.stringify({
                success: false,
                error: "Insufficient free Binance balance",
                reason:
                  "Your free USDT balance on Binance is 0. Deposit or free up funds to trade.",
                exchange: selectedExchange.exchange_name,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          const maxByFree = freeStable * 0.8; // keep 20% buffer for fees / other orders
          const minRequired = lotInfo.minNotional * 1.1;

          if (maxByFree < minRequired) {
            console.error(
              `Free Binance balance $${freeStable} is below minimum notional requirement $${lotInfo.minNotional}`,
            );
            // Business-level error: user balance too low for Binance minimum size
            return new Response(
              JSON.stringify({
                success: false,
                error: "Balance below Binance minimum order size",
                reason:
                  `Free Binance USDT balance ($${freeStable.toFixed(
                    4,
                  )}) is below minimum notional requirement ($${lotInfo.minNotional})`,
                exchange: selectedExchange.exchange_name,
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          adjustedPositionSize = Math.min(adjustedPositionSize, maxByFree);
          console.log(
            `Adjusted position size by free balance: $${adjustedPositionSize} (max by free: $${maxByFree})`,
          );
        }

        // Ensure minimum notional value is met
        if (adjustedPositionSize < lotInfo.minNotional) {
          adjustedPositionSize = lotInfo.minNotional * 1.1; // Add 10% buffer
          console.log(
            `Position size increased to meet min notional: $${adjustedPositionSize}`,
          );
        }

        // Calculate and round quantity to step size
        const rawQuantity = adjustedPositionSize / currentPrice;
        const quantity = roundToStepSize(rawQuantity, lotInfo.stepSize);
        console.log(`Order quantity: ${quantity} (raw: ${rawQuantity}, stepSize: ${lotInfo.stepSize}, minQty: ${lotInfo.minQty})`);

        let entryOrder: { orderId: string; status: string; avgPrice: number; executedQty: string } | null = null;

        // Place ENTRY order
        if (exchangeName === "binance") {
          entryOrder = await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity);
        } else if (exchangeName === "bybit") {
          const bybitResult = await placeBybitOrder(apiKey, apiSecret, symbol, side === 'BUY' ? 'Buy' : 'Sell', quantity);
          entryOrder = { ...bybitResult, executedQty: quantity };
        } else if (exchangeName === "okx") {
          const okxResult = await placeOKXOrder(apiKey, apiSecret, passphrase, pair.replace("/", "-"), side.toLowerCase(), quantity);
          entryOrder = { ...okxResult, executedQty: quantity };
        } else if (exchangeName === "kraken") {
          const krakenResult = await placeKrakenOrder(apiKey, apiSecret, symbol, side.toLowerCase(), quantity);
          entryOrder = { ...krakenResult, executedQty: quantity };
        } else if (exchangeName === "nexo") {
          const nexoResult = await placeNexoOrder(apiKey, apiSecret, symbol, side.toLowerCase(), quantity);
          entryOrder = { ...nexoResult, executedQty: quantity };
        }

        if (entryOrder) {
          // Use the ACTUAL executed quantity from the entry order for exit
          const actualExecutedQty = entryOrder.executedQty || quantity;
          console.log(`Entry order placed: ${entryOrder.orderId}, avg price: ${entryOrder.avgPrice}, executedQty: ${actualExecutedQty}`);
          tradeResult.orderId = entryOrder.orderId;
          tradeResult.realTrade = true;
          tradeResult.entryPrice = entryOrder.avgPrice || currentPrice;
          
          // Wait a moment then place EXIT order (opposite direction)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Fetch updated price for exit
          const exitPrice = await fetchPrice(pair);
          const exitSide = direction === 'long' ? 'SELL' : 'BUY';
          
          let exitOrder: { orderId: string; status: string; avgPrice: number; executedQty: string } | null = null;
          
          // Use retry logic for Binance exit orders with EXACT executedQty from entry
          if (exchangeName === "binance") {
            exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, 3);
          } else if (exchangeName === "bybit") {
            const bybitResult = await placeBybitOrder(apiKey, apiSecret, symbol, exitSide === 'BUY' ? 'Buy' : 'Sell', actualExecutedQty);
            exitOrder = { ...bybitResult, executedQty: actualExecutedQty };
          } else if (exchangeName === "okx") {
            const okxResult = await placeOKXOrder(apiKey, apiSecret, passphrase, pair.replace("/", "-"), exitSide.toLowerCase(), actualExecutedQty);
            exitOrder = { ...okxResult, executedQty: actualExecutedQty };
          } else if (exchangeName === "kraken") {
            const krakenResult = await placeKrakenOrder(apiKey, apiSecret, symbol, exitSide.toLowerCase(), actualExecutedQty);
            exitOrder = { ...krakenResult, executedQty: actualExecutedQty };
          } else if (exchangeName === "nexo") {
            const nexoResult = await placeNexoOrder(apiKey, apiSecret, symbol, exitSide.toLowerCase(), actualExecutedQty);
            exitOrder = { ...nexoResult, executedQty: actualExecutedQty };
          }
          
          if (exitOrder) {
            console.log(`Exit order placed: ${exitOrder.orderId}, avg price: ${exitOrder.avgPrice}`);
            tradeResult.exitPrice = exitOrder.avgPrice || exitPrice;
            
            // Calculate real P&L
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
          } else {
            // Exit failed after retries - log orphaned position for manual cleanup
            console.error(`EXIT ORDER FAILED for ${actualExecutedQty} ${symbol} - ORPHANED POSITION. Use Close All Positions to recover.`);
            tradeResult.exitPrice = exitPrice;
            tradeResult.pnl = 0; // Unknown P&L since position still open
          }
        }
      } catch (exchangeError) {
        console.error("Exchange order failed:", exchangeError);

        const message =
          exchangeError instanceof Error
            ? exchangeError.message
            : typeof exchangeError === "string"
              ? exchangeError
              : JSON.stringify(exchangeError);

        // In LIVE mode, surface a detailed error to the client instead of a generic failure
        if (!isSandbox) {
          return new Response(
            JSON.stringify({
              error: "Real trade execution failed",
              reason:
                message ||
                "Exchange API error - check exchange connection and API permissions",
              cannotFallbackToSimulation: true,
              exchange: selectedExchange.exchange_name,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // In DEMO mode (should not normally reach here), fall back to simulation
        tradeResult.simulated = true;
        tradeResult.realTrade = false;
      }
    }

    // ============ LIVE MODE: NO FALLBACK TO SIMULATION ============
    if (!isSandbox && !tradeResult.realTrade) {
      console.error('❌ LIVE MODE FAILURE: Real trade did not execute');
      console.error('   This is NOT a simulation - returning error to client');
      return new Response(JSON.stringify({ 
        error: "Real trade execution failed",
        reason: "Exchange API error - check exchange connection and API permissions",
        cannotFallbackToSimulation: true,
        exchange: selectedExchange.exchange_name
      }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // ============ SIMULATED TRADE (DEMO MODE ONLY) ============
    if (isSandbox && !tradeResult.realTrade) {
      console.log('----------------------------------------');
      console.log(`🟢 DEMO SIMULATION for ${pair}`);
      console.log('----------------------------------------');
      
      // Simulate trade outcome (70% win rate)
      const isWin = Math.random() < 0.70;
      const priceMove = currentPrice * expectedMove * (isWin ? 1 : -1.2);
      tradeResult.exitPrice = direction === 'long' 
        ? currentPrice + priceMove 
        : currentPrice - priceMove;
      
      const priceDiff = direction === 'long'
        ? tradeResult.exitPrice - currentPrice
        : currentPrice - tradeResult.exitPrice;
      tradeResult.pnl = (priceDiff / currentPrice) * positionSize * leverage;
      tradeResult.simulated = true;
    }

    // Record the trade
    await supabase.from("trades").insert({
      user_id: user.id,
      pair,
      direction,
      entry_price: tradeResult.entryPrice,
      exit_price: tradeResult.exitPrice,
      amount: positionSize,
      leverage,
      profit_loss: tradeResult.pnl,
      profit_percentage: (tradeResult.pnl / positionSize) * 100,
      exchange_name: selectedExchange.exchange_name,
      is_sandbox: isSandbox,
      status: "closed",
      closed_at: new Date().toISOString(),
    });

    // Update bot metrics
    if (bot) {
      const newPnl = (bot.current_pnl || 0) + tradeResult.pnl;
      const newTrades = (bot.trades_executed || 0) + 1;
      const isWin = tradeResult.pnl > 0;
      const wins = Math.round(((bot.hit_rate || 0) / 100) * (bot.trades_executed || 0)) + (isWin ? 1 : 0);
      const newHitRate = (wins / newTrades) * 100;

      await supabase.from("bot_runs").update({
        current_pnl: newPnl,
        trades_executed: newTrades,
        hit_rate: newHitRate,
      }).eq("id", botId);
    }

    console.log(`Trade executed: ${pair} ${direction} on ${selectedExchange.exchange_name}, P&L: $${tradeResult.pnl.toFixed(2)}, Real: ${tradeResult.realTrade}`);

    return new Response(JSON.stringify(tradeResult), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Bot trade execution error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
