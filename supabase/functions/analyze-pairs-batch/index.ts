import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Top trading pairs for analysis - ordered by liquidity
const FOCUS_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'MATICUSDT', 'LINKUSDT',
  'DOTUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
  'ARBUSDT', 'OPUSDT', 'APTUSDT', 'INJUSDT', 'SUIUSDT',
];

interface PairAnalysis {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  volatility: number;
  momentum: number;
  spread: number;
  opportunityScore: number;
  suggestedDirection: 'long' | 'short';
  confidence: number;
}

interface RealtimePriceData {
  price: number;
  priceChangePercent: number;
  volume: number;
  lastUpdated: number;
  bidPrice?: number;
  askPrice?: number;
  spread?: number;
}

// Analyze a single pair and return opportunity score
async function analyzePair(
  symbol: string,
  wsData?: RealtimePriceData
): Promise<PairAnalysis | null> {
  try {
    let price = 0;
    let change24h = 0;
    let volume = 0;
    let bidPrice = 0;
    let askPrice = 0;
    let lastUpdated = 0;

    // Use WebSocket data if available and fresh (< 5 seconds old)
    if (wsData && wsData.price > 0 && Date.now() - wsData.lastUpdated < 5000) {
      price = wsData.price;
      change24h = wsData.priceChangePercent;
      volume = wsData.volume;
      bidPrice = wsData.bidPrice || price;
      askPrice = wsData.askPrice || price;
      lastUpdated = wsData.lastUpdated;
    } else {
      // Fallback to REST API
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      if (!response.ok) return null;
      
      const data = await response.json();
      price = parseFloat(data.lastPrice);
      change24h = parseFloat(data.priceChangePercent);
      volume = parseFloat(data.quoteVolume); // Volume in USDT
      bidPrice = parseFloat(data.bidPrice);
      askPrice = parseFloat(data.askPrice);
      lastUpdated = Date.now();
    }

    if (price <= 0) return null;

    // Calculate metrics
    const volatility = Math.abs(change24h);
    const momentum = change24h; // Positive = up, negative = down
    const spread = price > 0 ? ((askPrice - bidPrice) / price) * 100 : 0;

    // Calculate opportunity score
    // Higher volatility = more opportunity (but cap it)
    // Higher volume = more reliable
    // Lower spread = better execution
    const volatilityScore = Math.min(volatility / 5, 1); // Cap at 5% = 1.0
    const volumeScore = Math.min(volume / 100000000, 1); // Cap at $100M = 1.0
    const spreadScore = Math.max(0, 1 - (spread * 20)); // Low spread is good
    const momentumScore = Math.abs(momentum) > 0.1 ? 1 : 0.5; // Prefer moving pairs

    // Combined opportunity score (0-100)
    const opportunityScore = (
      volatilityScore * 30 +
      volumeScore * 30 +
      spreadScore * 20 +
      momentumScore * 20
    );

    // Determine suggested direction based on momentum
    const suggestedDirection = momentum >= 0 ? 'long' : 'short';
    
    // Confidence based on how strong the signal is
    const confidence = Math.min(100, opportunityScore + Math.abs(momentum) * 10);

    return {
      symbol,
      price,
      change24h,
      volume24h: volume,
      volatility,
      momentum,
      spread,
      opportunityScore,
      suggestedDirection,
      confidence,
    };
  } catch (error) {
    console.error(`Failed to analyze ${symbol}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { realtimePrices, focusPairs, minScore, limit } = body;

    // Use provided pairs or default
    const pairsToAnalyze = focusPairs?.length > 0 ? focusPairs : FOCUS_PAIRS;
    const minimumScore = minScore || 40;
    const maxResults = limit || 5;

    console.log(`🔍 Analyzing ${pairsToAnalyze.length} pairs in parallel...`);
    const startTime = Date.now();

    // Analyze all pairs in parallel
    const analysisPromises = pairsToAnalyze.map((symbol: string) => {
      const wsData = realtimePrices?.[symbol.toUpperCase()];
      return analyzePair(symbol.toUpperCase(), wsData);
    });

    const results = await Promise.all(analysisPromises);

    // Filter out failed analyses and low scores
    const validResults = results
      .filter((r): r is PairAnalysis => r !== null && r.opportunityScore >= minimumScore)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    const analysisTime = Date.now() - startTime;
    console.log(`✅ Analysis complete in ${analysisTime}ms. Found ${validResults.length} opportunities.`);

    // Return top opportunities
    const topOpportunity = validResults[0] || null;
    const alternatives = validResults.slice(1, maxResults);

    return new Response(
      JSON.stringify({
        success: true,
        topOpportunity,
        alternatives,
        totalAnalyzed: pairsToAnalyze.length,
        qualifiedCount: validResults.length,
        analysisTimeMs: analysisTime,
        timestamp: Date.now(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Batch analysis error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
