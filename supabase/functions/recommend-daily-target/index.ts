import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExchangeFloat {
  exchange: string;
  amount: number;
  baseBalance: number;
  availableFloat: number;
}

interface RecommendationRequest {
  usdtFloat: ExchangeFloat[];
  historicalHitRate: number;
  averageProfitPerTrade: number;
  tradingHoursPerDay: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RecommendationRequest = await req.json();
    const { usdtFloat, historicalHitRate, averageProfitPerTrade, tradingHoursPerDay, riskTolerance } = body;

    // Calculate total available capital
    const totalAvailable = usdtFloat.reduce((sum, f) => sum + f.availableFloat, 0);
    const totalCapital = usdtFloat.reduce((sum, f) => sum + f.amount, 0);

    // Risk multipliers based on tolerance
    const riskMultipliers = {
      conservative: { targetMultiplier: 0.5, maxDrawdownPercent: 1.5 },
      moderate: { targetMultiplier: 1.0, maxDrawdownPercent: 2.5 },
      aggressive: { targetMultiplier: 1.5, maxDrawdownPercent: 4.0 },
    };

    const risk = riskMultipliers[riskTolerance] || riskMultipliers.moderate;

    // Calculate recommended daily target
    // Formula: (Available Capital * Expected Win Rate * Avg Profit) / Risk Buffer
    const effectiveHitRate = Math.min(historicalHitRate, 95) / 100;
    const avgProfit = averageProfitPerTrade || 0.50;
    
    // Trades per day estimate: based on trading hours and average trade duration
    const avgTradeTime = 5; // minutes
    const tradesPerHour = 60 / avgTradeTime;
    const estimatedTradesPerDay = Math.floor(tradesPerHour * (tradingHoursPerDay || 8));
    
    // Expected profit calculation
    const winRate = effectiveHitRate;
    const lossRate = 1 - winRate;
    const avgLoss = avgProfit * 0.2; // 20% of profit (per spec)
    const expectedProfitPerTrade = (winRate * avgProfit) - (lossRate * avgLoss);
    
    // Base daily target
    let baseDailyTarget = estimatedTradesPerDay * expectedProfitPerTrade * risk.targetMultiplier;
    
    // Cap based on available capital (max 1% of capital as daily target)
    const capitalBasedCap = totalAvailable * 0.01 * risk.targetMultiplier;
    baseDailyTarget = Math.min(baseDailyTarget, capitalBasedCap);
    
    // Round to nearest $5
    const recommendedDailyTarget = Math.round(baseDailyTarget / 5) * 5;
    
    // Calculate confidence
    let confidence = 70;
    if (historicalHitRate >= 80) confidence += 15;
    if (totalAvailable >= 5000) confidence += 10;
    if (tradingHoursPerDay >= 6) confidence += 5;
    confidence = Math.min(confidence, 95);

    // Calculate per-exchange targets
    const perExchangeTargets = usdtFloat.map(f => {
      const proportion = f.availableFloat / Math.max(totalAvailable, 1);
      return {
        exchange: f.exchange,
        dailyTarget: Math.round(recommendedDailyTarget * proportion * 100) / 100,
        recommendedProfitPerTrade: avgProfit,
        maxTrades: Math.floor(estimatedTradesPerDay * proportion),
      };
    });

    // Generate AI reasoning using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiReasoning = '';
    
    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: 'You are a quantitative trading AI advisor. Provide concise, actionable reasoning for daily target recommendations.'
              },
              {
                role: 'user',
                content: `Given:
- Total USDT available: $${totalAvailable.toFixed(2)}
- Historical hit rate: ${historicalHitRate.toFixed(1)}%
- Average profit per trade: $${avgProfit.toFixed(2)}
- Risk tolerance: ${riskTolerance}
- Recommended daily target: $${recommendedDailyTarget}

Provide a 2-3 sentence explanation for why this daily target is appropriate.`
              }
            ],
            max_tokens: 150,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiReasoning = aiData.choices?.[0]?.message?.content || '';
        }
      } catch (aiErr) {
        console.error('AI reasoning error:', aiErr);
      }
    }

    // Fallback reasoning if AI fails
    if (!aiReasoning) {
      aiReasoning = `Based on $${totalAvailable.toFixed(0)} available capital and ${historicalHitRate.toFixed(0)}% historical hit rate, a daily target of $${recommendedDailyTarget} represents a ${riskTolerance} approach with ${confidence}% confidence.`;
    }

    const response = {
      success: true,
      recommendation: {
        dailyTarget: Math.max(recommendedDailyTarget, 10), // Minimum $10
        profitPerTrade: avgProfit,
        estimatedTrades: estimatedTradesPerDay,
        confidence,
        riskTolerance,
        reasoning: aiReasoning,
        perExchangeTargets,
        metrics: {
          totalCapital,
          totalAvailable,
          effectiveHitRate: effectiveHitRate * 100,
          expectedProfitPerTrade,
          maxDrawdown: totalAvailable * (risk.maxDrawdownPercent / 100),
        },
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('recommend-daily-target error:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
