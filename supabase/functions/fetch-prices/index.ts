import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Rate limiting: 30 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const rateCheck = checkRateLimit(ip);
  
  if (!rateCheck.allowed) {
    console.log(`Rate limit exceeded for IP: ${ip}`);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      { 
        status: 429, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Retry-After": String(rateCheck.retryAfter),
        } 
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch top 20 cryptocurrencies from CoinGecko
    const response = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h`,
      {
        headers: {
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const coins = await response.json();
    console.log(`Fetched ${coins.length} coins from CoinGecko`);

    // Update price cache in database
    for (const coin of coins) {
      const { error } = await supabase
        .from("price_cache")
        .upsert({
          symbol: coin.symbol.toUpperCase(),
          price: coin.current_price,
          change_24h: coin.price_change_percentage_24h,
          volume_24h: coin.total_volume,
          market_cap: coin.market_cap,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: "symbol",
        });

      if (error) {
        console.error(`Error updating ${coin.symbol}:`, error);
      }
    }

    // Generate mock arbitrage opportunities based on real prices
    const exchanges = ["Binance", "KuCoin", "Bybit", "OKX", "Kraken", "Hyperliquid", "Nexo"];
    const opportunities = [];

    for (let i = 0; i < 50; i++) {
      const coin = coins[i % coins.length];
      const buyExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      let sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      while (sellExchange === buyExchange) {
        sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      }

      const basePrice = coin.current_price;
      const spread = (Math.random() * 2 - 0.5) / 100; // -0.5% to 1.5% spread
      const buyPrice = basePrice * (1 - Math.abs(spread) / 2);
      const sellPrice = basePrice * (1 + spread / 2);
      const profitPercentage = ((sellPrice - buyPrice) / buyPrice) * 100;

      opportunities.push({
        pair: `${coin.symbol.toUpperCase()}/USDT`,
        buy_exchange: buyExchange,
        sell_exchange: sellExchange,
        buy_price: buyPrice,
        sell_price: sellPrice,
        profit_percentage: profitPercentage,
        volume_24h: coin.total_volume,
        expires_at: new Date(Date.now() + Math.random() * 300000 + 60000).toISOString(), // 1-6 min expiry
      });
    }

    // Sort by profit and take top 50
    opportunities.sort((a, b) => b.profit_percentage - a.profit_percentage);
    const top50 = opportunities.slice(0, 50);

    // Clear old opportunities and insert new ones
    await supabase.from("arbitrage_opportunities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    
    for (const opp of top50) {
      await supabase.from("arbitrage_opportunities").insert(opp);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        prices_updated: coins.length,
        opportunities_generated: top50.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching prices:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
