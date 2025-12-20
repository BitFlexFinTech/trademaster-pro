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
  connectedExchanges?: string[];
}

// Exchange-specific rate limits for trade speed calculation
const EXCHANGE_RATE_LIMITS: Record<string, { requestsPerMinute: number; ordersPerSecond: number; safetyFactor: number }> = {
  Binance: { requestsPerMinute: 1200, ordersPerSecond: 10, safetyFactor: 0.5 },
  OKX: { requestsPerMinute: 300, ordersPerSecond: 2, safetyFactor: 0.4 },
  Bybit: { requestsPerMinute: 600, ordersPerSecond: 5, safetyFactor: 0.5 },
  Kraken: { requestsPerMinute: 60, ordersPerSecond: 1, safetyFactor: 0.3 },
  KuCoin: { requestsPerMinute: 180, ordersPerSecond: 2, safetyFactor: 0.4 },
  Nexo: { requestsPerMinute: 60, ordersPerSecond: 1, safetyFactor: 0.3 },
  Hyperliquid: { requestsPerMinute: 1000, ordersPerSecond: 8, safetyFactor: 0.5 },
};

// Calculate safe trade interval based on connected exchanges' rate limits
function calculateSafeTradeInterval(exchanges: string[]): { intervalMs: number; reasoning: string; limitingExchange: string } {
  if (exchanges.length === 0) {
    return { 
      intervalMs: 60000, // 1 minute default
      reasoning: 'No exchanges connected - using conservative default of 60 seconds',
      limitingExchange: 'None'
    };
  }

  let minOrdersPerSecond = Infinity;
  let limitingExchange = '';

  for (const exchange of exchanges) {
    const limits = EXCHANGE_RATE_LIMITS[exchange];
    if (limits) {
      const safeOrdersPerSecond = limits.ordersPerSecond * limits.safetyFactor;
      if (safeOrdersPerSecond < minOrdersPerSecond) {
        minOrdersPerSecond = safeOrdersPerSecond;
        limitingExchange = exchange;
      }
    }
  }

  // If no matching exchange found, use conservative default
  if (minOrdersPerSecond === Infinity) {
    return {
      intervalMs: 60000,
      reasoning: 'Unknown exchanges - using conservative default of 60 seconds',
      limitingExchange: 'Unknown'
    };
  }

  // Calculate interval in milliseconds
  // We want to stay well under the rate limit
  const intervalMs = Math.max(3000, Math.ceil(1000 / minOrdersPerSecond));
  
  const reasoning = `Based on ${limitingExchange}'s rate limits (${EXCHANGE_RATE_LIMITS[limitingExchange].ordersPerSecond} orders/sec), using ${(EXCHANGE_RATE_LIMITS[limitingExchange].safetyFactor * 100).toFixed(0)}% capacity = ${intervalMs}ms between trades`;

  return { intervalMs, reasoning, limitingExchange };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RecommendationRequest = await req.json();
    const { usdtFloat, historicalHitRate, averageProfitPerTrade, tradingHoursPerDay, riskTolerance, connectedExchanges } = body;

    // Calculate total available capital
    const totalAvailable = usdtFloat.reduce((sum, f) => sum + f.availableFloat, 0);
    const totalCapital = usdtFloat.reduce((sum, f) => sum + f.amount, 0);

    // Determine connected exchanges from usdtFloat if not provided
    const exchanges = connectedExchanges || usdtFloat.map(f => f.exchange);

    // Calculate rate limit-aware trade speed
    const tradeSpeedCalc = calculateSafeTradeInterval(exchanges);

    // Risk multipliers based on tolerance
    const riskMultipliers = {
      conservative: { targetMultiplier: 0.5, maxDrawdownPercent: 1.5 },
      moderate: { targetMultiplier: 1.0, maxDrawdownPercent: 2.5 },
      aggressive: { targetMultiplier: 1.5, maxDrawdownPercent: 4.0 },
    };

    const risk = riskMultipliers[riskTolerance] || riskMultipliers.moderate;

    // Calculate recommended daily target
    const effectiveHitRate = Math.min(historicalHitRate, 95) / 100;
    const avgProfit = averageProfitPerTrade || 0.50;
    
    // Trades per day estimate based on rate-limited interval
    const tradesPerHour = 3600000 / tradeSpeedCalc.intervalMs;
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
      const exchangeLimits = EXCHANGE_RATE_LIMITS[f.exchange];
      return {
        exchange: f.exchange,
        dailyTarget: Math.round(recommendedDailyTarget * proportion * 100) / 100,
        recommendedProfitPerTrade: avgProfit,
        maxTrades: Math.floor(estimatedTradesPerDay * proportion),
        rateLimitInfo: exchangeLimits ? {
          maxOrdersPerSecond: exchangeLimits.ordersPerSecond,
          safeOrdersPerSecond: exchangeLimits.ordersPerSecond * exchangeLimits.safetyFactor,
          recommendedIntervalMs: Math.ceil(1000 / (exchangeLimits.ordersPerSecond * exchangeLimits.safetyFactor)),
        } : null,
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
                content: 'You are a quantitative trading AI advisor. Provide concise, actionable reasoning for daily target recommendations. Include trade speed rationale.'
              },
              {
                role: 'user',
                content: `Given:
- Total USDT available: $${totalAvailable.toFixed(2)}
- Historical hit rate: ${historicalHitRate.toFixed(1)}%
- Average profit per trade: $${avgProfit.toFixed(2)}
- Risk tolerance: ${riskTolerance}
- Recommended daily target: $${recommendedDailyTarget}
- Trade interval: ${tradeSpeedCalc.intervalMs}ms (${tradeSpeedCalc.reasoning})
- Limiting exchange: ${tradeSpeedCalc.limitingExchange}

Provide a 2-3 sentence explanation for why this daily target and trade speed are appropriate.`
              }
            ],
            max_tokens: 200,
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
      aiReasoning = `Based on $${totalAvailable.toFixed(0)} available capital and ${historicalHitRate.toFixed(0)}% historical hit rate, a daily target of $${recommendedDailyTarget} is recommended. Trade speed is set to ${tradeSpeedCalc.intervalMs}ms intervals to stay within ${tradeSpeedCalc.limitingExchange}'s rate limits with safety margin.`;
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
        tradeSpeed: {
          recommendedIntervalMs: tradeSpeedCalc.intervalMs,
          limitingExchange: tradeSpeedCalc.limitingExchange,
          speedReasoning: tradeSpeedCalc.reasoning,
        },
        metrics: {
          totalCapital,
          totalAvailable,
          effectiveHitRate: effectiveHitRate * 100,
          expectedProfitPerTrade,
          maxDrawdown: totalAvailable * (risk.maxDrawdownPercent / 100),
          tradesPerHour,
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
