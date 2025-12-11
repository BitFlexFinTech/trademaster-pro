import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BINANCE_API = "https://api.binance.com/api/v3";

// Rate limiting: 30 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

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

// Top 20 crypto symbols to track
const TOP_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
  "SOLUSDT", "DOTUSDT", "DOGEUSDT", "AVAXUSDT", "SHIBUSDT",
  "MATICUSDT", "LTCUSDT", "LINKUSDT", "ATOMUSDT", "UNIUSDT",
  "XLMUSDT", "ETCUSDT", "NEARUSDT", "ALGOUSDT", "VETUSDT"
];

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Fetch 24hr ticker data from Binance (no API key required, no rate limits for public endpoints)
    const response = await fetch(`${BINANCE_API}/ticker/24hr`, {
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const allTickers: BinanceTicker[] = await response.json();
    
    // Filter to only our tracked symbols
    const trackedTickers = allTickers.filter(t => TOP_SYMBOLS.includes(t.symbol));
    console.log(`Fetched ${trackedTickers.length} tickers from Binance`);

    // Update price cache in database
    for (const ticker of trackedTickers) {
      const symbol = ticker.symbol.replace("USDT", "");
      const price = parseFloat(ticker.lastPrice);
      const change24h = parseFloat(ticker.priceChangePercent);
      const volume24h = parseFloat(ticker.quoteVolume);
      
      // Estimate market cap (rough calculation based on circulating supply estimates)
      const marketCapMultipliers: Record<string, number> = {
        BTC: 19500000, ETH: 120000000, BNB: 150000000, XRP: 55000000000,
        ADA: 35000000000, SOL: 430000000, DOT: 1300000000, DOGE: 140000000000,
        AVAX: 380000000, SHIB: 589000000000000, MATIC: 10000000000, LTC: 74000000,
        LINK: 600000000, ATOM: 390000000, UNI: 750000000, XLM: 28000000000,
        ETC: 145000000, NEAR: 1100000000, ALGO: 8000000000, VET: 72000000000,
      };
      const marketCap = price * (marketCapMultipliers[symbol] || 1000000000);

      const { error } = await supabase
        .from("price_cache")
        .upsert({
          symbol,
          price,
          change_24h: change24h,
          volume_24h: volume24h,
          market_cap: marketCap,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: "symbol",
        });

      if (error) {
        console.error(`Error updating ${symbol}:`, error);
      }
    }

    // Generate arbitrage opportunities based on real prices
    const exchanges = ["Binance", "KuCoin", "Bybit", "OKX", "Kraken", "Hyperliquid", "Nexo"];
    const opportunities = [];

    for (let i = 0; i < 50; i++) {
      const ticker = trackedTickers[i % trackedTickers.length];
      const symbol = ticker.symbol.replace("USDT", "");
      const basePrice = parseFloat(ticker.lastPrice);
      
      const buyExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      let sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      while (sellExchange === buyExchange) {
        sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
      }

      // Realistic spread simulation (-0.3% to 1.2%)
      const spread = (Math.random() * 1.5 - 0.3) / 100;
      const buyPrice = basePrice * (1 - Math.abs(spread) / 2);
      const sellPrice = basePrice * (1 + spread / 2);
      const profitPercentage = ((sellPrice - buyPrice) / buyPrice) * 100;

      opportunities.push({
        pair: `${symbol}/USDT`,
        buy_exchange: buyExchange,
        sell_exchange: sellExchange,
        buy_price: buyPrice,
        sell_price: sellPrice,
        profit_percentage: profitPercentage,
        volume_24h: parseFloat(ticker.quoteVolume),
        expires_at: new Date(Date.now() + Math.random() * 300000 + 60000).toISOString(),
      });
    }

    // Sort by profit and take top 50
    opportunities.sort((a, b) => b.profit_percentage - a.profit_percentage);
    const top50 = opportunities.slice(0, 50);

    // Clear old and insert new opportunities
    await supabase.from("arbitrage_opportunities").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    
    for (const opp of top50) {
      await supabase.from("arbitrage_opportunities").insert(opp);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        source: "Binance",
        prices_updated: trackedTickers.length,
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
