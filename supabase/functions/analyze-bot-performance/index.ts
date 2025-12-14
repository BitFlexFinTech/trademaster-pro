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
      .limit(100);

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

    // Generate AI analysis
    let aiAnalysis = null;
    if (lovableApiKey) {
      try {
        const prompt = `Analyze this trading bot's performance and provide recommendations:

Bot: ${bot.bot_name}
Mode: ${bot.mode}
Daily Target: $${bot.daily_target}
Profit Per Trade Target: $${bot.profit_per_trade}

Performance Metrics:
- Total Trades: ${totalTrades}
- Winning Trades: ${winningTrades} (${totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0}%)
- Losing Trades: ${losingTrades}
- Total P&L: $${totalPnl.toFixed(2)}
- Average Win: $${avgWin.toFixed(2)}
- Average Loss: $${avgLoss.toFixed(2)}
- Hit Rate: ${bot.hit_rate?.toFixed(1) || 0}%
- Max Drawdown: $${bot.max_drawdown || 0}

Provide:
1. Performance summary (2-3 sentences)
2. Key insights (3 bullet points)
3. Recommended profit per trade adjustment
4. Recommended amount per trade adjustment
5. Strategy improvements (3 actionable items)

Format as JSON with keys: summary, insights, recommendedProfitPerTrade, recommendedAmountPerTrade, improvements`;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a professional trading analyst. Provide concise, actionable analysis." },
              { role: "user", content: prompt }
            ],
            tools: [{
              type: "function",
              function: {
                name: "provide_analysis",
                description: "Provide structured bot performance analysis",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    insights: { type: "array", items: { type: "string" } },
                    recommendedProfitPerTrade: { type: "number" },
                    recommendedAmountPerTrade: { type: "number" },
                    improvements: { type: "array", items: { type: "string" } }
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
        }
      } catch (aiError) {
        console.error("AI analysis error:", aiError);
      }
    }

    // Fallback analysis if AI fails
    if (!aiAnalysis) {
      const hitRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      aiAnalysis = {
        summary: `Bot completed ${totalTrades} trades with a ${hitRate.toFixed(1)}% hit rate. Total P&L: $${totalPnl.toFixed(2)}.`,
        insights: [
          `Average winning trade: $${avgWin.toFixed(2)}`,
          `Average losing trade: $${avgLoss.toFixed(2)}`,
          `Risk/Reward ratio: ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A'}`
        ],
        recommendedProfitPerTrade: hitRate >= 60 ? bot.profit_per_trade * 1.1 : bot.profit_per_trade * 0.9,
        recommendedAmountPerTrade: totalPnl > 0 ? 250 : 150,
        improvements: [
          "Consider tighter stop losses to reduce average loss",
          "Focus on high-volume pairs during peak hours",
          "Review losing trades for common patterns"
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
        hitRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
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
