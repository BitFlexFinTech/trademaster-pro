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

// Fetch free USDT balance from Bybit account
async function getBybitFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const params = `accountType=UNIFIED&coin=USDT`;
    const signPayload = timestamp + apiKey + recvWindow + params;
    const signature = await hmacSha256(apiSecret, signPayload);

    const response = await fetch(
      `https://api.bybit.com/v5/account/wallet-balance?${params}`,
      {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
      },
    );

    const data = await response.json();
    if (data.retCode !== 0) {
      console.error("Failed to fetch Bybit balance:", data.retMsg);
      return 0;
    }

    // Parse UNIFIED account balance
    const accounts = data.result?.list || [];
    for (const account of accounts) {
      const coins = account.coin || [];
      const usdt = coins.find((c: { coin: string }) => c.coin === "USDT");
      if (usdt) {
        const free = parseFloat(usdt.availableToWithdraw || usdt.walletBalance || "0");
        return Number.isFinite(free) ? free : 0;
      }
    }
    return 0;
  } catch (e) {
    console.error("Error fetching Bybit account balance:", e);
    return 0;
  }
}

// Get Bybit lot size info
async function getBybitLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`);
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list?.length) {
      return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
    }
    
    const info = data.result.list[0];
    return {
      stepSize: info.lotSizeFilter?.basePrecision || '0.0001',
      minQty: info.lotSizeFilter?.minOrderQty || '0.0001',
      minNotional: parseFloat(info.lotSizeFilter?.minOrderAmt || '5') || 5
    };
  } catch (e) {
    console.error('Failed to fetch Bybit lot size:', e);
    return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
  }
}

// Top 10 liquid USDT pairs
const TOP_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'
];

// Safety limits - INCREASED for profitable trading
const DEFAULT_POSITION_SIZE = 50; // Default $50 per trade (minimum for meaningful profit)
const MIN_POSITION_SIZE = 20; // Absolute minimum to cover fees + generate profit
const MAX_POSITION_SIZE_CAP = 5000; // Hard cap at $5000 for safety
const DAILY_LOSS_LIMIT = -5; // Stop if daily loss exceeds $5
const MAX_SLIPPAGE_PERCENT = 0.3; // 0.3% max slippage tolerance
const PROFIT_LOCK_TIMEOUT_MS = 30000; // 30 second timeout for limit order profit lock
const LIMIT_ORDER_PROFIT_TARGET = 0.003; // 0.3% profit target for limit exits

interface BotTradeRequest {
  botId: string;
  mode: 'spot' | 'leverage';
  profitTarget: number;
  exchanges: string[];
  leverages?: Record<string, number>;
  isSandbox: boolean;
  maxPositionSize?: number; // NEW: user-configurable position size
}

// Generate unique clientOrderId for idempotency
function generateClientOrderId(botId: string, side: string): string {
  return `GB_${botId.slice(0, 8)}_${side}_${Date.now()}`;
}

// ============ EXCHANGE ORDER PLACEMENT FUNCTIONS ============

// Place Binance MARKET order with clientOrderId for idempotency
async function placeBinanceOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  clientOrderId?: string
): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string }> {
  const timestamp = Date.now();
  let params = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
  
  // Add clientOrderId for idempotency if provided
  if (clientOrderId) {
    params += `&newClientOrderId=${clientOrderId}`;
  }
  
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    // Check for duplicate order error
    if (error.code === -2010 || error.msg?.includes('Duplicate')) {
      console.warn(`Duplicate order detected for clientOrderId: ${clientOrderId}`);
    }
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
  
  return { orderId: data.orderId.toString(), status: data.status, avgPrice, executedQty: data.executedQty || quantity };
}

// Place Binance LIMIT order for profit locking
async function placeBinanceLimitOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  price: string,
  clientOrderId?: string
): Promise<{ orderId: string; status: string }> {
  const timestamp = Date.now();
  let params = `symbol=${symbol}&side=${side}&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price}&timestamp=${timestamp}`;
  
  if (clientOrderId) {
    params += `&newClientOrderId=${clientOrderId}`;
  }
  
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.msg || "Binance limit order failed");
  }
  
  const data = await response.json();
  return { orderId: data.orderId.toString(), status: data.status };
}

// Cancel Binance order
async function cancelBinanceOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  orderId: string
): Promise<boolean> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "DELETE",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  return response.ok;
}

// Check Binance order status
async function checkBinanceOrderStatus(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  orderId: string
): Promise<{ status: string; executedQty: string; avgPrice: number }> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    throw new Error("Failed to check order status");
  }
  
  const data = await response.json();
  return { 
    status: data.status, 
    executedQty: data.executedQty,
    avgPrice: parseFloat(data.price) || 0
  };
}

// Get price precision for limit orders
async function getBinancePricePrecision(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    if (!data.symbols || data.symbols.length === 0) return 2;
    
    const priceFilter = data.symbols[0].filters.find((f: { filterType: string }) => f.filterType === 'PRICE_FILTER');
    const tickSize = parseFloat(priceFilter?.tickSize || '0.01');
    return Math.max(0, -Math.floor(Math.log10(tickSize)));
  } catch {
    return 2;
  }
}

// Helper: Place Binance order with retry logic and clientOrderId
async function placeBinanceOrderWithRetry(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  clientOrderId: string,
  maxRetries: number = 3
): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use unique clientOrderId per attempt to avoid duplicates
      const attemptClientId = `${clientOrderId}_${attempt}`;
      const result = await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity, attemptClientId);
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

    
    // ============ FIND SUITABLE EXCHANGE ============
    // Try each connected exchange to find one with sufficient balance
    let selectedExchange = null;
    let exchangeName = '';
    let apiKey = '';
    let apiSecret = '';
    let passphrase = '';
    let freeBalance = 0;
    let lotInfo = { stepSize: '0.00001', minQty: '0.00001', minNotional: 5 };
    const symbol = pair.replace("/", "");
    const insufficientBalanceExchanges: string[] = [];
    
    for (const exchange of connections) {
      const exName = exchange.exchange_name.toLowerCase();
      const hasApiCredentials = exchange.encrypted_api_key &&
        exchange.encrypted_api_secret &&
        exchange.encryption_iv;
      
      if (!hasApiCredentials) {
        console.log(`Skipping ${exchange.exchange_name}: missing API credentials`);
        continue;
      }
      
      if (!isSandbox && encryptionKey) {
        try {
          const decryptedKey = await decryptSecret(exchange.encrypted_api_key, exchange.encryption_iv, encryptionKey);
          const decryptedSecret = await decryptSecret(exchange.encrypted_api_secret, exchange.encryption_iv, encryptionKey);
          const decryptedPassphrase = exchange.encrypted_passphrase 
            ? await decryptSecret(exchange.encrypted_passphrase, exchange.encryption_iv, encryptionKey)
            : "";
          
          // Check balance on this exchange
          if (exName === "binance") {
            const exchangeLotInfo = await getBinanceLotSize(symbol);
            const balance = await getBinanceFreeStableBalance(decryptedKey, decryptedSecret);
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${exchangeLotInfo.minNotional}`);
            
            const minRequired = exchangeLotInfo.minNotional * 1.1;
            if (balance >= minRequired) {
              // This exchange has sufficient balance
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = exchangeLotInfo;
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else if (exName === "bybit") {
            // Check Bybit balance
            const bybitLotInfo = await getBybitLotSize(symbol);
            const balance = await getBybitFreeStableBalance(decryptedKey, decryptedSecret);
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${bybitLotInfo.minNotional}`);
            
            const minRequired = bybitLotInfo.minNotional * 1.1;
            if (balance >= minRequired) {
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = bybitLotInfo;
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else {
            // For other exchanges (OKX, Kraken, Nexo), skip if we don't have balance check
            console.log(`Skipping ${exchange.exchange_name}: balance check not implemented, will try after Binance/Bybit`);
            insufficientBalanceExchanges.push(`${exchange.exchange_name} (balance check not implemented)`);
          }
        } catch (e) {
          console.error(`Failed to check ${exchange.exchange_name}:`, e);
        }
      }
    }
    
    // If no exchange with sufficient balance found in LIVE mode
    if (!isSandbox && !selectedExchange) {
      const message = insufficientBalanceExchanges.length > 0
        ? `All exchanges have insufficient balance: ${insufficientBalanceExchanges.join(', ')}. Minimum required: $5 USDT.`
        : "No exchanges with valid API credentials found.";
      
      console.error(`❌ ${message}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient balance on all exchanges",
          reason: message,
          insufficientExchanges: insufficientBalanceExchanges,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    
    // Fallback to first exchange for sandbox mode
    if (!selectedExchange) {
      selectedExchange = connections[0];
      exchangeName = selectedExchange.exchange_name.toLowerCase();
    }
    
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
    const canExecuteRealTrade = !isSandbox && encryptionKey && hasApiCredentials && apiKey && apiSecret;
    
    console.log('----------------------------------------');
    console.log(`🔍 TRADE EXECUTION CHECK:`);
    console.log(`   isSandbox: ${isSandbox}`);
    console.log(`   Selected Exchange: ${selectedExchange.exchange_name}`);
    console.log(`   Free Balance: $${freeBalance}`);
    console.log(`   => CAN EXECUTE REAL TRADE: ${canExecuteRealTrade}`);
    console.log('----------------------------------------');

    // In LIVE mode, if we cannot execute a real trade, return a clear error
    if (!isSandbox && !canExecuteRealTrade) {
      console.error('❌ Live mode enabled but no valid API credentials or encryption key.');
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cannot execute live trade",
          reason: "Live mode requires valid exchange API credentials. Please verify your exchange connection.",
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
        const side = direction === 'long' ? 'BUY' : 'SELL';
        
        console.log(`Lot size info for ${symbol}:`, lotInfo);

        // Determine final position size for order
        let adjustedPositionSize = positionSize;

        // Cap by free balance with 20% buffer for fees
        const maxByFree = freeBalance * 0.8;
        adjustedPositionSize = Math.min(adjustedPositionSize, maxByFree);
        console.log(`Adjusted position size by free balance: $${adjustedPositionSize} (max by free: $${maxByFree})`);

        // Ensure minimum notional value is met - but only if we have the balance!
        if (adjustedPositionSize < lotInfo.minNotional) {
          const requiredAmount = lotInfo.minNotional * 1.1;
          if (freeBalance >= requiredAmount) {
            adjustedPositionSize = requiredAmount;
            console.log(`Position size increased to meet min notional: $${adjustedPositionSize}`);
          } else {
            // Cannot meet minimum notional with available balance
            console.error(`❌ Insufficient balance: have $${freeBalance}, need $${requiredAmount} for minimum order`);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Real trade execution failed",
                reason: `Insufficient balance: have $${freeBalance.toFixed(2)}, need $${requiredAmount.toFixed(2)} minimum`,
                cannotFallbackToSimulation: true,
                exchange: selectedExchange.exchange_name,
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // Calculate and round quantity to step size
        const rawQuantity = adjustedPositionSize / currentPrice;
        const quantity = roundToStepSize(rawQuantity, lotInfo.stepSize);
        console.log(`Order quantity: ${quantity} (raw: ${rawQuantity}, stepSize: ${lotInfo.stepSize}, minQty: ${lotInfo.minQty})`);

        let entryOrder: { orderId: string; status: string; avgPrice: number; executedQty: string } | null = null;

        // Generate clientOrderId for idempotency
        const entryClientOrderId = generateClientOrderId(botId, side);
        console.log(`Using clientOrderId for entry: ${entryClientOrderId}`);

        // Place ENTRY order with clientOrderId
        if (exchangeName === "binance") {
          entryOrder = await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity, entryClientOrderId);
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

          // Check slippage on entry
          const entrySlippage = Math.abs((entryOrder.avgPrice - currentPrice) / currentPrice) * 100;
          if (entrySlippage > MAX_SLIPPAGE_PERCENT) {
            console.warn(`⚠️ HIGH ENTRY SLIPPAGE: ${entrySlippage.toFixed(3)}% (limit: ${MAX_SLIPPAGE_PERCENT}%)`);
          }
          
          // EXIT STRATEGY: Profit-locking with limit order (Binance only for now)
          const exitSide = direction === 'long' ? 'SELL' : 'BUY';
          const exitClientOrderId = generateClientOrderId(botId, exitSide);
          let exitOrder: { orderId: string; status: string; avgPrice: number; executedQty: string } | null = null;
          
          if (exchangeName === "binance") {
            // Try LIMIT order for profit locking first
            const pricePrecision = await getBinancePricePrecision(symbol);
            const targetProfit = direction === 'long' 
              ? tradeResult.entryPrice * (1 + LIMIT_ORDER_PROFIT_TARGET)
              : tradeResult.entryPrice * (1 - LIMIT_ORDER_PROFIT_TARGET);
            const limitPrice = targetProfit.toFixed(pricePrecision);
            
            console.log(`Placing LIMIT exit order at ${limitPrice} (${LIMIT_ORDER_PROFIT_TARGET * 100}% profit target)`);
            
            try {
              const limitOrderResult = await placeBinanceLimitOrder(
                apiKey, apiSecret, symbol, exitSide, actualExecutedQty, limitPrice, exitClientOrderId
              );
              
              // Monitor limit order for fill or timeout
              const startTime = Date.now();
              let orderFilled = false;
              
              while (Date.now() - startTime < PROFIT_LOCK_TIMEOUT_MS) {
                await new Promise(r => setTimeout(r, 1000)); // Check every 1 second
                const orderStatus = await checkBinanceOrderStatus(apiKey, apiSecret, symbol, limitOrderResult.orderId);
                
                if (orderStatus.status === 'FILLED') {
                  console.log(`✅ LIMIT order FILLED at profit target!`);
                  exitOrder = { 
                    orderId: limitOrderResult.orderId, 
                    status: 'FILLED', 
                    avgPrice: orderStatus.avgPrice || parseFloat(limitPrice),
                    executedQty: actualExecutedQty
                  };
                  orderFilled = true;
                  break;
                } else if (orderStatus.status === 'CANCELED' || orderStatus.status === 'REJECTED' || orderStatus.status === 'EXPIRED') {
                  console.warn(`Limit order ${orderStatus.status}, falling back to market order`);
                  break;
                }
                
                // Check if price moved against us significantly (stop-loss check)
                const checkPrice = await fetchPrice(pair);
                const lossPercent = direction === 'long'
                  ? (tradeResult.entryPrice - checkPrice) / tradeResult.entryPrice
                  : (checkPrice - tradeResult.entryPrice) / tradeResult.entryPrice;
                
                if (lossPercent > 0.005) { // 0.5% stop-loss
                  console.warn(`⚠️ Price moved against position by ${(lossPercent * 100).toFixed(2)}%, cancelling limit and exiting at market`);
                  await cancelBinanceOrder(apiKey, apiSecret, symbol, limitOrderResult.orderId);
                  break;
                }
              }
              
              if (!orderFilled) {
                // Timeout or stop-loss hit - cancel limit order and exit at market
                console.log(`Limit order timeout/stop-loss - exiting at market price`);
                await cancelBinanceOrder(apiKey, apiSecret, symbol, limitOrderResult.orderId);
              }
            } catch (limitError) {
              console.warn(`Limit order failed: ${limitError instanceof Error ? limitError.message : limitError}, falling back to market`);
            }
            
            // If limit order didn't fill, use market order with retry
            if (!exitOrder) {
              exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, exitClientOrderId, 3);
            }
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
            tradeResult.exitPrice = exitOrder.avgPrice || await fetchPrice(pair);
            
            // Check slippage on exit
            const expectedExitPrice = direction === 'long' 
              ? tradeResult.entryPrice * (1 + LIMIT_ORDER_PROFIT_TARGET)
              : tradeResult.entryPrice * (1 - LIMIT_ORDER_PROFIT_TARGET);
            const exitSlippage = Math.abs((tradeResult.exitPrice - expectedExitPrice) / expectedExitPrice) * 100;
            if (exitSlippage > MAX_SLIPPAGE_PERCENT) {
              console.warn(`⚠️ EXIT SLIPPAGE: ${exitSlippage.toFixed(3)}% from target`);
            }
            
            // Calculate real P&L
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
            
            console.log(`📊 TRADE RESULT: Entry: ${tradeResult.entryPrice}, Exit: ${tradeResult.exitPrice}, P&L: $${tradeResult.pnl.toFixed(2)}`);
          } else {
            // Exit failed after retries - log orphaned position for manual cleanup
            console.error(`EXIT ORDER FAILED for ${actualExecutedQty} ${symbol} - ORPHANED POSITION. Use Close All Positions to recover.`);
            tradeResult.exitPrice = await fetchPrice(pair);
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
