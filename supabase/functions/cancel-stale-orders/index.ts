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

// Get all open orders from Binance
async function getBinanceOpenOrders(apiKey: string, apiSecret: string, symbol?: string): Promise<any[]> {
  const timestamp = Date.now();
  let params = `timestamp=${timestamp}`;
  if (symbol) {
    params += `&symbol=${symbol}`;
  }
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/openOrders?${params}&signature=${signature}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('Failed to get open orders:', error);
    return [];
  }
  
  return await response.json();
}

// Cancel a Binance order
async function cancelBinanceOrder(apiKey: string, apiSecret: string, symbol: string, orderId: string): Promise<boolean> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "DELETE",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error(`Failed to cancel order ${orderId}:`, error);
    return false;
  }
  
  console.log(`✅ Cancelled order ${orderId} on ${symbol}`);
  return true;
}

// Get Bybit open orders
async function getBybitOpenOrders(apiKey: string, apiSecret: string): Promise<any[]> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `category=spot&settleCoin=USDT`;
  const signPayload = timestamp + apiKey + recvWindow + params;
  const signature = await hmacSha256(apiSecret, signPayload);
  
  const response = await fetch(`https://api.bybit.com/v5/order/realtime?${params}`, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });
  
  const data = await response.json();
  if (data.retCode !== 0) {
    console.error('Failed to get Bybit orders:', data.retMsg);
    return [];
  }
  
  return data.result?.list || [];
}

// Cancel Bybit order
async function cancelBybitOrder(apiKey: string, apiSecret: string, symbol: string, orderId: string): Promise<boolean> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const body = JSON.stringify({ category: "spot", symbol, orderId });
  const signPayload = timestamp + apiKey + recvWindow + body;
  const signature = await hmacSha256(apiSecret, signPayload);
  
  const response = await fetch("https://api.bybit.com/v5/order/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    body,
  });
  
  const data = await response.json();
  if (data.retCode !== 0) {
    console.error(`Failed to cancel Bybit order ${orderId}:`, data.retMsg);
    return false;
  }
  
  console.log(`✅ Cancelled Bybit order ${orderId}`);
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { maxAgeSeconds = 60, exchange, symbol } = body;
    
    console.log(`🧹 Cancelling stale orders older than ${maxAgeSeconds}s`);
    
    // Get user's exchange connections
    const { data: connections } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true);
    
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        cancelledCount: 0,
        message: "No connected exchanges" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    let totalCancelled = 0;
    const results: { exchange: string; cancelled: number; errors: string[] }[] = [];
    
    for (const conn of connections) {
      if (exchange && conn.exchange_name.toLowerCase() !== exchange.toLowerCase()) {
        continue;
      }
      
      const exchangeResults = { exchange: conn.exchange_name, cancelled: 0, errors: [] as string[] };
      
      if (!conn.encrypted_api_key || !conn.encrypted_api_secret || !conn.encryption_iv || !encryptionKey) {
        exchangeResults.errors.push("Missing credentials");
        results.push(exchangeResults);
        continue;
      }
      
      try {
        const apiKey = await decryptSecret(conn.encrypted_api_key, conn.encryption_iv, encryptionKey);
        const apiSecret = await decryptSecret(conn.encrypted_api_secret, conn.encryption_iv, encryptionKey);
        
        const exchangeName = conn.exchange_name.toLowerCase();
        const now = Date.now();
        const maxAgeMs = maxAgeSeconds * 1000;
        
        if (exchangeName === "binance") {
          const orders = await getBinanceOpenOrders(apiKey, apiSecret, symbol);
          console.log(`Found ${orders.length} open orders on Binance`);
          
          for (const order of orders) {
            const orderAge = now - order.time;
            if (orderAge > maxAgeMs) {
              const cancelled = await cancelBinanceOrder(apiKey, apiSecret, order.symbol, order.orderId.toString());
              if (cancelled) {
                exchangeResults.cancelled++;
                totalCancelled++;
              }
            }
          }
        } else if (exchangeName === "bybit") {
          const orders = await getBybitOpenOrders(apiKey, apiSecret);
          console.log(`Found ${orders.length} open orders on Bybit`);
          
          for (const order of orders) {
            const orderTime = parseInt(order.createdTime);
            const orderAge = now - orderTime;
            if (orderAge > maxAgeMs) {
              const cancelled = await cancelBybitOrder(apiKey, apiSecret, order.symbol, order.orderId);
              if (cancelled) {
                exchangeResults.cancelled++;
                totalCancelled++;
              }
            }
          }
        }
        // Add more exchanges as needed
        
      } catch (err) {
        console.error(`Error processing ${conn.exchange_name}:`, err);
        exchangeResults.errors.push(err instanceof Error ? err.message : "Unknown error");
      }
      
      results.push(exchangeResults);
    }
    
    console.log(`✅ Total cancelled: ${totalCancelled} stale orders`);
    
    return new Response(JSON.stringify({
      success: true,
      cancelledCount: totalCancelled,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    
  } catch (err) {
    console.error("Error in cancel-stale-orders:", err);
    return new Response(JSON.stringify({ 
      error: err instanceof Error ? err.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});