import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisRequest {
  botId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { botId }: AnalysisRequest = await req.json();
    console.log(`Analyzing bot performance for bot ${botId}`);

    // Fetch bot run data
    const { data: bot, error: botError } = await supabase
      .from("bot_runs")
      .select("*")
      .eq("id", botId)
      .eq("user_id", user.id)
      .single();

    if (botError || !bot) {
      return new Response(JSON.stringify({ error: "Bot not found" }), { 
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Fetch related trades
    const { data: trades } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", user.id)
      .gte("created_at", bot.started_at || bot.created_at)
      .lte("created_at", bot.stopped_at || new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(200);

    // Calculate statistics
    const totalTrades = trades?.length || 0;
    const winningTrades = trades?.filter(t => (t.profit_loss || 0) > 0).length || 0;
    const losingTrades = totalTrades - winningTrades;
    const totalPnl = trades?.reduce((sum, t) => sum + (t.profit_loss || 0), 0) || 0;
    const avgWin = winningTrades > 0 
      ? trades?.filter(t => (t.profit_loss || 0) > 0).reduce((sum, t) => sum + (t.profit_loss || 0), 0)! / winningTrades 
      : 0;
    const avgLoss = losingTrades > 0 
      ? Math.abs(trades?.filter(t => (t.profit_loss || 0) < 0).reduce((sum, t) => sum + (t.profit_loss || 0), 0)!) / losingTrades 
      : 0;
    const hitRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    // Analyze trade patterns
    const tradesByExchange: Record<string, { wins: number; losses: number; pnl: number }> = {};
    const tradesByPair: Record<string, { wins: number; losses: number; pnl: number }> = {};
    
    trades?.forEach(t => {
      const exchange = t.exchange_name || 'Unknown';
      const pair = t.pair || 'Unknown';
      const isWin = (t.profit_loss || 0) > 0;
      
      if (!tradesByExchange[exchange]) {
        tradesByExchange[exchange] = { wins: 0, losses: 0, pnl: 0 };
      }
      tradesByExchange[exchange].pnl += t.profit_loss || 0;
      if (isWin) tradesByExchange[exchange].wins++;
      else tradesByExchange[exchange].losses++;
      
      if (!tradesByPair[pair]) {
        tradesByPair[pair] = { wins: 0, losses: 0, pnl: 0 };
      }
      tradesByPair[pair].pnl += t.profit_loss || 0;
      if (isWin) tradesByPair[pair].wins++;
      else tradesByPair[pair].losses++;
    });

    // Find best performing pairs
    const pairPerformance = Object.entries(tradesByPair)
      .map(([pair, stats]) => ({
        pair,
        winRate: stats.wins / (stats.wins + stats.losses) * 100,
        pnl: stats.pnl,
        trades: stats.wins + stats.losses,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    const topPairs = pairPerformance.slice(0, 3).map(p => p.pair.split('/')[0]);

    // Calculate optimal profit per trade based on performance
    const optimalProfitPerTrade = hitRate >= 65 
      ? Math.round((bot.profit_per_trade * 1.15) * 100) / 100
      : hitRate >= 55
      ? bot.profit_per_trade
      : Math.round((bot.profit_per_trade * 0.85) * 100) / 100;

    // Calculate recommended amount based on performance
    const recommendedAmount = totalPnl > 0 && hitRate >= 60 ? 200 : 100;

    // Generate AI analysis
    let aiAnalysis = null;
    if (lovableApiKey) {
      try {
        const prompt = `Analyze this trading bot's performance and provide deep insights:

Bot: ${bot.bot_name}
Mode: ${bot.mode}
Daily Target: $${bot.daily_target}
Profit Per Trade Target: $${bot.profit_per_trade}

Performance Metrics:
- Total Trades: ${totalTrades}
- Winning Trades: ${winningTrades} (${hitRate.toFixed(1)}%)
- Losing Trades: ${losingTrades}
- Total P&L: $${totalPnl.toFixed(2)}
- Average Win: $${avgWin.toFixed(2)}
- Average Loss: $${avgLoss.toFixed(2)}
- Risk/Reward Ratio: ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'}

Top Performing Pairs: ${topPairs.join(', ')}

Exchange Performance:
${Object.entries(tradesByExchange).map(([ex, stats]) => 
  `- ${ex}: ${stats.wins}W/${stats.losses}L, P&L: $${stats.pnl.toFixed(2)}`
).join('\n')}

Provide a deep analysis with:
1. Performance summary (3 sentences max)
2. 5 key insights about trading patterns
3. Optimal profit per trade recommendation with reasoning
4. Optimal amount per trade recommendation
5. 4 specific improvements to lock in profits faster`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are an expert quantitative trading analyst. Provide concise, actionable analysis focused on improving bot profitability." },
              { role: "user", content: prompt }
            ],
            tools: [{
              type: "function",
              function: {
                name: "provide_analysis",
                description: "Provide structured bot performance analysis with actionable recommendations",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { 
                      type: "string",
                      description: "3-sentence performance summary"
                    },
                    insights: { 
                      type: "array", 
                      items: { type: "string" },
                      description: "5 key insights about trading patterns"
                    },
                    recommendedProfitPerTrade: { 
                      type: "number",
                      description: "Optimal profit target per trade in USD"
                    },
                    recommendedAmountPerTrade: { 
                      type: "number",
                      description: "Optimal position size per trade in USD"
                    },
                    improvements: { 
                      type: "array", 
                      items: { type: "string" },
                      description: "4 specific improvements to lock in profits faster"
                    }
                  },
                  required: ["summary", "insights", "recommendedProfitPerTrade", "recommendedAmountPerTrade", "improvements"]
                }
              }
            }],
            tool_choice: { type: "function", function: { name: "provide_analysis" } }
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            aiAnalysis = JSON.parse(toolCall.function.arguments);
          }
        } else {
          console.error("AI response not ok:", response.status);
        }
      } catch (aiError) {
        console.error("AI analysis error:", aiError);
      }
    }

    // Fallback analysis if AI fails
    if (!aiAnalysis) {
      aiAnalysis = {
        summary: `Bot completed ${totalTrades} trades with a ${hitRate.toFixed(1)}% win rate, generating $${totalPnl.toFixed(2)} P&L. ${hitRate >= 60 ? 'Performance is strong' : 'There is room for improvement'} with an average win of $${avgWin.toFixed(2)} vs average loss of $${avgLoss.toFixed(2)}.`,
        insights: [
          `Win rate of ${hitRate.toFixed(1)}% ${hitRate >= 60 ? 'exceeds' : 'is below'} the 60% target threshold`,
          `Average win ($${avgWin.toFixed(2)}) to loss ($${avgLoss.toFixed(2)}) ratio is ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'}`,
          `Top performing pairs: ${topPairs.length > 0 ? topPairs.join(', ') : 'Insufficient data'}`,
          `${Object.keys(tradesByExchange).length} exchanges used with varying performance`,
          `Daily target of $${bot.daily_target} ${totalPnl >= bot.daily_target ? 'was achieved' : 'was not reached'}`
        ],
        recommendedProfitPerTrade: optimalProfitPerTrade,
        recommendedAmountPerTrade: recommendedAmount,
        improvements: [
          hitRate < 65 ? "Consider tighter stop losses (-$0.45) to reduce average loss size" : "Current stop loss is optimal",
          topPairs.length > 0 ? `Focus on high-performing pairs: ${topPairs.join(', ')}` : "Analyze pair performance patterns",
          "Trade during high-volume hours (8AM-4PM UTC) for better execution",
          totalPnl > 0 ? "Consider increasing position size by 20% given positive performance" : "Maintain conservative position sizing until win rate improves"
        ]
      };
    }

    // Store analysis in bot run
    await supabase.from("bot_runs").update({
      analysis_report: aiAnalysis
    }).eq("id", botId);

    console.log(`Analysis complete for bot ${botId}`);

    return new Response(JSON.stringify({
      success: true,
      analysis: aiAnalysis,
      stats: {
        totalTrades,
        winningTrades,
        losingTrades,
        totalPnl,
        avgWin,
        avgLoss,
        hitRate,
      }
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Analysis error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
