import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface IssueData {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  count?: number;
}

interface TradeMetrics {
  hitRate: number;
  zeroProfitCount: number;
  failedProfitTakes: number;
  stuckTrades: number;
  totalTrades: number;
}

interface AnalysisRequest {
  issues: IssueData[];
  errorPatterns?: Array<{ error_message: string; count: number }>;
  tradeMetrics?: TradeMetrics;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { issues, errorPatterns, tradeMetrics }: AnalysisRequest = await req.json();

    console.log('[ai-code-analyzer] Analyzing', issues?.length || 0, 'issues');

    // Build analysis prompt
    const issuesList = issues?.map(i => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}${i.count ? ` (${i.count} occurrences)` : ''}`).join('\n') || 'No issues detected';
    
    const errorsList = errorPatterns?.map(e => `- ${e.error_message} (${e.count} times)`).join('\n') || 'No error patterns';
    
    const metricsText = tradeMetrics 
      ? `Hit Rate: ${tradeMetrics.hitRate.toFixed(1)}%
Zero-Profit Trades: ${tradeMetrics.zeroProfitCount}
Failed Profit Takes: ${tradeMetrics.failedProfitTakes}
Stuck Trades: ${tradeMetrics.stuckTrades}
Total Trades: ${tradeMetrics.totalTrades}`
      : 'No trade metrics available';

    const prompt = `You are an expert trading bot debugger. Analyze these detected issues and provide actionable recommendations.

## Detected Issues:
${issuesList}

## Error Patterns (last 24h):
${errorsList}

## Trade Metrics:
${metricsText}

## Your Analysis Should Include:

1. **Root Cause Analysis** - For the top 3 most critical issues, explain WHY they're happening
2. **Recommended Actions** - Specific database fixes, configuration changes, or monitoring improvements
3. **Priority Ranking** - Mark each recommendation as: CRITICAL, HIGH, or MEDIUM
4. **Confidence Score** - Rate your confidence in each recommendation (0-100)

Format your response as JSON with this structure:
{
  "recommendations": [
    {
      "id": "rec_1",
      "title": "Brief title",
      "priority": "CRITICAL|HIGH|MEDIUM",
      "confidence": 85,
      "rootCause": "Explanation of why this is happening",
      "action": "Specific action to take",
      "estimatedImpact": "What will improve after fixing"
    }
  ],
  "summary": "One paragraph overall assessment",
  "healthScore": 75
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'You are an expert trading bot debugger and code analyzer. Always respond with valid JSON. Be specific and actionable in your recommendations.' 
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ai-code-analyzer] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          recommendations: [],
          summary: 'Analysis temporarily unavailable due to rate limiting.',
          healthScore: 0
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON from response (handle markdown code blocks)
    let analysisResult;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;
      analysisResult = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('[ai-code-analyzer] Failed to parse AI response:', parseError);
      // Return a fallback response
      analysisResult = {
        recommendations: [{
          id: 'rec_fallback',
          title: 'Manual Review Recommended',
          priority: 'MEDIUM',
          confidence: 50,
          rootCause: 'Unable to automatically analyze the issues.',
          action: 'Review the detected issues manually and check database logs.',
          estimatedImpact: 'Issues will be identified through manual inspection.'
        }],
        summary: content.substring(0, 500),
        healthScore: 50
      };
    }

    console.log('[ai-code-analyzer] Analysis complete:', analysisResult.recommendations?.length || 0, 'recommendations');

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[ai-code-analyzer] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      recommendations: [],
      summary: 'Analysis failed. Please try again.',
      healthScore: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
