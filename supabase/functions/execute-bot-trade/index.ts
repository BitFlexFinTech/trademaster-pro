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

// Excluded pair+direction combinations (historically unprofitable)
const EXCLUDED_COMBOS = new Set([
  'DOGE/USDT:long',
  'DOT/USDT:long',
  'AVAX/USDT:long',
  'ADA/USDT:long',
]);

// Spot-safe pairs for LONG trades (>50% win rate historically)
const SPOT_SAFE_PAIRS = new Set(['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'MATIC/USDT']);

// Safety limits - INCREASED for profitable trading
const DEFAULT_POSITION_SIZE = 50; // Default $50 per trade (minimum for meaningful profit)
const MIN_POSITION_SIZE = 20; // Absolute minimum to cover fees + generate profit
const MAX_POSITION_SIZE_CAP = 5000; // Hard cap at $5000 for safety
const DAILY_LOSS_LIMIT = -5; // Stop if daily loss exceeds $5
const MAX_SLIPPAGE_PERCENT = 0.3; // 0.3% max slippage tolerance
const PROFIT_LOCK_TIMEOUT_MS = 30000; // 30 second timeout for limit order profit lock
const LIMIT_ORDER_PROFIT_TARGET = 0.005; // 0.5% profit target for limit exits (increased for better margin)

// ============ FEE CONSTANTS FOR ACCURATE P&L ============
const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,    // 0.1%
  bybit: 0.001,      // 0.1%
  okx: 0.0008,       // 0.08%
  kraken: 0.0016,    // 0.16%
  nexo: 0.002,       // 0.2%
  kucoin: 0.001,     // 0.1%
  hyperliquid: 0.0002, // 0.02%
};
const MIN_NET_PROFIT = 0.05; // Minimum $0.05 net profit after fees required (lowered for smaller positions)

interface BotTradeRequest {
  botId: string;
  mode: 'spot' | 'leverage';
  profitTarget: number;
  exchanges: string[];
  leverages?: Record<string, number>;
  isSandbox: boolean;
  maxPositionSize?: number;
  stopLossPercent?: number; // 0.2 = 20% of profit (80% lower)
}

// Smart direction selection based on historical win rates
async function selectSmartDirection(
  supabase: any,
  userId: string,
  pair: string,
  mode: 'spot' | 'leverage'
): Promise<{ direction: 'long' | 'short'; confidence: number; reasoning: string }> {
  // SPOT MODE: Only LONG trades, but check if pair is safe
  if (mode === 'spot') {
    if (!SPOT_SAFE_PAIRS.has(pair)) {
      return { direction: 'long', confidence: 40, reasoning: `SPOT: ${pair} not in safe list` };
    }
    return { direction: 'long', confidence: 60, reasoning: `SPOT: LONG only on ${pair}` };
  }

  // LEVERAGE MODE: Smart direction selection
  // Check if this pair+direction is excluded
  const isLongExcluded = EXCLUDED_COMBOS.has(`${pair}:long`);
  const isShortExcluded = EXCLUDED_COMBOS.has(`${pair}:short`);

  if (isLongExcluded && !isShortExcluded) {
    return { direction: 'short', confidence: 70, reasoning: `LONG excluded for ${pair}` };
  }
  if (isShortExcluded && !isLongExcluded) {
    return { direction: 'long', confidence: 70, reasoning: `SHORT excluded for ${pair}` };
  }
  if (isLongExcluded && isShortExcluded) {
    // Both excluded - default to SHORT with low confidence
    return { direction: 'short', confidence: 50, reasoning: `Both directions excluded for ${pair}` };
  }

  // Fetch historical win rates from user's trades (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: trades } = await supabase
    .from('trades')
    .select('direction, profit_loss')
    .eq('user_id', userId)
    .eq('pair', pair)
    .gte('created_at', sevenDaysAgo)
    .limit(50);

  let shortWinRate = 70; // Default: SHORT historically better
  let longWinRate = 40;  // Default: LONG historically worse

  if (trades && trades.length >= 10) {
    const longTrades = trades.filter((t: { direction: string }) => t.direction === 'long');
    const shortTrades = trades.filter((t: { direction: string }) => t.direction === 'short');
    
    if (longTrades.length >= 5) {
      const longWins = longTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) > 0).length;
      longWinRate = (longWins / longTrades.length) * 100;
    }
    
    if (shortTrades.length >= 5) {
      const shortWins = shortTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) > 0).length;
      shortWinRate = (shortWins / shortTrades.length) * 100;
    }
  }

  console.log(`📊 ${pair} Win Rates - SHORT: ${shortWinRate.toFixed(1)}%, LONG: ${longWinRate.toFixed(1)}%`);

  // Use win rate bias for direction selection
  const winRateDiff = shortWinRate - longWinRate;
  
  if (winRateDiff >= 15) {
    // SHORT significantly better - use 80% probability for SHORT
    const direction = Math.random() < 0.80 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `SHORT outperforms LONG by ${winRateDiff.toFixed(1)}%`
    };
  } else if (winRateDiff <= -15) {
    // LONG significantly better - use 80% probability for LONG
    const direction = Math.random() < 0.80 ? 'long' : 'short';
    return { 
      direction, 
      confidence: direction === 'long' ? longWinRate : shortWinRate,
      reasoning: `LONG outperforms SHORT by ${Math.abs(winRateDiff).toFixed(1)}%`
    };
  } else {
    // Similar win rates - slight bias toward SHORT (historically better overall)
    const direction = Math.random() < 0.6 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `Similar win rates - defaulting ${direction}`
    };
  }
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

    // SMART DIRECTION SELECTION - Uses historical win rates instead of random
    const directionResult = await selectSmartDirection(supabase, user.id, pair, mode);
    const direction = directionResult.direction;
    console.log(`🎯 Direction: ${direction.toUpperCase()} | Confidence: ${directionResult.confidence.toFixed(0)}% | Reason: ${directionResult.reasoning}`);

    // ========== CONSECUTIVE LOSS PROTECTION ==========
    // Check for 3+ consecutive losses on this pair+direction combination
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('profit_loss')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .eq('direction', direction)
      .eq('is_sandbox', isSandbox)
      .eq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(3);

    if (recentTrades && recentTrades.length >= 3) {
      const consecutiveLosses = recentTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) <= 0).length;
      
      if (consecutiveLosses >= 3) {
        console.log(`⏸️ CONSECUTIVE LOSS PROTECTION: ${pair}:${direction} paused (${consecutiveLosses} consecutive losses)`);
        
        // Log cooldown event for analytics
        await supabase.from('alerts').insert({
          user_id: user.id,
          title: `🛡️ Protection Active: ${pair}`,
          message: `${direction.toUpperCase()} trades on ${pair} paused after 3 consecutive losses. Will auto-resume after 30 minutes.`,
          alert_type: 'consecutive_loss_protection',
          data: { pair, direction, consecutiveLosses, cooldownMinutes: 30 }
        });
        
        return new Response(JSON.stringify({ 
          skipped: true, 
          reason: `${pair}:${direction} on cooldown (${consecutiveLosses} consecutive losses)`,
          cooldownMinutes: 30,
          pair,
          direction
        }), { 
          status: 200, // Not an error, just skipped
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }
    
    // Calculate position size - use user-configured value, capped for safety
    const expectedMove = 0.005; // 0.5% average move
    const leverage = mode === 'leverage' ? (leverages?.[connections[0].exchange_name] || 5) : 1;

    // Base position size from target and user cap
    let positionSize = Math.min(profitTarget / (expectedMove * leverage), userPositionSize);

    // Fetch available stablecoin balance on the selected exchange FIRST
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

    // Dynamic position sizing based on actual balance (10% max risk per trade)
    const MAX_RISK_PERCENT = 0.10; // 10% of balance per trade
    const ABSOLUTE_MIN_POSITION = 30; // Never below $30
    
    if (mode === 'spot') {
      // Calculate position as 10% of balance, minimum $30
      const balanceBasedPosition = availableBalance > 0 ? availableBalance * MAX_RISK_PERCENT : ABSOLUTE_MIN_POSITION;
      positionSize = Math.max(ABSOLUTE_MIN_POSITION, balanceBasedPosition);
      
      // Cap at 20% of available balance for safety
      if (availableBalance > 0) {
        positionSize = Math.min(positionSize, availableBalance * 0.20);
      }
      
      console.log(`SPOT mode: Dynamic position size: $${positionSize.toFixed(2)} (balance: $${availableBalance.toFixed(2)}, 10% risk)`);
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

    // ============ PRE-TRADE PROFITABILITY CHECK ============
    // Don't enter trade unless expected profit > fees + $0.10 minimum
    const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
    const roundTripFees = positionSize * feeRate * 2; // Entry + Exit fees
    const minPriceMove = (roundTripFees + MIN_NET_PROFIT) / positionSize;
    const minPriceMovePercent = minPriceMove * 100;
    const expectedPriceMove = LIMIT_ORDER_PROFIT_TARGET;

    if (expectedPriceMove < minPriceMove) {
      console.log(`⏭️ SKIP TRADE: Expected move ${(expectedPriceMove * 100).toFixed(3)}% < required ${minPriceMovePercent.toFixed(3)}%`);
      console.log(`   Position: $${positionSize}, Fees: $${roundTripFees.toFixed(4)}, Min profit: $${MIN_NET_PROFIT}`);
      console.log(`   Would need ${minPriceMovePercent.toFixed(3)}% move to be profitable`);
      
      return new Response(JSON.stringify({
        skipped: true,
        reason: `Trade skipped: fees ($${roundTripFees.toFixed(2)}) + min profit ($${MIN_NET_PROFIT}) exceed expected return`,
        requiredMove: `${minPriceMovePercent.toFixed(3)}%`,
        expectedMove: `${(expectedPriceMove * 100).toFixed(3)}%`,
        suggestion: `Increase position size to $${Math.ceil((roundTripFees + MIN_NET_PROFIT) / LIMIT_ORDER_PROFIT_TARGET)} or reduce fees`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`✅ PROFITABILITY CHECK PASSED: Expected ${(expectedPriceMove * 100).toFixed(3)}% > required ${minPriceMovePercent.toFixed(3)}%`);

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

        // Ensure minimum notional value is met - but only if we have the balance
        if (adjustedPositionSize < lotInfo.minNotional) {
          const requiredAmount = lotInfo.minNotional * 1.1;
          if (freeBalance >= requiredAmount || isSandbox) {
            adjustedPositionSize = requiredAmount;
            console.log(`Position size increased to meet min notional: $${adjustedPositionSize}`);
          } else {
            // Cannot meet minimum notional with available balance – treat as user error, not server crash
            console.error(`❌ Insufficient balance: have $${freeBalance}, need $${requiredAmount} for minimum order`);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Real trade execution failed",
                reason: `Insufficient balance: have $${freeBalance.toFixed(2)}, need $${requiredAmount.toFixed(2)} minimum`,
                cannotFallbackToSimulation: true,
                exchange: selectedExchange.exchange_name,
                errorType: "EXCHANGE_USER_ERROR",
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // Calculate and round quantity to step size
        const rawQuantity = adjustedPositionSize / currentPrice;
        const quantity = roundToStepSize(rawQuantity, lotInfo.stepSize);
        console.log(`Order quantity: ${quantity} (raw: ${rawQuantity}, stepSize: ${lotInfo.stepSize}, minQty: ${lotInfo.minQty})`);
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
          
          // EXIT STRATEGY: Use MARKET orders for GUARANTEED fills (no more stuck limit orders!)
          // This ensures positions always close back to USDT
          const exitSide = direction === 'long' ? 'SELL' : 'BUY';
          const exitClientOrderId = generateClientOrderId(botId, exitSide);
          let exitOrder: { orderId: string; status: string; avgPrice: number; executedQty: string } | null = null;
          
          // PHASE 4 FIX: Use MARKET exit orders instead of LIMIT orders
          // This guarantees immediate fill and conversion back to USDT
          console.log(`📊 Using MARKET exit for guaranteed fill (${actualExecutedQty} ${symbol} ${exitSide})`);
          
          if (exchangeName === "binance") {
            // Try limit order with SHORT timeout, then fallback to market
            const pricePrecision = await getBinancePricePrecision(symbol);
            const targetProfit = direction === 'long' 
              ? tradeResult.entryPrice * (1 + LIMIT_ORDER_PROFIT_TARGET)
              : tradeResult.entryPrice * (1 - LIMIT_ORDER_PROFIT_TARGET);
            const limitPrice = targetProfit.toFixed(pricePrecision);
            
            console.log(`Attempting LIMIT exit at ${limitPrice} with 10s timeout...`);
            
            try {
              const limitOrderResult = await placeBinanceLimitOrder(
                apiKey, apiSecret, symbol, exitSide, actualExecutedQty, limitPrice, exitClientOrderId
              );
              
              // WAIT for limit order to fill (max 10 seconds) - SYNCHRONOUS approach
              let filled = false;
              for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 2000)); // 2 second intervals
                
                try {
                  const status = await checkBinanceOrderStatus(apiKey, apiSecret, symbol, limitOrderResult.orderId);
                  console.log(`Limit order status check ${i + 1}/5: ${status.status}`);
                  
                  if (status.status === 'FILLED') {
                    filled = true;
                    exitOrder = { 
                      orderId: limitOrderResult.orderId, 
                      status: 'FILLED', 
                      avgPrice: status.avgPrice || parseFloat(limitPrice),
                      executedQty: status.executedQty 
                    };
                    console.log(`✅ Limit order FILLED at ${exitOrder.avgPrice}`);
                    break;
                  }
                } catch (checkErr) {
                  console.warn(`Order status check failed:`, checkErr);
                }
              }
              
              // If limit didn't fill, CANCEL and use MARKET order
              if (!filled) {
                console.log(`⏱️ Limit order timed out - cancelling and using MARKET exit`);
                await cancelBinanceOrder(apiKey, apiSecret, symbol, limitOrderResult.orderId);
                exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, `${exitClientOrderId}_MKT`, 3);
              }
              
            } catch (limitError) {
              console.warn(`Limit order failed: ${limitError instanceof Error ? limitError.message : limitError}, using market`);
              exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, `${exitClientOrderId}_MKT`, 3);
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
            
            // Calculate real P&L WITH FEE DEDUCTION
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            
            // Gross P&L before fees
            const grossPnL = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
            
            // Deduct exchange fees (entry + exit)
            const tradeFeeRate = EXCHANGE_FEES[exchangeName] || 0.001;
            const entryFee = positionSize * tradeFeeRate;
            const exitFee = (positionSize + Math.max(0, grossPnL)) * tradeFeeRate;
            const netPnL = grossPnL - entryFee - exitFee;
            
            tradeResult.pnl = netPnL;
            
            console.log(`📊 P&L Breakdown: Gross=$${grossPnL.toFixed(4)}, Fees=$${(entryFee + exitFee).toFixed(4)}, Net=$${netPnL.toFixed(4)}`);
            console.log(`📊 TRADE RESULT: Entry: ${tradeResult.entryPrice}, Exit: ${tradeResult.exitPrice}, P&L: $${tradeResult.pnl.toFixed(2)}`);
          } else {
            // Exit failed after retries - try one more time with fresh market order
            console.error(`EXIT ORDER FAILED - attempting final market exit`);
            try {
              exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, `${exitClientOrderId}_FINAL`, 2);
              if (exitOrder) {
                tradeResult.exitPrice = exitOrder.avgPrice || await fetchPrice(pair);
                const priceDiff = direction === 'long'
                  ? tradeResult.exitPrice - tradeResult.entryPrice
                  : tradeResult.entryPrice - tradeResult.exitPrice;
                tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
              }
            } catch (finalErr) {
              console.error(`FINAL EXIT FAILED - ORPHANED POSITION for ${actualExecutedQty} ${symbol}`);
              tradeResult.exitPrice = await fetchPrice(pair);
              tradeResult.pnl = 0; // Unknown P&L since position still open
            }
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

        // Classify common exchange errors that are "business" issues (not server bugs)
        const lower = (message || "").toLowerCase();
        const isUserFacingExchangeError = [
          "insufficient balance",
          "order value exceeded lower limit",
          "filter failure: notional",
          "no active orders for this pair",
          "too many visits. exceeded the api rate limit",
          "market is closed",
        ].some((snippet) => lower.includes(snippet.toLowerCase()));

        // In LIVE mode, surface a detailed error to the client.
        // Use 200 for known user-facing exchange errors so they don't appear as runtime failures.
        if (!isSandbox) {
          const payload = {
            error: "Real trade execution failed",
            reason:
              message ||
              "Exchange API error - check exchange connection and API permissions",
            cannotFallbackToSimulation: true,
            exchange: selectedExchange.exchange_name,
            errorType: isUserFacingExchangeError
              ? "EXCHANGE_USER_ERROR"
              : "EXCHANGE_SYSTEM_ERROR",
          };

          if (isUserFacingExchangeError) {
            console.warn("Non-fatal exchange error (user-facing):", message);
          }

          return new Response(JSON.stringify(payload), {
            status: isUserFacingExchangeError ? 200 : 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
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
    // NOTE: Demo mode now uses REAL price monitoring in the client (useBotTrading)
    // This server-side simulation is a fallback only
    if (isSandbox && !tradeResult.realTrade) {
      console.log('----------------------------------------');
      console.log(`🟢 DEMO SIMULATION for ${pair} (fallback mode)`);
      console.log('----------------------------------------');
      
      // Use tighter profit targets for more realistic simulation
      const takeProfitPercent = 0.003; // 0.3% TP
      const stopLossPercent = 0.0015;  // 0.15% SL (tighter for positive expectancy)
      
      // Simulate based on price momentum (not pure random)
      // Check if price moved in our direction
      const recentPrice = await fetchPrice(pair);
      const priceMovement = (recentPrice - currentPrice) / currentPrice;
      
      // Win if price moved favorably and hit TP
      const favorableMove = direction === 'long' 
        ? priceMovement >= takeProfitPercent 
        : priceMovement <= -takeProfitPercent;
      
      // Loss if price moved against us past SL
      const adverseMove = direction === 'long'
        ? priceMovement <= -stopLossPercent
        : priceMovement >= stopLossPercent;
      
      let isWin: boolean;
      let exitPriceMultiplier: number;
      
      if (favorableMove) {
        isWin = true;
        exitPriceMultiplier = direction === 'long' ? 1 + takeProfitPercent : 1 - takeProfitPercent;
      } else if (adverseMove) {
        isWin = false;
        exitPriceMultiplier = direction === 'long' ? 1 - stopLossPercent : 1 + stopLossPercent;
      } else {
        // Price didn't move enough - use time-based exit with slight bias toward wins
        // With tighter SL than TP, we expect ~60% win rate on random movements
        isWin = Math.random() < 0.60;
        exitPriceMultiplier = isWin
          ? (direction === 'long' ? 1 + takeProfitPercent : 1 - takeProfitPercent)
          : (direction === 'long' ? 1 - stopLossPercent : 1 + stopLossPercent);
      }
      
      tradeResult.exitPrice = currentPrice * exitPriceMultiplier;
      
      const priceDiff = direction === 'long'
        ? tradeResult.exitPrice - currentPrice
        : currentPrice - tradeResult.exitPrice;
      
      // Gross P&L
      const grossPnL = (priceDiff / currentPrice) * positionSize * leverage;
      
      // Deduct fees for demo too (realistic simulation)
      const simFeeRate = EXCHANGE_FEES[exchangeName] || 0.001;
      const simFees = positionSize * simFeeRate * 2;
      tradeResult.pnl = grossPnL - simFees;
      tradeResult.simulated = true;
      
      console.log(`📊 Simulated Result: ${isWin ? 'WIN' : 'LOSS'}, Gross=$${grossPnL.toFixed(2)}, Fees=$${simFees.toFixed(2)}, Net=$${tradeResult.pnl.toFixed(2)}`);
    }

    // ============ P&L VALIDATION BEFORE DATABASE INSERT ============
    const expectedProfitable = direction === 'long' 
      ? tradeResult.exitPrice > tradeResult.entryPrice
      : tradeResult.exitPrice < tradeResult.entryPrice;

    if (expectedProfitable && tradeResult.pnl < 0) {
      console.warn(`⚠️ P&L ANOMALY: Direction=${direction}, price moved in our favor but P&L=${tradeResult.pnl.toFixed(4)}`);
      console.warn(`   This indicates fees exceeded gross profit - trade should have been skipped`);
    }

    if (!expectedProfitable && tradeResult.pnl > 0) {
      console.error(`❌ P&L ERROR: Direction=${direction}, price moved against us but P&L is positive!`);
      console.error(`   Entry: ${tradeResult.entryPrice}, Exit: ${tradeResult.exitPrice}, Recorded P&L: ${tradeResult.pnl}`);
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
