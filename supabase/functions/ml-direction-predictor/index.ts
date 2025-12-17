import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Excluded pair+direction combinations (historically unprofitable)
const EXCLUDED_COMBOS = [
  { pair: 'DOGE/USDT', direction: 'long' },
  { pair: 'DOT/USDT', direction: 'long' },
  { pair: 'AVAX/USDT', direction: 'long' },
  { pair: 'ADA/USDT', direction: 'long' },
];

// Spot-safe pairs for LONG trades
const SPOT_SAFE_PAIRS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'MATIC/USDT'];

interface PredictionRequest {
  pair: string;
  mode: 'spot' | 'leverage';
  priceChange1h?: number;
  priceChange24h?: number;
  volatility?: number;
  rsi?: number;
  orderBookImbalance?: number;
}

interface PredictionResponse {
  direction: 'long' | 'short';
  confidence: number;
  reasoning: string;
  excluded: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: PredictionRequest = await req.json();
    const { pair, mode, priceChange1h = 0, priceChange24h = 0, volatility = 0.5, rsi = 50, orderBookImbalance = 0 } = body;

    // Check if this pair+direction is excluded
    const isExcludedLong = EXCLUDED_COMBOS.some(c => c.pair === pair && c.direction === 'long');
    const isExcludedShort = EXCLUDED_COMBOS.some(c => c.pair === pair && c.direction === 'short');

    // Fetch historical win rates for this pair from user's trades (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('direction, profit_loss')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(100);

    let shortWinRate = 70; // Default: SHORT historically better
    let longWinRate = 40;  // Default: LONG historically worse

    if (trades && trades.length >= 10) {
      const longTrades = trades.filter(t => t.direction === 'long');
      const shortTrades = trades.filter(t => t.direction === 'short');
      
      if (longTrades.length >= 5) {
        const longWins = longTrades.filter(t => (t.profit_loss || 0) > 0).length;
        longWinRate = (longWins / longTrades.length) * 100;
      }
      
      if (shortTrades.length >= 5) {
        const shortWins = shortTrades.filter(t => (t.profit_loss || 0) > 0).length;
        shortWinRate = (shortWins / shortTrades.length) * 100;
      }
    }

    console.log(`📊 ${pair} Win Rates - SHORT: ${shortWinRate.toFixed(1)}%, LONG: ${longWinRate.toFixed(1)}%`);

    // ML-based direction prediction
    let direction: 'long' | 'short';
    let confidence: number;
    let reasoning: string;

    // SPOT MODE: Only LONG trades, but avoid excluded pairs
    if (mode === 'spot') {
      if (isExcludedLong || !SPOT_SAFE_PAIRS.includes(pair)) {
        // Skip this pair in spot mode
        return new Response(JSON.stringify({
          direction: 'long',
          confidence: 0,
          reasoning: `${pair} is not recommended for SPOT LONG trades`,
          excluded: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      direction = 'long';
      confidence = longWinRate;
      reasoning = `SPOT mode: LONG only on ${pair} (${longWinRate.toFixed(1)}% win rate)`;
    } else {
      // LEVERAGE MODE: Smart direction selection
      
      // Rule 1: If pair+direction is excluded, use opposite
      if (isExcludedLong && !isExcludedShort) {
        direction = 'short';
        confidence = shortWinRate;
        reasoning = `LONG excluded for ${pair}, using SHORT (${shortWinRate.toFixed(1)}% win rate)`;
      } else if (isExcludedShort && !isExcludedLong) {
        direction = 'long';
        confidence = longWinRate;
        reasoning = `SHORT excluded for ${pair}, using LONG (${longWinRate.toFixed(1)}% win rate)`;
      } else if (isExcludedLong && isExcludedShort) {
        // Both excluded - skip this pair entirely
        return new Response(JSON.stringify({
          direction: 'short',
          confidence: 0,
          reasoning: `${pair} is excluded for both directions`,
          excluded: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Rule 2: Use historical win rate bias
        const winRateDiff = shortWinRate - longWinRate;
        
        if (winRateDiff >= 15) {
          // SHORT significantly better - use 80% probability for SHORT
          direction = Math.random() < 0.80 ? 'short' : 'long';
          confidence = direction === 'short' ? shortWinRate : longWinRate;
          reasoning = `SHORT outperforms LONG by ${winRateDiff.toFixed(1)}% - biased 80% SHORT`;
        } else if (winRateDiff <= -15) {
          // LONG significantly better - use 80% probability for LONG
          direction = Math.random() < 0.80 ? 'long' : 'short';
          confidence = direction === 'long' ? longWinRate : shortWinRate;
          reasoning = `LONG outperforms SHORT by ${Math.abs(winRateDiff).toFixed(1)}% - biased 80% LONG`;
        } else {
          // Rule 3: Use technical indicators when win rates similar
          // Oversold (RSI < 30) = LONG, Overbought (RSI > 70) = SHORT
          if (rsi < 30) {
            direction = 'long';
            confidence = Math.min(85, longWinRate + 10);
            reasoning = `RSI ${rsi.toFixed(0)} indicates oversold - LONG`;
          } else if (rsi > 70) {
            direction = 'short';
            confidence = Math.min(85, shortWinRate + 10);
            reasoning = `RSI ${rsi.toFixed(0)} indicates overbought - SHORT`;
          } else if (priceChange1h < -1) {
            direction = 'long';
            confidence = Math.min(80, longWinRate + 5);
            reasoning = `Price down ${Math.abs(priceChange1h).toFixed(1)}% 1h - mean reversion LONG`;
          } else if (priceChange1h > 1) {
            direction = 'short';
            confidence = Math.min(80, shortWinRate + 5);
            reasoning = `Price up ${priceChange1h.toFixed(1)}% 1h - mean reversion SHORT`;
          } else {
            // Default: Slight bias toward SHORT (historically better)
            direction = Math.random() < 0.6 ? 'short' : 'long';
            confidence = direction === 'short' ? shortWinRate : longWinRate;
            reasoning = `No strong signal - defaulting to ${direction} (${confidence.toFixed(1)}% win rate)`;
          }
        }
      }
    }

    // Store prediction for tracking
    console.log(`🎯 Prediction: ${pair} ${direction.toUpperCase()} (${confidence.toFixed(1)}% confidence) - ${reasoning}`);

    return new Response(JSON.stringify({
      direction,
      confidence,
      reasoning,
      excluded: false,
      metadata: {
        shortWinRate,
        longWinRate,
        rsi,
        priceChange1h,
        priceChange24h,
        volatility,
      }
    } as PredictionResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("ML prediction error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Prediction failed",
      direction: 'short', // Default to SHORT on error
      confidence: 60,
      excluded: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
