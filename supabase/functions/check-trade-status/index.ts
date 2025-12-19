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
      // LIMIT_MAKER or LIMIT = Take Profit
      if (order.type === 'LIMIT_MAKER' || order.type === 'LIMIT') {
        filledLeg = 'TP';
      }
      // STOP_LOSS_LIMIT = Stop Loss
      else if (order.type === 'STOP_LOSS_LIMIT') {
        filledLeg = 'SL';
      }
      executedQty = order.executedQty || '0';
      avgPrice = parseFloat(order.price) || 0;
      
      // Try to get actual average price from order details
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
    const { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions } = body;

    console.log(`Check trade status request:`, { exchange, orderId, symbol, tradeId, ocoOrderListId, checkOpenPositions });

    // MODE 1: Check all open positions for the user
    if (checkOpenPositions) {
      console.log(`Checking all open positions for user ${user.id}`);
      
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
          closedPositions: 0
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
      const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "";
      
      for (const trade of openTrades) {
        // Find the alert with OCO order info for this trade
        const alert = positionAlerts?.find(a => {
          const data = a.data as any;
          return data?.tradeId === trade.id;
        });
        
        if (!alert || !alert.data) {
          console.log(`No OCO info found for trade ${trade.id}`);
          continue;
        }
        
        const alertData = alert.data as any;
        const { orderListId, symbol: alertSymbol, direction, entryPrice, exchange: alertExchange } = alertData;
        
        if (!orderListId) {
          console.log(`No orderListId in alert for trade ${trade.id}`);
          continue;
        }
        
        // Get exchange credentials
        const { data: connection } = await supabase
          .from("exchange_connections")
          .select("*")
          .eq("user_id", user.id)
          .eq("exchange_name", alertExchange || trade.exchange_name)
          .eq("is_connected", true)
          .single();
        
        if (!connection || !connection.encrypted_api_key) {
          console.log(`No credentials for ${alertExchange || trade.exchange_name}`);
          continue;
        }
        
        try {
          const apiKey = await decryptSecret(connection.encrypted_api_key!, connection.encryption_iv!, encryptionKey);
          const apiSecret = await decryptSecret(connection.encrypted_api_secret!, connection.encryption_iv!, encryptionKey);
          
          // Check OCO order status
          const ocoStatus = await checkBinanceOCOStatus(apiKey, apiSecret, orderListId);
          
          console.log(`OCO ${orderListId} for trade ${trade.id}: ${ocoStatus.status}, filled: ${ocoStatus.filledLeg}`);
          
          if (ocoStatus.status === 'ALL_DONE' && ocoStatus.filledLeg !== 'NONE') {
            // Position closed - update trade
            const exitPrice = ocoStatus.avgPrice;
            const tradeDirection = trade.direction || direction;
            
            // Calculate P&L
            const actualEntryPrice = trade.entry_price || entryPrice;
            const priceDiff = tradeDirection === 'long'
              ? exitPrice - actualEntryPrice
              : actualEntryPrice - exitPrice;
            
            const positionSize = trade.amount || 50;
            const leverage = trade.leverage || 1;
            const grossPnL = (priceDiff / actualEntryPrice) * positionSize * leverage;
            
            // Deduct fees
            const feeRate = EXCHANGE_FEES[(alertExchange || trade.exchange_name || 'binance').toLowerCase()] || 0.001;
            const fees = positionSize * feeRate * 2;
            const netPnL = grossPnL - fees;
            
            console.log(`Closing trade ${trade.id}: ${ocoStatus.filledLeg}, Exit: ${exitPrice}, P&L: $${netPnL.toFixed(2)}`);
            
            // Update trade record
            const { error: updateError } = await supabase
              .from('trades')
              .update({
                exit_price: exitPrice,
                profit_loss: netPnL,
                profit_percentage: (netPnL / positionSize) * 100,
                status: 'closed',
                closed_at: new Date().toISOString(),
              })
              .eq('id', trade.id);
            
            if (updateError) {
              console.error(`Failed to update trade ${trade.id}:`, updateError);
            } else {
              closedCount++;
              
              // Create alert for closed position
              await supabase.from('alerts').insert({
                user_id: user.id,
                title: `${ocoStatus.filledLeg === 'TP' ? '✅ Take Profit' : '🛑 Stop Loss'}: ${trade.pair}`,
                message: `${tradeDirection?.toUpperCase()} closed at ${exitPrice.toFixed(2)} | P&L: $${netPnL.toFixed(2)}`,
                alert_type: 'position_closed',
                data: { 
                  tradeId: trade.id,
                  filledLeg: ocoStatus.filledLeg,
                  exitPrice,
                  pnl: netPnL,
                  direction: tradeDirection
                }
              });
              
              // Update bot run P&L if applicable
              const { data: botRun } = await supabase
                .from('bot_runs')
                .select('id, current_pnl, hit_rate, trades_executed')
                .eq('user_id', user.id)
                .eq('status', 'running')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              
              if (botRun) {
                const newPnl = (botRun.current_pnl || 0) + netPnL;
                const wins = Math.round(((botRun.hit_rate || 0) / 100) * (botRun.trades_executed || 0)) + (netPnL > 0 ? 1 : 0);
                const totalTrades = botRun.trades_executed || 1;
                const newHitRate = (wins / totalTrades) * 100;
                
                await supabase.from('bot_runs').update({
                  current_pnl: newPnl,
                  hit_rate: newHitRate,
                }).eq('id', botRun.id);
              }
            }
          }
        } catch (e) {
          console.error(`Failed to check OCO for trade ${trade.id}:`, e);
        }
      }
      
      return new Response(JSON.stringify({
        message: `Checked ${openTrades.length} open positions`,
        openPositions: openTrades.length,
        closedPositions: closedCount,
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
        .eq("exchange_name", exchange)
        .eq("is_connected", true)
        .single();

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
      .eq("exchange_name", exchange)
      .eq("is_connected", true)
      .single();

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
