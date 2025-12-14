import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Crypto helpers
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyData = new TextEncoder().encode(encryptionKey.padEnd(32, "0").slice(0, 32));
  const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
  const encryptedData = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const ivData = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivData }, key, encryptedData);
  return new TextDecoder().decode(decrypted);
}

async function getBinanceLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  const res = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
  const data = await res.json();
  const lotFilter = data.symbols?.[0]?.filters?.find((f: { filterType: string }) => f.filterType === "LOT_SIZE");
  const notionalFilter = data.symbols?.[0]?.filters?.find((f: { filterType: string }) => f.filterType === "NOTIONAL");
  return {
    stepSize: lotFilter?.stepSize || "0.00001",
    minQty: lotFilter?.minQty || "0.00001",
    minNotional: parseFloat(notionalFilter?.minNotional || "5"),
  };
}

function roundToStepSize(quantity: number, stepSize: string): string {
  const step = parseFloat(stepSize);
  const precision = stepSize.includes(".") ? stepSize.split(".")[1].replace(/0+$/, "").length : 0;
  const rounded = Math.floor(quantity / step) * step;
  return rounded.toFixed(precision);
}

// Get all Binance balances
async function getBinanceBalances(apiKey: string, apiSecret: string): Promise<Array<{ asset: string; free: number }>> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, queryString);
  
  const res = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch Binance balances: ${err}`);
  }
  
  const data = await res.json();
  return data.balances
    .map((b: { asset: string; free: string }) => ({ asset: b.asset, free: parseFloat(b.free) }))
    .filter((b: { free: number }) => b.free > 0);
}

// Sell asset to USDT
async function sellAssetToUSDT(
  apiKey: string, 
  apiSecret: string, 
  asset: string, 
  quantity: number
): Promise<{ success: boolean; usdtReceived: number; error?: string }> {
  const symbol = `${asset}USDT`;
  
  try {
    // Get lot size info
    const lotInfo = await getBinanceLotSize(symbol);
    const roundedQty = roundToStepSize(quantity, lotInfo.stepSize);
    
    if (parseFloat(roundedQty) < parseFloat(lotInfo.minQty)) {
      return { success: false, usdtReceived: 0, error: `Quantity ${roundedQty} below min ${lotInfo.minQty}` };
    }
    
    // Get current price to check notional
    const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const priceData = await priceRes.json();
    const currentPrice = parseFloat(priceData.price);
    const notional = parseFloat(roundedQty) * currentPrice;
    
    if (notional < lotInfo.minNotional) {
      return { success: false, usdtReceived: 0, error: `Notional $${notional.toFixed(2)} below min $${lotInfo.minNotional}` };
    }
    
    // Place market SELL order
    const timestamp = Date.now();
    const params = `symbol=${symbol}&side=SELL&type=MARKET&quantity=${roundedQty}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);
    
    const res = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    
    if (!res.ok) {
      const err = await res.text();
      return { success: false, usdtReceived: 0, error: `Sell failed: ${err}` };
    }
    
    const order = await res.json();
    const executedQty = parseFloat(order.executedQty || "0");
    const avgPrice = parseFloat(order.cummulativeQuoteQty || "0") / executedQty || currentPrice;
    const usdtReceived = executedQty * avgPrice;
    
    console.log(`Sold ${executedQty} ${asset} at $${avgPrice.toFixed(4)} = $${usdtReceived.toFixed(2)} USDT`);
    
    return { success: true, usdtReceived };
  } catch (e) {
    return { success: false, usdtReceived: 0, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY") || "default-encryption-key-32chars!!";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
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

    // Get Binance connection
    const { data: exchange } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("exchange_name", "Binance")
      .eq("is_connected", true)
      .single();

    if (!exchange || !exchange.encrypted_api_key || !exchange.encrypted_api_secret || !exchange.encryption_iv) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "No connected Binance account found",
        closedPositions: [] 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Decrypt API credentials
    const apiKey = await decryptSecret(exchange.encrypted_api_key, exchange.encryption_iv, encryptionKey);
    const apiSecret = await decryptSecret(exchange.encrypted_api_secret, exchange.encryption_iv, encryptionKey);

    console.log("Fetching Binance balances...");
    
    // Get all balances
    const balances = await getBinanceBalances(apiKey, apiSecret);
    console.log(`Found ${balances.length} assets with balance:`, balances.map(b => `${b.asset}: ${b.free}`).join(", "));

    // Filter out USDT and stablecoins - we want to sell everything else
    const stablecoins = ["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD"];
    const assetsToSell = balances.filter(b => !stablecoins.includes(b.asset) && b.free > 0);

    if (assetsToSell.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No non-stablecoin positions to close",
        closedPositions: [],
        totalUsdtRecovered: 0,
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`Selling ${assetsToSell.length} assets to USDT:`, assetsToSell.map(a => a.asset).join(", "));

    // Sell each asset
    const closedPositions: Array<{ asset: string; quantity: number; usdtReceived: number; success: boolean; error?: string }> = [];
    let totalUsdtRecovered = 0;

    for (const asset of assetsToSell) {
      const result = await sellAssetToUSDT(apiKey, apiSecret, asset.asset, asset.free);
      closedPositions.push({
        asset: asset.asset,
        quantity: asset.free,
        usdtReceived: result.usdtReceived,
        success: result.success,
        error: result.error,
      });
      if (result.success) {
        totalUsdtRecovered += result.usdtReceived;
      }
    }

    // Create alert
    await supabase.from("alerts").insert({
      user_id: user.id,
      alert_type: "positions_closed",
      title: "Positions Closed to USDT",
      message: `Closed ${closedPositions.filter(p => p.success).length} positions. Total USDT recovered: $${totalUsdtRecovered.toFixed(2)}`,
      data: { closedPositions, totalUsdtRecovered },
    });

    console.log(`Closed ${closedPositions.filter(p => p.success).length} positions, recovered $${totalUsdtRecovered.toFixed(2)} USDT`);

    return new Response(JSON.stringify({
      success: true,
      message: `Converted ${closedPositions.filter(p => p.success).length} assets to USDT`,
      closedPositions,
      totalUsdtRecovered,
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Convert to USDT error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message, closedPositions: [], totalUsdtRecovered: 0 }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
