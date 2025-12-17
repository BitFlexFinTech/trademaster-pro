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

// HMAC-SHA512 for Kraken
async function hmacSha512(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message.buffer as ArrayBuffer);
  return new Uint8Array(signature);
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

// Check Binance order status
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
  
  // Map Bybit status to standard format
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

    const { exchange, orderId, symbol, tradeId } = await req.json();

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
