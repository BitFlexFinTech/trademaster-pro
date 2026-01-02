import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cached Top 10 list with TTL
let cachedTop10: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// Default Top 10 by market cap (fallback)
const DEFAULT_TOP_10 = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'TRXUSDT',
  'DOTUSDT',
];

async function fetchTop10FromBinance(): Promise<string[]> {
  try {
    // Fetch 24h ticker data for volume ranking
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) {
      console.error('Binance API error:', response.status);
      return DEFAULT_TOP_10;
    }

    const tickers = await response.json();
    
    // Filter USDT pairs and sort by quote volume
    const usdtPairs = tickers
      .filter((t: any) => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
      .map((t: any) => ({
        symbol: t.symbol,
        volume: parseFloat(t.quoteVolume) || 0,
      }))
      .sort((a: any, b: any) => b.volume - a.volume)
      .slice(0, 10)
      .map((t: any) => t.symbol);

    console.log('[fetch-top10-assets] Fetched from Binance:', usdtPairs);
    return usdtPairs;
  } catch (error) {
    console.error('[fetch-top10-assets] Error fetching from Binance:', error);
    return DEFAULT_TOP_10;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    
    // Check cache
    if (cachedTop10 && (now - cacheTimestamp) < CACHE_TTL_MS) {
      console.log('[fetch-top10-assets] Returning cached list');
      return new Response(JSON.stringify({
        symbols: cachedTop10,
        cached: true,
        cacheAge: Math.round((now - cacheTimestamp) / 1000),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch fresh data
    const top10 = await fetchTop10FromBinance();
    
    // Update cache
    cachedTop10 = top10;
    cacheTimestamp = now;

    return new Response(JSON.stringify({
      symbols: top10,
      cached: false,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[fetch-top10-assets] Error:', error);
    return new Response(JSON.stringify({
      symbols: DEFAULT_TOP_10,
      error: 'Using fallback list',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
