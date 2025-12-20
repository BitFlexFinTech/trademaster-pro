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

// Default profit threshold - take profit as soon as fees are covered with ANY profit
// Lowered from 0.05% to 0.01% for continuous profit-taking
const DEFAULT_PROFIT_THRESHOLD = 0.0001; // 0.01%

// Stale position threshold - force close after 4 hours
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

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
    const { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions, profitThreshold } = body;

    console.log(`Check trade status request:`, { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions, profitThreshold });

    // Get user's profit threshold from bot_config or use default
    const minProfitThreshold = profitThreshold || DEFAULT_PROFIT_THRESHOLD;

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
      const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "";
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
            
            if (ocoStatus.status === 'ALL_DONE' && ocoStatus.filledLeg !== 'NONE') {
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
              
              // Update bot run P&L
              await updateBotRunPnL(supabase, user.id, netPnL);
              continue;
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
                await enforceRateLimit(exchangeName);
                const sellQty = availableQty.toFixed(5);
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
                  await updateBotRunPnL(supabase, user.id, actualNetPnL);
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
              await enforceRateLimit(exchangeName);
              const sellQty = balance.free.toFixed(5);
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
                await updateBotRunPnL(supabase, user.id, actualNetPnL);
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
          
          // CONTINUOUS PROFIT-TAKING: Take profit as soon as fees are covered
          // Exit when: net P&L > $0.01 (absolute minimum after fees)
          // This ensures we NEVER wait for a fixed TP - we take any profit available
          const shouldTakeProfit = netUnrealizedPnL > 0.01; // Just $0.01 net profit after fees
          
          if (shouldTakeProfit) {
            console.log(`🎯 PROFIT THRESHOLD MET! Taking profit on trade ${trade.id}: $${netUnrealizedPnL.toFixed(3)}`);
            
            // Get actual balance of the asset
            await enforceRateLimit(exchangeName);
            const balance = await getBinanceBalance(apiKey, apiSecret, baseAsset);
            const availableQty = balance.free + balance.locked;
            
            if (availableQty <= 0) {
              console.log(`No ${baseAsset} balance available to sell`);
              continue;
            }
            
            // Cancel the OCO order first (if exists)
            if (orderListId) {
              await enforceRateLimit(exchangeName);
              const cancelled = await cancelBinanceOCO(apiKey, apiSecret, tradingSymbol, orderListId);
              if (!cancelled) {
                console.log(`Failed to cancel OCO, trying market sell anyway`);
              }
            }
            
            // Format quantity for Binance (usually 5 decimal places for crypto)
            const sellQty = availableQty.toFixed(5);
            
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
              
              // Update bot run P&L
              await updateBotRunPnL(supabase, user.id, actualNetPnL);
            } else {
              console.error(`Failed to execute market sell for trade ${trade.id}`);
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

      const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "";
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

    // Decrypt credentials
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "";
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
async function updateBotRunPnL(supabase: any, userId: string, pnl: number) {
  const { data: botRun } = await supabase
    .from('bot_runs')
    .select('id, current_pnl, hit_rate, trades_executed')
    .eq('user_id', userId)
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (botRun) {
    const newPnl = (botRun.current_pnl || 0) + pnl;
    const currentWins = Math.round(((botRun.hit_rate || 0) / 100) * (botRun.trades_executed || 0));
    const newWins = currentWins + (pnl > 0 ? 1 : 0);
    const newTotalTrades = (botRun.trades_executed || 0) + 1;
    const newHitRate = (newWins / newTotalTrades) * 100;
    
    await supabase.from('bot_runs').update({
      current_pnl: newPnl,
      hit_rate: newHitRate,
      trades_executed: newTotalTrades,
    }).eq('id', botRun.id);
  }
}
