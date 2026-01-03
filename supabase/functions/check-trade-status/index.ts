import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 for Binance/Bybit
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Decrypt API credentials
async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyData = new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  const ivData = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encData = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivData }, cryptoKey, encData);
  return new TextDecoder().decode(decrypted);
}

// Exchange fee rates for P&L calculation
const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,
  bybit: 0.001,
  okx: 0.0008,
  kraken: 0.0016,
  nexo: 0.002,
  kucoin: 0.001,
  hyperliquid: 0.0002,
};

// $1 PROFIT TARGET STRATEGY
// ONLY close trades when net profit >= $1.00
// NO STOP LOSS - hold indefinitely until profitable
const DEFAULT_PROFIT_THRESHOLD = 1.00; // $1.00 NET PROFIT MINIMUM

// Stale position threshold - DISABLED for $1 strategy (hold indefinitely)
// Only used for zero-balance cleanup
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (essentially disabled)

// ============ EXCHANGE RATE LIMITS - Prevents API Bans ============
const EXCHANGE_RATE_LIMITS: Record<string, { minDelayMs: number }> = {
  binance: { minDelayMs: 100 },
  bybit: { minDelayMs: 200 },
  okx: { minDelayMs: 500 },
  kraken: { minDelayMs: 1000 },
  nexo: { minDelayMs: 500 },
  kucoin: { minDelayMs: 200 },
  hyperliquid: { minDelayMs: 100 },
};

// Track last request time per exchange
const lastRequestTime: Record<string, number> = {};

// Enforce exchange-specific rate limiting
async function enforceRateLimit(exchange: string): Promise<void> {
  const exchangeLower = exchange.toLowerCase();
  const limits = EXCHANGE_RATE_LIMITS[exchangeLower] || { minDelayMs: 500 };
  const now = Date.now();
  const lastRequest = lastRequestTime[exchangeLower] || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  const jitter = Math.random() * 30;
  const requiredDelay = limits.minDelayMs + jitter;
  
  if (timeSinceLastRequest < requiredDelay) {
    const waitTime = requiredDelay - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime[exchangeLower] = Date.now();
}

// ============ LOT_SIZE ROUNDING ============
// Fetch Binance LOT_SIZE filter for proper quantity rounding
async function getBinanceLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    if (!response.ok) {
      console.log(`Failed to get lot size for ${symbol}, using defaults`);
      return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
    }
    const data = await response.json();
    const lotSizeFilter = data.symbols?.[0]?.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
    const notionalFilter = data.symbols?.[0]?.filters?.find((f: any) => 
      f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL'
    );
    return {
      stepSize: lotSizeFilter?.stepSize || '0.00001',
      minQty: lotSizeFilter?.minQty || '0.00001',
      minNotional: parseFloat(notionalFilter?.minNotional || '10')
    };
  } catch (e) {
    console.error(`Error fetching lot size for ${symbol}:`, e);
    return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
  }
}

// Round quantity to step size (LOT_SIZE filter compliance)
function roundToStepSize(quantity: number, stepSize: string): string {
  const step = parseFloat(stepSize);
  if (step === 0) return quantity.toString();
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(quantity / step) * step;
  return rounded.toFixed(precision);
}

// Log to profit_audit_log table
async function logProfitAudit(
  supabase: any,
  entry: {
    user_id: string;
    trade_id?: string;
    action: string;
    symbol: string;
    exchange: string;
    entry_price?: number;
    current_price?: number;
    quantity?: number;
    gross_pnl?: number;
    fees?: number;
    net_pnl?: number;
    lot_size_used?: string;
    quantity_sent?: string;
    exchange_response?: any;
    success: boolean;
    error_message?: string;
    credential_found?: boolean;
    oco_status?: string;
    balance_available?: number;
  }
) {
  try {
    await supabase.from('profit_audit_log').insert(entry);
    console.log(`📝 Audit logged: ${entry.action} ${entry.symbol} success=${entry.success}`);
  } catch (e) {
    console.error('Failed to log audit entry:', e);
  }
}

// Get current price from Binance
async function getBinancePrice(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) {
      console.error(`Failed to get price for ${symbol}`);
      return 0;
    }
    const data = await response.json();
    return parseFloat(data.price) || 0;
  } catch (e) {
    console.error(`Error fetching price for ${symbol}:`, e);
    return 0;
  }
}

// Cancel a Binance OCO order
async function cancelBinanceOCO(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  orderListId: string
): Promise<boolean> {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&orderListId=${orderListId}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/orderList?${params}&signature=${signature}`,
      {
        method: "DELETE",
        headers: { "X-MBX-APIKEY": apiKey },
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to cancel OCO ${orderListId}:`, error);
      return false;
    }
    
    console.log(`Successfully cancelled OCO ${orderListId}`);
    return true;
  } catch (e) {
    console.error(`Error cancelling OCO:`, e);
    return false;
  }
}

// Place a market sell order on Binance
async function placeBinanceMarketSell(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  quantity: string
): Promise<{ success: boolean; avgPrice: number; orderId?: string }> {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
      {
        method: "POST",
        headers: { "X-MBX-APIKEY": apiKey },
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Market sell failed:`, error);
      return { success: false, avgPrice: 0 };
    }
    
    const data = await response.json();
    
    // Calculate average fill price from fills array
    let avgPrice = 0;
    if (data.fills && data.fills.length > 0) {
      let totalQty = 0;
      let totalValue = 0;
      for (const fill of data.fills) {
        const qty = parseFloat(fill.qty);
        const price = parseFloat(fill.price);
        totalQty += qty;
        totalValue += qty * price;
      }
      avgPrice = totalValue / totalQty;
    } else {
      avgPrice = parseFloat(data.price) || 0;
    }
    
    console.log(`Market sell executed at ${avgPrice}, orderId: ${data.orderId}`);
    return { success: true, avgPrice, orderId: data.orderId };
  } catch (e) {
    console.error(`Error placing market sell:`, e);
    return { success: false, avgPrice: 0 };
  }
}

// Get account balances from Binance
async function getBinanceBalance(
  apiKey: string,
  apiSecret: string,
  asset: string
): Promise<{ free: number; locked: number }> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
      {
        headers: { "X-MBX-APIKEY": apiKey },
      }
    );
    
    if (!response.ok) {
      console.error(`Failed to get account balance`);
      return { free: 0, locked: 0 };
    }
    
    const data = await response.json();
    const balance = data.balances?.find((b: any) => b.asset === asset);
    
    return {
      free: parseFloat(balance?.free || '0'),
      locked: parseFloat(balance?.locked || '0'),
    };
  } catch (e) {
    console.error(`Error getting balance:`, e);
    return { free: 0, locked: 0 };
  }
}

// Check Binance single order status
async function checkBinanceOrderStatus(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  orderId: string
): Promise<{ status: string; avgPrice: number; executedQty: string; origQty: string }> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(
    `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Binance order check failed: ${error}`);
  }
  
  const data = await response.json();
  return {
    status: data.status,
    avgPrice: parseFloat(data.avgPrice) || parseFloat(data.price) || 0,
    executedQty: data.executedQty,
    origQty: data.origQty,
  };
}

// Check Binance OCO order status
async function checkBinanceOCOStatus(
  apiKey: string,
  apiSecret: string,
  orderListId: string
): Promise<{
  status: string;
  filledLeg: 'TP' | 'SL' | 'NONE';
  executedQty: string;
  avgPrice: number;
}> {
  const timestamp = Date.now();
  const params = `orderListId=${orderListId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(
    `https://api.binance.com/api/v3/orderList?${params}&signature=${signature}`,
    {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error('OCO status check failed:', error);
    throw new Error("Failed to check OCO status");
  }
  
  const data = await response.json();
  const orders = data.orders || [];
  
  let filledLeg: 'TP' | 'SL' | 'NONE' = 'NONE';
  let executedQty = '0';
  let avgPrice = 0;
  
  console.log(`OCO ${orderListId} status: ${data.listOrderStatus}, orders:`, orders.length);
  
  for (const order of orders) {
    if (order.status === 'FILLED') {
      if (order.type === 'LIMIT_MAKER' || order.type === 'LIMIT') {
        filledLeg = 'TP';
      } else if (order.type === 'STOP_LOSS_LIMIT') {
        filledLeg = 'SL';
      }
      executedQty = order.executedQty || '0';
      avgPrice = parseFloat(order.price) || 0;
      
      if (order.avgPrice) {
        avgPrice = parseFloat(order.avgPrice);
      }
      
      console.log(`OCO filled: ${filledLeg} at ${avgPrice}`);
      break;
    }
  }
  
  return {
    status: data.listOrderStatus || 'UNKNOWN',
    filledLeg,
    executedQty,
    avgPrice,
  };
}

// Check Bybit order status
async function checkBybitOrderStatus(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  orderId: string
): Promise<{ status: string; avgPrice: number; executedQty: string; origQty: string }> {
  const timestamp = Date.now();
  const params = `category=spot&orderId=${orderId}&symbol=${symbol}`;
  const paramStr = `${timestamp}${apiKey}5000${params}`;
  const signature = await hmacSha256(apiSecret, paramStr);
  
  const response = await fetch(
    `https://api.bybit.com/v5/order/realtime?${params}`,
    {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-SIGN": signature,
        "X-BAPI-TIMESTAMP": timestamp.toString(),
        "X-BAPI-RECV-WINDOW": "5000",
      },
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bybit order check failed: ${error}`);
  }
  
  const data = await response.json();
  const order = data.result?.list?.[0];
  
  if (!order) {
    return { status: 'NOT_FOUND', avgPrice: 0, executedQty: '0', origQty: '0' };
  }
  
  const statusMap: Record<string, string> = {
    'Filled': 'FILLED',
    'PartiallyFilled': 'PARTIALLY_FILLED',
    'New': 'NEW',
    'Cancelled': 'CANCELLED',
    'Rejected': 'REJECTED',
  };
  
  return {
    status: statusMap[order.orderStatus] || order.orderStatus,
    avgPrice: parseFloat(order.avgPrice) || 0,
    executedQty: order.cumExecQty || '0',
    origQty: order.qty || '0',
  };
}

// Check OKX order status
async function checkOKXOrderStatus(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  instId: string,
  orderId: string
): Promise<{ status: string; avgPrice: number; executedQty: string; origQty: string }> {
  const timestamp = new Date().toISOString();
  const path = `/api/v5/trade/order?instId=${instId}&ordId=${orderId}`;
  const prehash = timestamp + 'GET' + path;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(prehash));
  const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://www.okx.com${path}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OKX order check failed: ${error}`);
  }
  
  const data = await response.json();
  const order = data.data?.[0];
  
  if (!order) {
    return { status: 'NOT_FOUND', avgPrice: 0, executedQty: '0', origQty: '0' };
  }
  
  const statusMap: Record<string, string> = {
    'filled': 'FILLED',
    'partially_filled': 'PARTIALLY_FILLED',
    'live': 'NEW',
    'canceled': 'CANCELLED',
  };
  
  return {
    status: statusMap[order.state] || order.state?.toUpperCase() || 'UNKNOWN',
    avgPrice: parseFloat(order.avgPx) || 0,
    executedQty: order.accFillSz || '0',
    origQty: order.sz || '0',
  };
}

// ============ PROFIT EXTRACTION TO FUNDING WALLET ============
// Transfers profit from trading/futures wallet to funding wallet
async function extractProfitToFunding(
  exchange: string,
  amount: number,
  apiKey: string,
  apiSecret: string,
  passphrase?: string
): Promise<{ success: boolean; error?: string }> {
  // Round to 2 decimal places for USDT
  const transferAmount = Math.floor(amount * 100) / 100;
  if (transferAmount < 0.01) {
    return { success: false, error: 'Amount too small to transfer' };
  }
  
  const exchangeLower = exchange.toLowerCase();
  
  try {
    if (exchangeLower === 'binance') {
      // UMFUTURE_FUNDING: Futures → Funding
      const timestamp = Date.now();
      const params = `type=UMFUTURE_FUNDING&asset=USDT&amount=${transferAmount}&timestamp=${timestamp}`;
      const signature = await hmacSha256(apiSecret, params);
      
      const response = await fetch(
        `https://api.binance.com/sapi/v1/asset/transfer?${params}&signature=${signature}`,
        { method: 'POST', headers: { "X-MBX-APIKEY": apiKey } }
      );
      
      if (!response.ok) {
        const data = await response.json();
        console.error(`[extractProfitToFunding] Binance transfer FAILED:`, {
          code: data.code,
          msg: data.msg,
          amount: transferAmount,
          type: 'UMFUTURE_FUNDING',
          hint: data.code === -3041 ? 'Universal Transfer permission not enabled in Binance API settings' : undefined,
        });
        return { success: false, error: `${data.msg || 'Binance transfer failed'} (code: ${data.code})` };
      }
      
      return { success: true };
    }
    
    if (exchangeLower === 'bybit') {
      // UNIFIED → FUND
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      const transferId = crypto.randomUUID();
      
      const body = JSON.stringify({
        transferId,
        coin: 'USDT',
        amount: transferAmount.toString(),
        fromAccountType: 'UNIFIED',
        toAccountType: 'FUND',
      });
      
      const signPayload = `${timestamp}${apiKey}${recvWindow}${body}`;
      const signature = await hmacSha256(apiSecret, signPayload);
      
      const response = await fetch('https://api.bybit.com/v5/asset/transfer/inter-transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-SIGN': signature,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
        body,
      });
      
      const data = await response.json();
      if (data.retCode !== 0) {
        return { success: false, error: data.retMsg || 'Bybit transfer failed' };
      }
      
      return { success: true };
    }
    
    if (exchangeLower === 'okx' && passphrase) {
      // 18 (Trading) → 6 (Funding)
      const timestamp = new Date().toISOString();
      const path = '/api/v5/asset/transfer';
      
      const body = JSON.stringify({
        ccy: 'USDT',
        amt: transferAmount.toString(),
        from: '18', // Trading
        to: '6',    // Funding
        type: '0',
      });
      
      const prehash = timestamp + 'POST' + path + body;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(apiSecret);
      const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(prehash));
      const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));
      
      const response = await fetch(`https://www.okx.com${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OK-ACCESS-KEY': apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': passphrase,
        },
        body,
      });
      
      const data = await response.json();
      if (data.code !== '0') {
        return { success: false, error: data.msg || 'OKX transfer failed' };
      }
      
      return { success: true };
    }
    
    return { success: false, error: `Exchange ${exchange} not supported for profit extraction` };
  } catch (error) {
    console.error(`[extractProfitToFunding] Error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions, profitThreshold, forceCloseTradeId, diagnoseTradeId, cleanupStaleTrades, forceCloseAll, wsInstantClose, wsCurrentPrice, wsDetectedProfit } = body;

    console.log(`Check trade status request:`, { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions, profitThreshold, forceCloseTradeId, diagnoseTradeId, cleanupStaleTrades, forceCloseAll, wsInstantClose });

    // Get user's profit threshold from bot_config or use default
    const minProfitThreshold = profitThreshold || DEFAULT_PROFIT_THRESHOLD;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "";

    // ============ FAST-PATH: WebSocket Instant Close ============
    // When frontend detects profit target via WebSocket, skip price lookup and close immediately
    if (wsInstantClose && forceCloseTradeId && wsCurrentPrice) {
      console.log(`⚡ WEBSOCKET INSTANT CLOSE: Trade ${forceCloseTradeId} at price ${wsCurrentPrice}`);
      const instantCloseStart = Date.now();
      
      // Get trade info
      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .select('*')
        .eq('id', forceCloseTradeId)
        .eq('user_id', user.id)
        .eq('status', 'open')
        .maybeSingle();
      
      if (tradeError || !trade) {
        console.log(`Trade ${forceCloseTradeId} not found or already closed`);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Trade not found or already closed',
          wsInstantClose: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const exchangeName = (trade.exchange_name || 'binance').toLowerCase();
      const tradingSymbol = trade.pair?.replace('/', '') || 'BTCUSDT';
      const baseAsset = tradingSymbol.replace('USDT', '');
      
      // Get credentials
      const { data: connection } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .ilike("exchange_name", exchangeName)
        .eq("is_connected", true)
        .maybeSingle();
      
      if (!connection?.encrypted_api_key) {
        // No credentials - mark as closed with WS-detected profit
        await supabase.from('trades').update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          exit_price: wsCurrentPrice,
          profit_loss: wsDetectedProfit || 0
        }).eq('id', trade.id);
        
        console.log(`⚡ WS Instant close (no creds): ${Date.now() - instantCloseStart}ms`);
        return new Response(JSON.stringify({ 
          success: true, 
          method: 'ws_instant_no_creds',
          pnl: wsDetectedProfit,
          latencyMs: Date.now() - instantCloseStart,
          wsInstantClose: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
      const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
      
      // Get balance and sell immediately - NO price lookup needed
      await enforceRateLimit(exchangeName);
      const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
      
      if (balance.free <= 0) {
        await supabase.from('trades').update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          exit_price: wsCurrentPrice,
          profit_loss: wsDetectedProfit || 0
        }).eq('id', trade.id);
        
        console.log(`⚡ WS Instant close (zero balance): ${Date.now() - instantCloseStart}ms`);
        return new Response(JSON.stringify({ 
          success: true, 
          method: 'ws_instant_zero_balance',
          pnl: wsDetectedProfit,
          latencyMs: Date.now() - instantCloseStart,
          wsInstantClose: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Execute market sell immediately
      const lotInfo = await getBinanceLotSize(tradingSymbol);
      const sellQty = roundToStepSize(balance.free, lotInfo.stepSize);
      
      await enforceRateLimit(exchangeName);
      const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
      
      if (sellResult.success) {
        const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
        const priceDiff = trade.direction === 'long' 
          ? sellResult.avgPrice - trade.entry_price 
          : trade.entry_price - sellResult.avgPrice;
        const grossPnL = (priceDiff / trade.entry_price) * trade.amount;
        const netPnL = grossPnL - (trade.amount * feeRate * 2);
        
        await supabase.from('trades').update({
          exit_price: sellResult.avgPrice,
          profit_loss: netPnL,
          status: 'closed',
          closed_at: new Date().toISOString(),
        }).eq('id', trade.id);
        
        await logProfitAudit(supabase, {
          user_id: user.id,
          trade_id: trade.id,
          action: 'ws_instant_close',
          symbol: tradingSymbol,
          exchange: exchangeName,
          entry_price: trade.entry_price,
          current_price: sellResult.avgPrice,
          quantity: balance.free,
          net_pnl: netPnL,
          lot_size_used: lotInfo.stepSize,
          quantity_sent: sellQty,
          success: true,
          credential_found: true,
          balance_available: balance.free
        });
        
        const totalLatency = Date.now() - instantCloseStart;
        console.log(`⚡ WS INSTANT CLOSE SUCCESS: $${netPnL.toFixed(2)} in ${totalLatency}ms`);
        
        return new Response(JSON.stringify({ 
          success: true, 
          method: 'ws_instant_market_sell',
          pnl: netPnL,
          exitPrice: sellResult.avgPrice,
          latencyMs: totalLatency,
          wsInstantClose: true
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        console.error(`WS instant close market sell failed`);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Market sell failed',
          wsInstantClose: true
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // MODE: Cleanup stale trades (called by cron job - marks zero-balance trades older than 4 hours as closed)
    if (cleanupStaleTrades) {
      console.log(`Running stale trade cleanup for all users...`);
      
      const fourHoursAgo = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
      
      // Get all stale open trades (older than 4 hours)
      const { data: staleTrades, error: staleError } = await supabase
        .from('trades')
        .select('*')
        .eq('status', 'open')
        .lt('created_at', fourHoursAgo);
      
      if (staleError) {
        console.error('Failed to fetch stale trades:', staleError);
        return new Response(JSON.stringify({ error: 'Failed to fetch stale trades' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (!staleTrades || staleTrades.length === 0) {
        console.log('No stale trades found');
        return new Response(JSON.stringify({ cleanedCount: 0, message: 'No stale trades' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Found ${staleTrades.length} stale trades to check`);
      let cleanedCount = 0;
      
      for (const trade of staleTrades) {
        try {
          const exchangeName = (trade.exchange_name || 'binance').toLowerCase();
          const tradingSymbol = trade.pair?.replace('/', '') || 'BTCUSDT';
          const baseAsset = tradingSymbol.replace('USDT', '');
          
          // Get user's exchange credentials
          const { data: connection } = await supabase
            .from("exchange_connections")
            .select("*")
            .eq("user_id", trade.user_id)
            .ilike("exchange_name", exchangeName)
            .eq("is_connected", true)
            .maybeSingle();
          
          if (!connection?.encrypted_api_key) {
            console.log(`No credentials for trade ${trade.id}, marking as closed`);
            // No credentials = mark as closed with zero P&L
            await supabase.from('trades').update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              exit_price: trade.entry_price,
              profit_loss: 0
            }).eq('id', trade.id);
            
            await logProfitAudit(supabase, {
              user_id: trade.user_id,
              trade_id: trade.id,
              action: 'stale_cleanup',
              symbol: tradingSymbol,
              exchange: exchangeName,
              success: true,
              error_message: 'No credentials - auto marked closed',
              credential_found: false
            });
            cleanedCount++;
            continue;
          }
          
          const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
          const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
          
          // Check if there's actually any balance for this asset
          await enforceRateLimit(exchangeName);
          const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
          
          if (balance.free === 0 && balance.locked === 0) {
            console.log(`Trade ${trade.id} has zero balance, marking as closed`);
            
            // Get current price for audit
            const currentPrice = await getBinancePrice(tradingSymbol);
            
            await supabase.from('trades').update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              exit_price: currentPrice || trade.entry_price,
              profit_loss: 0
            }).eq('id', trade.id);
            
            await logProfitAudit(supabase, {
              user_id: trade.user_id,
              trade_id: trade.id,
              action: 'stale_cleanup',
              symbol: tradingSymbol,
              exchange: exchangeName,
              entry_price: trade.entry_price,
              current_price: currentPrice,
              success: true,
              error_message: 'Zero balance - auto marked closed',
              credential_found: true,
              balance_available: 0
            });
            cleanedCount++;
          } else {
            console.log(`Trade ${trade.id} still has balance (${balance.free} free, ${balance.locked} locked), skipping`);
          }
        } catch (err) {
          console.error(`Error processing stale trade ${trade.id}:`, err);
        }
      }
      
      console.log(`Stale trade cleanup complete: ${cleanedCount} trades cleaned`);
      return new Response(JSON.stringify({ cleanedCount, totalChecked: staleTrades.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE: Force close all open positions (manual trigger)
    if (forceCloseAll) {
      console.log(`Force closing all open positions for user ${user.id}`);
      
      const { data: openTrades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open');
      
      if (tradesError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch open trades' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (!openTrades || openTrades.length === 0) {
        return new Response(JSON.stringify({ closedCount: 0, message: 'No open positions' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Found ${openTrades.length} open positions to force close`);
      let closedCount = 0;
      let totalPnL = 0;
      const results: any[] = [];
      
      for (const trade of openTrades) {
        try {
          const exchangeName = (trade.exchange_name || 'binance').toLowerCase();
          const tradingSymbol = trade.pair?.replace('/', '') || 'BTCUSDT';
          const baseAsset = tradingSymbol.replace('USDT', '');
          
          const { data: connection } = await supabase
            .from("exchange_connections")
            .select("*")
            .eq("user_id", user.id)
            .ilike("exchange_name", exchangeName)
            .eq("is_connected", true)
            .maybeSingle();
          
          if (!connection?.encrypted_api_key) {
            // No credentials - just mark as closed
            await supabase.from('trades').update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              exit_price: trade.entry_price,
              profit_loss: 0
            }).eq('id', trade.id);
            
            await logProfitAudit(supabase, {
              user_id: user.id,
              trade_id: trade.id,
              action: 'force_close',
              symbol: tradingSymbol,
              exchange: exchangeName,
              success: true,
              error_message: 'No credentials - marked closed',
              credential_found: false
            });
            
            closedCount++;
            results.push({ tradeId: trade.id, symbol: tradingSymbol, success: true, method: 'no_credentials' });
            continue;
          }
          
          const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
          const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
          
          await enforceRateLimit(exchangeName);
          const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
          
          if (balance.free <= 0) {
            // No balance - mark as closed
            const currentPrice = await getBinancePrice(tradingSymbol);
            
            await supabase.from('trades').update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              exit_price: currentPrice || trade.entry_price,
              profit_loss: 0
            }).eq('id', trade.id);
            
            await logProfitAudit(supabase, {
              user_id: user.id,
              trade_id: trade.id,
              action: 'force_close',
              symbol: tradingSymbol,
              exchange: exchangeName,
              current_price: currentPrice,
              success: true,
              error_message: 'Zero balance - marked closed',
              credential_found: true,
              balance_available: 0
            });
            
            closedCount++;
            results.push({ tradeId: trade.id, symbol: tradingSymbol, success: true, method: 'zero_balance' });
            continue;
          }
          
          // Has balance - attempt market sell
          const lotInfo = await getBinanceLotSize(tradingSymbol);
          const sellQty = roundToStepSize(balance.free, lotInfo.stepSize);
          
          if (parseFloat(sellQty) <= 0) {
            results.push({ tradeId: trade.id, symbol: tradingSymbol, success: false, error: 'Quantity too small' });
            continue;
          }
          
          await enforceRateLimit(exchangeName);
          const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
          
          if (sellResult.success) {
            const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
            const priceDiff = trade.direction === 'long' 
              ? sellResult.avgPrice - trade.entry_price 
              : trade.entry_price - sellResult.avgPrice;
            const grossPnL = (priceDiff / trade.entry_price) * trade.amount;
            const netPnL = grossPnL - (trade.amount * feeRate * 2);
            
            await supabase.from('trades').update({
              exit_price: sellResult.avgPrice,
              profit_loss: netPnL,
              status: 'closed',
              closed_at: new Date().toISOString(),
            }).eq('id', trade.id);
            
            await logProfitAudit(supabase, {
              user_id: user.id,
              trade_id: trade.id,
              action: 'force_close',
              symbol: tradingSymbol,
              exchange: exchangeName,
              entry_price: trade.entry_price,
              current_price: sellResult.avgPrice,
              quantity: balance.free,
              net_pnl: netPnL,
              lot_size_used: lotInfo.stepSize,
              quantity_sent: sellQty,
              success: true,
              credential_found: true,
              balance_available: balance.free
            });
            
            closedCount++;
            totalPnL += netPnL;
            results.push({ tradeId: trade.id, symbol: tradingSymbol, success: true, netPnL, method: 'market_sell' });
          } else {
            results.push({ tradeId: trade.id, symbol: tradingSymbol, success: false, error: 'Market sell failed' });
          }
        } catch (err) {
          console.error(`Error force closing trade ${trade.id}:`, err);
          results.push({ tradeId: trade.id, success: false, error: String(err) });
        }
      }
      
      console.log(`Force close complete: ${closedCount}/${openTrades.length} closed, total P&L: $${totalPnL.toFixed(2)}`);
      return new Response(JSON.stringify({ closedCount, totalPnL, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // MODE 0a: Force close specific trade
    if (forceCloseTradeId) {
      console.log(`Force closing trade ${forceCloseTradeId}`);
      
      const { data: trade } = await supabase
        .from('trades')
        .select('*')
        .eq('id', forceCloseTradeId)
        .eq('user_id', user.id)
        .eq('status', 'open')
        .single();
      
      if (!trade) {
        return new Response(JSON.stringify({ success: false, error: 'Trade not found or already closed' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const exchangeName = (trade.exchange_name || 'binance').toLowerCase();
      const { data: connection } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .ilike("exchange_name", exchangeName)
        .eq("is_connected", true)
        .maybeSingle();
      
      if (!connection?.encrypted_api_key) {
        return new Response(JSON.stringify({ success: false, error: 'No exchange credentials' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
      const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
      const tradingSymbol = trade.pair?.replace('/', '') || 'BTCUSDT';
      const baseAsset = tradingSymbol.replace('USDT', '');
      
      // Get balance and lot size
      const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
      const lotInfo = await getBinanceLotSize(tradingSymbol);
      const sellQty = roundToStepSize(balance.free, lotInfo.stepSize);
      
      if (parseFloat(sellQty) <= 0) {
        return new Response(JSON.stringify({ success: false, error: 'No balance to sell' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Market sell
      const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
      
      if (sellResult.success) {
        const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
        const priceDiff = trade.direction === 'long' 
          ? sellResult.avgPrice - trade.entry_price 
          : trade.entry_price - sellResult.avgPrice;
        const grossPnL = (priceDiff / trade.entry_price) * trade.amount;
        const netPnL = grossPnL - (trade.amount * feeRate * 2);
        
        await supabase.from('trades').update({
          exit_price: sellResult.avgPrice,
          profit_loss: netPnL,
          status: 'closed',
          closed_at: new Date().toISOString(),
        }).eq('id', trade.id);
        
        await logProfitAudit(supabase, {
          user_id: user.id, trade_id: trade.id, action: 'manual_close',
          symbol: tradingSymbol, exchange: exchangeName,
          entry_price: trade.entry_price, current_price: sellResult.avgPrice,
          quantity: balance.free, net_pnl: netPnL, lot_size_used: lotInfo.stepSize,
          quantity_sent: sellQty, success: true, credential_found: true,
          balance_available: balance.free
        });
        
        return new Response(JSON.stringify({ success: true, netPnL, exitPrice: sellResult.avgPrice }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ success: false, error: 'Market sell failed' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE 0b: Diagnose specific trade
    if (diagnoseTradeId) {
      const { data: trade } = await supabase
        .from('trades')
        .select('*')
        .eq('id', diagnoseTradeId)
        .eq('user_id', user.id)
        .single();
      
      if (!trade) {
        return new Response(JSON.stringify({ error: 'Trade not found' }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const exchangeName = (trade.exchange_name || 'binance').toLowerCase();
      const { data: connection } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .ilike("exchange_name", exchangeName)
        .eq("is_connected", true)
        .maybeSingle();
      
      const tradingSymbol = trade.pair?.replace('/', '') || 'BTCUSDT';
      const baseAsset = tradingSymbol.replace('USDT', '');
      let balance = { free: 0, locked: 0 };
      let currentPrice = 0;
      
      if (connection?.encrypted_api_key) {
        const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
        const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
        balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
        currentPrice = await getBinancePrice(tradingSymbol);
      }
      
      const priceDiff = trade.direction === 'long' ? currentPrice - trade.entry_price : trade.entry_price - currentPrice;
      const unrealizedPnL = currentPrice > 0 ? (priceDiff / trade.entry_price) * trade.amount : null;
      
      return new Response(JSON.stringify({
        tradeId: trade.id, symbol: tradingSymbol,
        credentialFound: !!connection?.encrypted_api_key,
        ocoStatus: null, balanceAvailable: balance.free,
        currentPrice, unrealizedPnL, lastError: null
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // MODE 1: Check all open positions with ADAPTIVE PROFIT-TAKING
    if (checkOpenPositions) {
      console.log(`Checking all open positions for user ${user.id} with profit threshold: ${minProfitThreshold * 100}%`);
      
      // Get all open trades
      const { data: openTrades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      
      if (tradesError) {
        console.error('Failed to fetch open trades:', tradesError);
        return new Response(JSON.stringify({ error: 'Failed to fetch open trades' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (!openTrades || openTrades.length === 0) {
        return new Response(JSON.stringify({ 
          message: 'No open positions',
          openPositions: 0,
          closedPositions: 0,
          profitsTaken: 0
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      console.log(`Found ${openTrades.length} open positions to check`);
      
      // Get alerts with OCO order info for these trades
      const { data: positionAlerts } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('alert_type', 'position_opened')
        .order('created_at', { ascending: false });
      
      let closedCount = 0;
      let profitsTaken = 0;
      let stalePositionsClosed = 0;
      const now = Date.now();
      
      for (const trade of openTrades) {
        // ============ STALE POSITION CLEANUP ============
        // Force-close positions older than 4 hours where OCO may have been cancelled
        const tradeCreatedAt = new Date(trade.created_at).getTime();
        const tradeAgeMs = now - tradeCreatedAt;
        const tradeAgeHours = tradeAgeMs / (60 * 60 * 1000);
        
        if (tradeAgeMs > STALE_THRESHOLD_MS) {
          console.log(`⚠️ STALE POSITION DETECTED: Trade ${trade.id} (${trade.pair}) is ${tradeAgeHours.toFixed(1)} hours old`);
        }
        // Find the alert with OCO order info for this trade
        const alert = positionAlerts?.find(a => {
          const data = a.data as any;
          return data?.tradeId === trade.id;
        });
        
        const alertData = (alert?.data || {}) as any;
        const { orderListId, symbol: alertSymbol, direction, entryPrice, exchange: alertExchange, quantity } = alertData;
        const exchangeNameRaw = (alertExchange || trade.exchange_name || 'binance');
        const exchangeName = exchangeNameRaw.toLowerCase();
        
        // Get exchange credentials (case-insensitive match)
        console.log(`🔐 Credential lookup: user=${user.id} exchange="${exchangeNameRaw}" (normalized="${exchangeName}")`);
        const { data: connection, error: connectionError } = await supabase
          .from("exchange_connections")
          .select("*")
          .eq("user_id", user.id)
          .ilike("exchange_name", exchangeName)
          .eq("is_connected", true)
          .maybeSingle();

        if (connectionError) {
          console.error(`Credential lookup error for ${exchangeName}:`, connectionError);
        }
        console.log(`🔐 Credential lookup result: found=${!!connection} stored_exchange="${connection?.exchange_name}"`);
        
        if (!connection || !connection.encrypted_api_key) {
          console.log(`No credentials for ${exchangeName}`);
          continue;
        }
        
        try {
          const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
          const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
          // Decrypt passphrase for OKX (required for profit extraction)
          const passphrase = connection.encrypted_passphrase 
            ? await decryptSecret(connection.encrypted_passphrase, connection.encryption_iv!, encryptionKey)
            : undefined;
          
          // Get the trading symbol (e.g., "ETHUSDT")
          const tradingSymbol = alertSymbol || trade.pair?.replace('/', '') || 'BTCUSDT';
          const baseAsset = tradingSymbol.replace('USDT', '');
          const actualEntryPrice = trade.entry_price || entryPrice;
          const tradeDirection = trade.direction || direction || 'long';
          const positionSize = trade.amount || 50;
          const leverage = trade.leverage || 1;
          const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
          
          // STEP 1: First check if OCO was already filled
          if (orderListId) {
            // Enforce rate limiting before API call
            await enforceRateLimit(exchangeName);
            
            const ocoStatus = await checkBinanceOCOStatus(apiKey, apiSecret, orderListId);
            console.log(`OCO ${orderListId} for trade ${trade.id}: ${ocoStatus.status}, filled: ${ocoStatus.filledLeg}`);
            
            if (ocoStatus.status === 'ALL_DONE') {
              if (ocoStatus.filledLeg !== 'NONE') {
                // Position closed via OCO - update trade
                const exitPrice = ocoStatus.avgPrice;
                
                const priceDiff = tradeDirection === 'long'
                  ? exitPrice - actualEntryPrice
                  : actualEntryPrice - exitPrice;
                
                const grossPnL = (priceDiff / actualEntryPrice) * positionSize * leverage;
                const fees = positionSize * feeRate * 2;
                const netPnL = grossPnL - fees;
                
                console.log(`Trade ${trade.id} closed via OCO ${ocoStatus.filledLeg}: Exit ${exitPrice}, P&L: $${netPnL.toFixed(2)}`);
                
                await supabase.from('trades').update({
                  exit_price: exitPrice,
                  profit_loss: netPnL,
                  profit_percentage: (netPnL / positionSize) * 100,
                  status: 'closed',
                  closed_at: new Date().toISOString(),
                }).eq('id', trade.id);
                
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `${ocoStatus.filledLeg === 'TP' ? '✅ Take Profit' : '🛑 Stop Loss'}: ${trade.pair}`,
                  message: `${tradeDirection.toUpperCase()} closed at ${exitPrice.toFixed(2)} | P&L: $${netPnL.toFixed(2)}`,
                  alert_type: 'position_closed',
                  data: { tradeId: trade.id, filledLeg: ocoStatus.filledLeg, exitPrice, pnl: netPnL }
                });
                
                closedCount++;
                if (netPnL > 0) profitsTaken++;
                
                // Update bot run P&L - use trade's bot_run_id for accurate linking
                await updateBotRunPnL(supabase, user.id, netPnL, trade.bot_run_id);
                continue;
              } else {
                // OCO ALL_DONE but no leg filled - check if balance is zero (position closed elsewhere)
                console.log(`🔍 OCO ALL_DONE with no fill - checking ${baseAsset} balance...`);
                await enforceRateLimit(exchangeName);
                const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
                
                if (balance.free <= 0 && balance.locked <= 0) {
                  // Position was closed elsewhere - mark trade as closed
                  const currentPrice = await getBinancePrice(tradingSymbol);
                  console.log(`🔄 OCO ALL_DONE with no fill + zero balance - marking trade ${trade.id} as closed`);
                  
                  // Estimate P&L using current price (better than recording $0.00)
                  const exitPrice = currentPrice || actualEntryPrice;
                  const priceDiff = tradeDirection === 'long'
                    ? exitPrice - actualEntryPrice
                    : actualEntryPrice - exitPrice;

                  const grossPnL = (priceDiff / actualEntryPrice) * positionSize * leverage;
                  const fees = positionSize * feeRate * 2;
                  const estimatedNetPnL = grossPnL - fees;

                  await supabase.from('trades').update({
                    status: 'closed',
                    exit_price: exitPrice,
                    profit_loss: estimatedNetPnL,
                    profit_percentage: (estimatedNetPnL / positionSize) * 100,
                    closed_at: new Date().toISOString(),
                  }).eq('id', trade.id);
                  
                  await logProfitAudit(supabase, {
                    user_id: user.id,
                    trade_id: trade.id,
                    action: 'auto_close_zero_balance',
                    symbol: tradingSymbol,
                    exchange: exchangeName,
                    success: true,
                    error_message: 'OCO ALL_DONE with no fill, zero balance - assumed closed elsewhere',
                    balance_available: 0,
                    oco_status: 'ALL_DONE_NO_FILL'
                  });
                  
                  closedCount++;
                  continue;
                }
              }
            }
            
            // ============ STALE POSITION FORCE-CLOSE ============
            // If position is older than 4 hours AND OCO is cancelled/expired, force close
            if (tradeAgeMs > STALE_THRESHOLD_MS && (ocoStatus.status === 'CANCELLED' || ocoStatus.status === 'EXPIRED' || ocoStatus.status === 'REJECTED')) {
              console.log(`🛑 STALE POSITION: OCO ${orderListId} status is ${ocoStatus.status} - force closing trade ${trade.id}`);
              
              // Get balance and force close with market order
              await enforceRateLimit(exchangeName);
              const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
              const availableQty = balance.free;
              
              if (availableQty > 0) {
                const lotInfo = await getBinanceLotSize(tradingSymbol);
                const sellQty = roundToStepSize(availableQty, lotInfo.stepSize);
                const stalePriceCheck = await getBinancePrice(tradingSymbol);
                
                // Log the attempt BEFORE the quantity check
                await logProfitAudit(supabase, {
                  user_id: user.id,
                  trade_id: trade.id,
                  action: 'stale_close',
                  symbol: tradingSymbol,
                  exchange: exchangeName,
                  entry_price: actualEntryPrice,
                  current_price: stalePriceCheck,
                  quantity: availableQty,
                  lot_size_used: lotInfo.stepSize,
                  quantity_sent: sellQty,
                  credential_found: true,
                  balance_available: availableQty,
                  success: false,
                  error_message: parseFloat(sellQty) < parseFloat(lotInfo.minQty) 
                    ? `Quantity ${sellQty} below minimum ${lotInfo.minQty}` 
                    : undefined
                });
                
                if (parseFloat(sellQty) < parseFloat(lotInfo.minQty)) {
                  // BUG-004 FIX: Dust position - close trade even if can't sell
                  console.log(`⚠️ Stale dust position ${sellQty} < min ${lotInfo.minQty} - marking as closed`);
                  
                  await supabase.from('trades').update({
                    status: 'closed',
                    exit_price: stalePriceCheck || actualEntryPrice,
                    profit_loss: 0,
                    closed_at: new Date().toISOString(),
                  }).eq('id', trade.id);
                  
                  closedCount++;
                  stalePositionsClosed++;
                  continue;
                }
                
                await enforceRateLimit(exchangeName);
                const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
                
                if (sellResult.success) {
                  const exitPrice = sellResult.avgPrice;
                  const actualPriceDiff = tradeDirection === 'long'
                    ? exitPrice - actualEntryPrice
                    : actualEntryPrice - exitPrice;
                  
                  const actualGrossPnL = (actualPriceDiff / actualEntryPrice) * positionSize * leverage;
                  const actualNetPnL = actualGrossPnL - (positionSize * feeRate * 2);
                  
                  console.log(`⏰ STALE POSITION FORCE-CLOSED: Trade ${trade.id} at ${exitPrice}, P&L: $${actualNetPnL.toFixed(2)}`);
                  
                  await supabase.from('trades').update({
                    exit_price: exitPrice,
                    profit_loss: actualNetPnL,
                    profit_percentage: (actualNetPnL / positionSize) * 100,
                    status: 'closed',
                    closed_at: new Date().toISOString(),
                  }).eq('id', trade.id);
                  
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `⏰ Stale Position Force-Closed: ${trade.pair}`,
                  message: `Position was open for ${tradeAgeHours.toFixed(1)} hours. Force-closed at ${exitPrice.toFixed(2)} | P&L: $${actualNetPnL.toFixed(2)}`,
                  alert_type: 'stale_position_closed',
                  data: { tradeId: trade.id, exitPrice, pnl: actualNetPnL, ageHours: tradeAgeHours, reason: ocoStatus.status }
                });
                
                closedCount++;
                stalePositionsClosed++;
                if (actualNetPnL > 0) profitsTaken++;
                // FIXED: Use trade's bot_run_id for accurate P&L tracking
                await updateBotRunPnL(supabase, user.id, actualNetPnL, trade.bot_run_id);
                continue;
                }
              } else {
                // No balance: do NOT auto-close at $0.00 (this causes false “profit taken”/closure).
                // Instead, alert + keep trade open so the next poll can re-check OCO / balances.
                console.log(`⏰ STALE POSITION: No ${baseAsset} balance for trade ${trade.id}; leaving OPEN for re-check`);

                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `⚠️ Stale Position Needs Review: ${trade.pair}`,
                  message: `Trade is ${tradeAgeHours.toFixed(1)}h old but ${baseAsset} balance is 0. Keeping trade open to avoid $0 closure.`,
                  alert_type: 'stale_position_needs_review',
                  data: { tradeId: trade.id, ageHours: tradeAgeHours, reason: 'no_balance' }
                });

                continue;
              }
            }
          }
          
          // Also check for stale positions without OCO (shouldn't happen but safety net)
          if (!orderListId && tradeAgeMs > STALE_THRESHOLD_MS) {
            console.log(`⏰ STALE ORPHAN: Trade ${trade.id} has no OCO and is ${tradeAgeHours.toFixed(1)} hours old`);
            
            await enforceRateLimit(exchangeName);
            const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
            
            if (balance.free > 0) {
              const lotInfo = await getBinanceLotSize(tradingSymbol);
              const sellQty = roundToStepSize(balance.free, lotInfo.stepSize);
              const orphanPriceCheck = await getBinancePrice(tradingSymbol);
              
              // Log the attempt BEFORE the quantity check
              await logProfitAudit(supabase, {
                user_id: user.id,
                trade_id: trade.id,
                action: 'orphan_close',
                symbol: tradingSymbol,
                exchange: exchangeName,
                entry_price: actualEntryPrice,
                current_price: orphanPriceCheck,
                quantity: balance.free,
                lot_size_used: lotInfo.stepSize,
                quantity_sent: sellQty,
                credential_found: true,
                balance_available: balance.free,
                success: false,
                error_message: parseFloat(sellQty) < parseFloat(lotInfo.minQty) 
                  ? `Quantity ${sellQty} below minimum ${lotInfo.minQty}` 
                  : undefined
              });
              
              if (parseFloat(sellQty) < parseFloat(lotInfo.minQty)) {
                console.log(`⚠️ Orphan position quantity ${sellQty} below min ${lotInfo.minQty} - cannot sell`);
                continue;
              }
              
              await enforceRateLimit(exchangeName);
              const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
              
              if (sellResult.success) {
                const exitPrice = sellResult.avgPrice;
                const actualPriceDiff = tradeDirection === 'long'
                  ? exitPrice - actualEntryPrice
                  : actualEntryPrice - exitPrice;
                
                const actualGrossPnL = (actualPriceDiff / actualEntryPrice) * positionSize * leverage;
                const actualNetPnL = actualGrossPnL - (positionSize * feeRate * 2);
                
                await supabase.from('trades').update({
                  exit_price: exitPrice,
                  profit_loss: actualNetPnL,
                  profit_percentage: (actualNetPnL / positionSize) * 100,
                  status: 'closed',
                  closed_at: new Date().toISOString(),
                }).eq('id', trade.id);
                
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `⏰ Orphan Position Closed: ${trade.pair}`,
                  message: `Position had no OCO order. Force-closed at ${exitPrice.toFixed(2)} | P&L: $${actualNetPnL.toFixed(2)}`,
                  alert_type: 'stale_position_closed',
                  data: { tradeId: trade.id, exitPrice, pnl: actualNetPnL, ageHours: tradeAgeHours, reason: 'no_oco' }
                });
                
                closedCount++;
                stalePositionsClosed++;
                if (actualNetPnL > 0) profitsTaken++;
                // FIXED: Use trade's bot_run_id for accurate P&L tracking
                await updateBotRunPnL(supabase, user.id, actualNetPnL, trade.bot_run_id);
                continue;
              }
            }
          }
          
          // STEP 2: ADAPTIVE PROFIT-TAKING - Check current price and take profit if > fees
          const currentPrice = await getBinancePrice(tradingSymbol);
          
          if (currentPrice <= 0) {
            console.log(`Could not get price for ${tradingSymbol}`);
            continue;
          }
          
          // Calculate unrealized P&L
          const priceDiff = tradeDirection === 'long'
            ? currentPrice - actualEntryPrice
            : actualEntryPrice - currentPrice;
          
          const unrealizedPnLPercent = priceDiff / actualEntryPrice;
          const grossUnrealizedPnL = unrealizedPnLPercent * positionSize * leverage;
          const totalFees = positionSize * feeRate * 2; // Entry + exit fees
          const netUnrealizedPnL = grossUnrealizedPnL - totalFees;
          
          console.log(`Trade ${trade.id} (${tradingSymbol}): Entry ${actualEntryPrice}, Current ${currentPrice}, Unrealized: $${netUnrealizedPnL.toFixed(3)} (${(unrealizedPnLPercent * 100).toFixed(3)}%)`);
          
          // $1.00 NET PROFIT TARGET - Only close when $1 net profit is reached
          // This ensures trades are held until the target is achieved
          const MINIMUM_PROFIT_TARGET = 1.00; // $1.00 NET profit minimum - NEVER close below this
          const shouldTakeProfit = netUnrealizedPnL >= MINIMUM_PROFIT_TARGET;
          
          if (shouldTakeProfit) {
            console.log(`🎯 PROFIT THRESHOLD MET! Taking profit on trade ${trade.id}: $${netUnrealizedPnL.toFixed(3)}`);
            
            // Get actual balance of the asset
            await enforceRateLimit(exchangeName);
            const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
            const availableQty = balance.free + balance.locked;
            
            if (availableQty <= 0) {
              console.log(`No ${baseAsset} balance available to sell - checking if trade should be closed...`);
              
              // Check if OCO exists and is done/cancelled - trade likely closed elsewhere
              if (orderListId) {
                const ocoStatus = await checkBinanceOCOStatus(apiKey, apiSecret, orderListId);
                if (ocoStatus.status === 'ALL_DONE' || ocoStatus.status === 'CANCELLED' || ocoStatus.status === 'EXPIRED') {
                  console.log(`🔄 Zero balance + OCO ${ocoStatus.status} - marking trade ${trade.id} as closed`);
                  
                   // Estimate P&L using current price (better than recording $0.00)
                   const exitPrice = currentPrice;
                   const priceDiff = tradeDirection === 'long'
                     ? exitPrice - actualEntryPrice
                     : actualEntryPrice - exitPrice;

                   const grossPnL = (priceDiff / actualEntryPrice) * positionSize * leverage;
                   const fees = positionSize * feeRate * 2;
                   const estimatedNetPnL = grossPnL - fees;

                   await supabase.from('trades').update({
                     status: 'closed',
                     exit_price: exitPrice,
                     profit_loss: estimatedNetPnL,
                     profit_percentage: (estimatedNetPnL / positionSize) * 100,
                     closed_at: new Date().toISOString(),
                   }).eq('id', trade.id);
                  
                  await logProfitAudit(supabase, {
                    user_id: user.id,
                    trade_id: trade.id,
                    action: 'auto_close_zero_balance',
                    symbol: tradingSymbol,
                    exchange: exchangeName,
                    current_price: currentPrice,
                    success: true,
                    error_message: `Zero balance + OCO ${ocoStatus.status} - trade closed elsewhere`,
                    balance_available: 0,
                    oco_status: ocoStatus.status
                  });
                  
                  closedCount++;
                }
              }
              continue;
            }
            
            // FIXED BUG-003: Check OCO status before attempting cancel
            // Only cancel if OCO is still active (EXECUTING status)
            if (orderListId) {
              await enforceRateLimit(exchangeName);
              const ocoStatus = await checkBinanceOCOStatus(apiKey, apiSecret, orderListId);
              
              // Only attempt cancel if OCO is still active
              if (ocoStatus.status === 'EXECUTING' || ocoStatus.status === 'NEW') {
                const cancelled = await cancelBinanceOCO(apiKey, apiSecret, tradingSymbol, orderListId);
                if (!cancelled) {
                  console.log(`Failed to cancel OCO, trying market sell anyway`);
                }
              } else {
                console.log(`OCO ${orderListId} already ${ocoStatus.status} - skipping cancel`);
              }
            }
            
            // Get LOT_SIZE filter and round quantity properly
            const lotInfo = await getBinanceLotSize(tradingSymbol);
            const sellQty = roundToStepSize(availableQty, lotInfo.stepSize);
            
            // Log the attempt BEFORE the quantity check
            await logProfitAudit(supabase, {
              user_id: user.id,
              trade_id: trade.id,
              action: 'profit_take',
              symbol: tradingSymbol,
              exchange: exchangeName,
              entry_price: actualEntryPrice,
              current_price: currentPrice,
              quantity: availableQty,
              gross_pnl: grossUnrealizedPnL,
              net_pnl: netUnrealizedPnL,
              lot_size_used: lotInfo.stepSize,
              quantity_sent: sellQty,
              credential_found: true,
              oco_status: orderListId ? 'CANCELLED' : undefined,
              balance_available: availableQty,
              success: false,
              error_message: parseFloat(sellQty) < parseFloat(lotInfo.minQty) 
                ? `Quantity ${sellQty} below minimum ${lotInfo.minQty}` 
                : undefined
            });
            
            // FIXED BUG-004: Handle dust amounts - ONLY close if $1 profit target is met
            if (parseFloat(sellQty) < parseFloat(lotInfo.minQty)) {
              // Dust amount: only close if profit target is met
              if (netUnrealizedPnL >= MINIMUM_PROFIT_TARGET) {
                console.log(`✅ Dust close with profit target met: $${netUnrealizedPnL.toFixed(3)} >= $1.00`);
                
                await supabase.from('trades').update({
                  status: 'closed',
                  exit_price: currentPrice,
                  profit_loss: netUnrealizedPnL,
                  profit_percentage: (netUnrealizedPnL / positionSize) * 100,
                  closed_at: new Date().toISOString(),
                }).eq('id', trade.id);
                
                await logProfitAudit(supabase, {
                  user_id: user.id,
                  trade_id: trade.id,
                  action: 'dust_close',
                  symbol: tradingSymbol,
                  exchange: exchangeName,
                  entry_price: actualEntryPrice,
                  current_price: currentPrice,
                  quantity: availableQty,
                  gross_pnl: grossUnrealizedPnL,
                  net_pnl: netUnrealizedPnL,
                  success: true,
                  error_message: `Dust amount ${sellQty} - profit target met, closed at $${netUnrealizedPnL.toFixed(2)}`,
                  balance_available: availableQty
                });
                
                closedCount++;
                profitsTaken++;
                await updateBotRunPnL(supabase, user.id, netUnrealizedPnL);
              } else {
                // Dust but profit target NOT met - keep holding
                console.log(`⏳ Dust amount but P&L $${netUnrealizedPnL.toFixed(3)} < $1.00 target - KEEPING OPEN`);
                
                await logProfitAudit(supabase, {
                  user_id: user.id,
                  trade_id: trade.id,
                  action: 'dust_hold',
                  symbol: tradingSymbol,
                  exchange: exchangeName,
                  entry_price: actualEntryPrice,
                  current_price: currentPrice,
                  quantity: availableQty,
                  gross_pnl: grossUnrealizedPnL,
                  net_pnl: netUnrealizedPnL,
                  success: true,
                  error_message: `Dust amount but $${netUnrealizedPnL.toFixed(2)} < $1.00 target - still holding`,
                  balance_available: availableQty
                });
              }
              continue;
            }
            
            // Place market sell order
            await enforceRateLimit(exchangeName);
            const sellResult = await placeBinanceMarketSell(apiKey, apiSecret, tradingSymbol, sellQty);
            
            if (sellResult.success) {
              const exitPrice = sellResult.avgPrice;
              
              // Recalculate actual P&L with real exit price
              const actualPriceDiff = tradeDirection === 'long'
                ? exitPrice - actualEntryPrice
                : actualEntryPrice - exitPrice;
              
              const actualGrossPnL = (actualPriceDiff / actualEntryPrice) * positionSize * leverage;
              const actualNetPnL = actualGrossPnL - totalFees;
              
              console.log(`✅ Profit taken on trade ${trade.id}: Exit ${exitPrice}, P&L: $${actualNetPnL.toFixed(3)}`);
              
              // Update trade record
              await supabase.from('trades').update({
                exit_price: exitPrice,
                profit_loss: actualNetPnL,
                profit_percentage: (actualNetPnL / positionSize) * 100,
                status: 'closed',
                closed_at: new Date().toISOString(),
              }).eq('id', trade.id);
              
              // ✅ SUCCESS AUDIT LOG - Critical for tracking successful profit-takes
              await logProfitAudit(supabase, {
                user_id: user.id,
                trade_id: trade.id,
                action: 'profit_take_success',
                symbol: tradingSymbol,
                exchange: exchangeName,
                entry_price: actualEntryPrice,
                current_price: exitPrice,
                quantity: availableQty,
                gross_pnl: actualGrossPnL,
                fees: totalFees,
                net_pnl: actualNetPnL,
                lot_size_used: lotInfo.stepSize,
                quantity_sent: sellQty,
                success: true,
                credential_found: true,
                oco_status: orderListId ? 'CANCELLED' : undefined,
                balance_available: availableQty,
              });
              
              // Create success alert
              await supabase.from('alerts').insert({
                user_id: user.id,
                title: `💰 Adaptive Profit Taken: ${trade.pair}`,
                message: `Sold at ${exitPrice.toFixed(2)} | Net P&L: $${actualNetPnL.toFixed(3)}`,
                alert_type: 'profit_taken',
                data: { 
                  tradeId: trade.id, 
                  exitPrice, 
                  pnl: actualNetPnL,
                  profitThresholdUsed: minProfitThreshold,
                  unrealizedPnLAtTrigger: netUnrealizedPnL
                }
              });
              
              closedCount++;
              profitsTaken++;
              
              // Update bot run P&L - use trade's bot_run_id for accurate linking
              await updateBotRunPnL(supabase, user.id, actualNetPnL, trade.bot_run_id);
              
              // ============ PROFIT EXTRACTION TO FUNDING WALLET ============
              // If auto_extract_profits is enabled, transfer profit to funding wallet
              if (actualNetPnL > 0) {
                try {
                  const { data: botConfig } = await supabase
                    .from('bot_config')
                    .select('auto_extract_profits')
                    .eq('user_id', user.id)
                    .single();
                  
                  if (botConfig?.auto_extract_profits) {
                    console.log(`💰 Auto-extracting profit of $${actualNetPnL.toFixed(2)} to funding wallet...`);
                    
                    // Extract profit to funding wallet based on exchange
                    const extractResult = await extractProfitToFunding(
                      exchangeName,
                      actualNetPnL,
                      apiKey,
                      apiSecret,
                      passphrase // Pass OKX passphrase for transfer (undefined for Binance/Bybit is fine)
                    );
                    
                    if (extractResult.success) {
                      console.log(`✅ Profit extracted to funding wallet: $${actualNetPnL.toFixed(2)}`);
                      
                      await logProfitAudit(supabase, {
                        user_id: user.id,
                        trade_id: trade.id,
                        action: 'profit_extraction',
                        symbol: tradingSymbol,
                        exchange: exchangeName,
                        net_pnl: actualNetPnL,
                        success: true,
                        error_message: `Extracted $${actualNetPnL.toFixed(2)} to funding wallet`,
                      });
                    } else {
                      console.warn(`⚠️ Profit extraction failed: ${extractResult.error}`);
                    }
                  }
                } catch (extractError) {
                  console.error('Profit extraction error:', extractError);
                }
              }
            } else {
              console.error(`Failed to execute market sell for trade ${trade.id}`);
              
              // Log the failure with detailed info
              await logProfitAudit(supabase, {
                user_id: user.id,
                trade_id: trade.id,
                action: 'profit_take_failed',
                symbol: tradingSymbol,
                exchange: exchangeName,
                entry_price: actualEntryPrice,
                current_price: currentPrice,
                quantity: availableQty,
                gross_pnl: grossUnrealizedPnL,
                net_pnl: netUnrealizedPnL,
                lot_size_used: lotInfo.stepSize,
                quantity_sent: sellQty,
                success: false,
                error_message: 'Market sell order failed - possibly insufficient balance',
                credential_found: true,
                balance_available: availableQty,
              });
            }
          }
          
        } catch (e) {
          console.error(`Failed to check/close trade ${trade.id}:`, e);
        }
      }
      
      return new Response(JSON.stringify({
        message: `Checked ${openTrades.length} open positions`,
        openPositions: openTrades.length - closedCount,
        closedPositions: closedCount,
        profitsTaken,
        stalePositionsClosed,
        profitThreshold: minProfitThreshold,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE 2: Check specific OCO order
    if (ocoOrderListId && exchange?.toLowerCase() === 'binance') {
      const { data: connection } = await supabase
        .from("exchange_connections")
        .select("*")
        .eq("user_id", user.id)
        .ilike("exchange_name", exchange)
        .eq("is_connected", true)
        .maybeSingle();

      if (!connection) {
        return new Response(JSON.stringify({ error: `No ${exchange} connection found` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
      const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);

      const ocoStatus = await checkBinanceOCOStatus(apiKey, apiSecret, ocoOrderListId);

      return new Response(JSON.stringify({
        ocoOrderListId,
        status: ocoStatus.status,
        filledLeg: ocoStatus.filledLeg,
        avgPrice: ocoStatus.avgPrice,
        executedQty: ocoStatus.executedQty,
        filled: ocoStatus.status === 'ALL_DONE',
        pending: ocoStatus.status === 'EXECUTING',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MODE 3: Check specific single order (legacy)
    if (!exchange || !orderId || !symbol) {
      return new Response(JSON.stringify({ error: "Missing required parameters: exchange, orderId, symbol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Checking order status: ${exchange} ${symbol} ${orderId}`);

    // Get exchange credentials
    const { data: connection } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .ilike("exchange_name", exchange)
      .eq("is_connected", true)
      .maybeSingle();

    if (!connection) {
      return new Response(JSON.stringify({ error: `No ${exchange} connection found` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decrypt credentials (encryptionKey already declared at top of function)
    const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
    const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
    const passphrase = connection.encrypted_passphrase 
      ? await decryptSecret(connection.encrypted_passphrase, connection.encryption_iv!, encryptionKey)
      : undefined;

    let orderStatus: { status: string; avgPrice: number; executedQty: string; origQty: string };

    switch (exchange.toLowerCase()) {
      case 'binance':
        orderStatus = await checkBinanceOrderStatus(apiKey, apiSecret, symbol, orderId);
        break;
      case 'bybit':
        orderStatus = await checkBybitOrderStatus(apiKey, apiSecret, symbol, orderId);
        break;
      case 'okx':
        if (!passphrase) throw new Error("OKX requires passphrase");
        orderStatus = await checkOKXOrderStatus(apiKey, apiSecret, passphrase, symbol, orderId);
        break;
      default:
        return new Response(JSON.stringify({ error: `Exchange ${exchange} not supported for order status check` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    console.log(`Order ${orderId} status: ${orderStatus.status}, avgPrice: ${orderStatus.avgPrice}`);

    // If trade completed, update the trade record
    if (orderStatus.status === 'FILLED' && tradeId) {
      await supabase
        .from('trades')
        .update({
          exit_price: orderStatus.avgPrice,
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', tradeId);
    }

    return new Response(JSON.stringify({
      orderId,
      symbol,
      exchange,
      status: orderStatus.status,
      avgPrice: orderStatus.avgPrice,
      executedQty: orderStatus.executedQty,
      origQty: orderStatus.origQty,
      filled: orderStatus.status === 'FILLED',
      pending: orderStatus.status === 'NEW' || orderStatus.status === 'PARTIALLY_FILLED',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Check trade status error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper function to update bot run P&L
// FIXED: Now takes optional botRunId to update the SPECIFIC bot run linked to the trade
// Falls back to finding the most recent running bot if no botRunId provided
async function updateBotRunPnL(supabase: any, userId: string, pnl: number, botRunId?: string) {
  let botRun;
  
  if (botRunId) {
    // Direct lookup by bot_run_id (preferred - accurate)
    const { data } = await supabase
      .from('bot_runs')
      .select('id, current_pnl, hit_rate, trades_executed')
      .eq('id', botRunId)
      .maybeSingle();
    botRun = data;
    console.log(`[updateBotRunPnL] Direct lookup: bot_run_id=${botRunId}, found=${!!botRun}`);
  }
  
  // Fallback: find most recent running bot for this user
  if (!botRun) {
    const { data } = await supabase
      .from('bot_runs')
      .select('id, current_pnl, hit_rate, trades_executed')
      .eq('user_id', userId)
      .eq('status', 'running')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    botRun = data;
    console.log(`[updateBotRunPnL] Fallback lookup: user_id=${userId}, found=${!!botRun}`);
  }
  
  if (botRun) {
    const newPnl = (botRun.current_pnl || 0) + pnl;
    const currentWins = Math.round(((botRun.hit_rate || 0) / 100) * (botRun.trades_executed || 0));
    const newWins = currentWins + (pnl > 0 ? 1 : 0);
    const newTotalTrades = (botRun.trades_executed || 0) + 1;
    const newHitRate = newTotalTrades > 0 ? (newWins / newTotalTrades) * 100 : 0;
    
    console.log(`[updateBotRunPnL] Updating bot ${botRun.id}: pnl ${botRun.current_pnl} -> ${newPnl}, trades ${botRun.trades_executed} -> ${newTotalTrades}`);
    
    await supabase.from('bot_runs').update({
      current_pnl: newPnl,
      hit_rate: newHitRate,
      trades_executed: newTotalTrades,
      updated_at: new Date().toISOString(),
    }).eq('id', botRun.id);
  } else {
    console.warn(`[updateBotRunPnL] No bot run found for user ${userId} (botRunId=${botRunId})`);
  }
}
