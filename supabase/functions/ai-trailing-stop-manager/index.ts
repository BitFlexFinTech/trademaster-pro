import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface TrailingStopConfig {
  enableTrailingStop: boolean;
  trailActivationPercent: number; // When to activate trailing (e.g., 75% of TP)
  trailDistancePercent: number;   // Trail distance (e.g., 25% of TP)
  maxConsecutiveLosses: number;   // Before pausing
  cooloffDurationMs: number;      // Pause duration
  dynamicAdjustmentEnabled: boolean;
}

interface TradeAnalysis {
  recentHitRate: number;
  avgHoldTimeMs: number;
  volatilityScore: number;
  consecutiveLosses: number;
  avgProfitPercent: number;
  marketCondition: 'trending' | 'ranging' | 'volatile';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ai-trailing-stop] Analyzing for user ${user.id}`);

    // Fetch recent trades for analysis
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'closed')
      .eq('is_sandbox', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (tradesError) throw tradesError;

    // Calculate trade analysis metrics
    const analysis: TradeAnalysis = calculateTradeAnalysis(trades || []);
    
    console.log(`[ai-trailing-stop] Trade analysis:`, analysis);

    // Default config
    let config: TrailingStopConfig = {
      enableTrailingStop: true,
      trailActivationPercent: 75,
      trailDistancePercent: 25,
      maxConsecutiveLosses: 3,
      cooloffDurationMs: 5 * 60 * 1000,
      dynamicAdjustmentEnabled: true,
    };

    // If we have Lovable AI, use it for intelligent recommendations
    if (LOVABLE_API_KEY) {
      try {
        const aiConfig = await getAIRecommendation(analysis, trades || []);
        if (aiConfig) {
          config = { ...config, ...aiConfig };
        }
      } catch (aiErr) {
        console.warn('[ai-trailing-stop] AI recommendation failed, using rule-based:', aiErr);
        config = getRuleBasedConfig(analysis);
      }
    } else {
      // Use rule-based configuration
      config = getRuleBasedConfig(analysis);
    }

    console.log(`[ai-trailing-stop] Final config:`, config);

    return new Response(JSON.stringify({
      success: true,
      config,
      analysis,
      message: 'Trailing stop configuration optimized by AI',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[ai-trailing-stop] Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calculateTradeAnalysis(trades: any[]): TradeAnalysis {
  if (trades.length === 0) {
    return {
      recentHitRate: 70,
      avgHoldTimeMs: 30000,
      volatilityScore: 0.5,
      consecutiveLosses: 0,
      avgProfitPercent: 0.3,
      marketCondition: 'ranging',
    };
  }

  // Calculate hit rate
  const wins = trades.filter(t => (t.profit_loss || 0) > 0).length;
  const recentHitRate = (wins / trades.length) * 100;

  // Calculate average hold time
  const holdTimes = trades
    .filter(t => t.created_at && t.closed_at)
    .map(t => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
  const avgHoldTimeMs = holdTimes.length > 0 
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
    : 30000;

  // Calculate consecutive losses (from most recent)
  let consecutiveLosses = 0;
  for (const trade of trades) {
    if ((trade.profit_loss || 0) <= 0) {
      consecutiveLosses++;
    } else {
      break;
    }
  }

  // Calculate average profit percent
  const profitPercents = trades.map(t => t.profit_percentage || 0);
  const avgProfitPercent = profitPercents.length > 0
    ? profitPercents.reduce((a, b) => a + b, 0) / profitPercents.length
    : 0.3;

  // Calculate volatility score based on profit variance
  const variance = calculateVariance(profitPercents);
  const volatilityScore = Math.min(variance / 2, 1); // Normalize to 0-1

  // Determine market condition
  let marketCondition: 'trending' | 'ranging' | 'volatile' = 'ranging';
  if (volatilityScore > 0.7) {
    marketCondition = 'volatile';
  } else if (recentHitRate > 65) {
    marketCondition = 'trending';
  }

  return {
    recentHitRate,
    avgHoldTimeMs,
    volatilityScore,
    consecutiveLosses,
    avgProfitPercent,
    marketCondition,
  };
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function getRuleBasedConfig(analysis: TradeAnalysis): TrailingStopConfig {
  let config: TrailingStopConfig = {
    enableTrailingStop: true,
    trailActivationPercent: 75,
    trailDistancePercent: 25,
    maxConsecutiveLosses: 3,
    cooloffDurationMs: 5 * 60 * 1000,
    dynamicAdjustmentEnabled: true,
  };

  // Adjust based on hit rate
  if (analysis.recentHitRate >= 70) {
    // High hit rate - can afford tighter trailing
    config.trailActivationPercent = 60;
    config.trailDistancePercent = 20;
    config.maxConsecutiveLosses = 4;
  } else if (analysis.recentHitRate < 50) {
    // Low hit rate - need wider trailing to let winners run
    config.trailActivationPercent = 85;
    config.trailDistancePercent = 35;
    config.maxConsecutiveLosses = 2;
    config.cooloffDurationMs = 10 * 60 * 1000;
  }

  // Adjust for volatility
  if (analysis.marketCondition === 'volatile') {
    config.trailDistancePercent = Math.min(config.trailDistancePercent + 10, 50);
    config.cooloffDurationMs = config.cooloffDurationMs * 1.5;
  }

  // Adjust for consecutive losses
  if (analysis.consecutiveLosses >= 2) {
    config.trailActivationPercent = Math.min(config.trailActivationPercent + 10, 90);
    config.cooloffDurationMs = config.cooloffDurationMs * 2;
  }

  return config;
}

async function getAIRecommendation(analysis: TradeAnalysis, trades: any[]): Promise<Partial<TrailingStopConfig> | null> {
  if (!LOVABLE_API_KEY) return null;

  const prompt = `Analyze this trading data and recommend optimal trailing stop settings:

Trading Metrics:
- Recent hit rate: ${analysis.recentHitRate.toFixed(1)}%
- Average hold time: ${(analysis.avgHoldTimeMs / 1000).toFixed(1)}s
- Volatility score: ${(analysis.volatilityScore * 100).toFixed(0)}%
- Consecutive losses: ${analysis.consecutiveLosses}
- Average profit: ${analysis.avgProfitPercent.toFixed(2)}%
- Market condition: ${analysis.marketCondition}
- Total recent trades: ${trades.length}

Based on this data, provide optimal settings as JSON:
{
  "trailActivationPercent": <when to start trailing, 50-90>,
  "trailDistancePercent": <trail distance, 15-50>,
  "maxConsecutiveLosses": <halt threshold, 2-5>,
  "cooloffDurationMs": <pause duration in ms, 60000-600000>
}

Only respond with the JSON object, no explanation.`;

  try {
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a trading strategy optimizer. Respond only with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.warn('[ai-trailing-stop] Lovable API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      // Parse the JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const config = JSON.parse(jsonMatch[0]);
        console.log('[ai-trailing-stop] AI recommendation:', config);
        return config;
      }
    }
  } catch (err) {
    console.warn('[ai-trailing-stop] AI parsing error:', err);
  }

  return null;
}
