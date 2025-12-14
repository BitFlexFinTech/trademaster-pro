import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { testResult, currentThresholds } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `Analyze this trading bot paper test result and provide specific threshold adjustments to achieve 80% hit rate.

TEST RESULTS:
- Hit Rate: ${testResult.hitRate.toFixed(1)}%
- Total Trades: ${testResult.totalTrades}
- Wins: ${testResult.wins}, Losses: ${testResult.losses}
- Trades Skipped: ${testResult.tradesSkipped}
- Total P&L: $${testResult.totalPnL.toFixed(2)}
- Avg Signal Score: ${testResult.avgSignalScore.toFixed(1)}%
- Avg Confluence: ${testResult.avgConfluence.toFixed(2)}

CURRENT THRESHOLDS:
- Min Signal Score: ${currentThresholds.minSignalScore}
- Min Confluence: ${currentThresholds.minConfluence}
- Min Volume Ratio: ${currentThresholds.minVolumeRatio}
- Target Hit Rate: ${currentThresholds.targetHitRate}%

FAILED TRADES BREAKDOWN:
${JSON.stringify(testResult.failedTradesBreakdown, null, 2)}

Provide analysis as JSON with this exact structure:
{
  "summary": "Brief 2-sentence summary of why the target wasn't met",
  "rootCauses": ["cause1", "cause2", "cause3"],
  "recommendations": [
    {
      "field": "minSignalScore",
      "currentValue": 0.85,
      "suggestedValue": 0.88,
      "reason": "Brief reason for this change",
      "expectedImpact": "+3-5% hit rate"
    }
  ],
  "expectedHitRate": 82.5,
  "tradeReduction": 15
}

Focus on concrete, actionable threshold adjustments. Be specific with numbers.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a quantitative trading analyst. Provide analysis in valid JSON format only.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    let analysis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Return fallback analysis
      analysis = {
        summary: `Current hit rate of ${testResult.hitRate.toFixed(1)}% is below the 80% target. Signal quality filtering needs tightening.`,
        rootCauses: [
          'Signal score threshold too permissive',
          'Insufficient indicator confluence requirement',
          'Volume confirmation threshold too low'
        ],
        recommendations: [
          {
            field: 'minSignalScore',
            currentValue: currentThresholds.minSignalScore,
            suggestedValue: Math.min(currentThresholds.minSignalScore + 0.03, 0.92),
            reason: 'Increase minimum signal quality to filter weak setups',
            expectedImpact: '+5-8% hit rate'
          },
          {
            field: 'minConfluence',
            currentValue: currentThresholds.minConfluence,
            suggestedValue: Math.min(currentThresholds.minConfluence + 1, 4),
            reason: 'Require more aligned indicators before entry',
            expectedImpact: '+3-5% hit rate'
          },
          {
            field: 'minVolumeRatio',
            currentValue: currentThresholds.minVolumeRatio,
            suggestedValue: Math.min(currentThresholds.minVolumeRatio + 0.1, 1.5),
            reason: 'Stronger volume confirmation reduces false signals',
            expectedImpact: '+2-3% hit rate'
          }
        ],
        expectedHitRate: Math.min(testResult.hitRate + 12, 85),
        tradeReduction: 20
      };
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('analyze-paper-test error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
