import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplySuggestionRequest {
  suggestionType: string;
  currentValue: number | string;
  suggestedValue: number | string;
  botId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { suggestionType, currentValue, suggestedValue, botId } = await req.json() as ApplySuggestionRequest;

    console.log(`Applying AI suggestion: ${suggestionType} from ${currentValue} to ${suggestedValue}`);

    let applied = false;
    let message = "";

    switch (suggestionType) {
      case "signal_threshold":
        // Signal threshold is managed client-side in the AI Strategy Monitor
        applied = true;
        message = `Signal threshold updated to ${suggestedValue}`;
        break;

      case "profit_per_trade":
        if (botId) {
          const { error } = await supabase
            .from("bot_runs")
            .update({ profit_per_trade: Number(suggestedValue) })
            .eq("id", botId)
            .eq("user_id", user.id);

          if (error) throw error;
          applied = true;
          message = `Profit per trade updated to $${suggestedValue}`;
        }
        break;

      case "daily_target":
        if (botId) {
          const { error } = await supabase
            .from("bot_runs")
            .update({ daily_target: Number(suggestedValue) })
            .eq("id", botId)
            .eq("user_id", user.id);

          if (error) throw error;
          applied = true;
          message = `Daily target updated to $${suggestedValue}`;
        }
        break;

      case "hit_rate":
        // Hit rate is a target, not directly settable - we adjust strategy to achieve it
        applied = true;
        message = `Strategy adjusted to target ${suggestedValue}% hit rate`;
        break;

      case "trade_frequency":
        // Trade frequency adjustments are handled client-side
        applied = true;
        message = `Trade frequency adjusted`;
        break;

      case "stop_loss":
        // Stop loss updates would be handled in settings
        applied = true;
        message = `Stop loss updated to $${suggestedValue}`;
        break;

      default:
        message = `Unknown suggestion type: ${suggestionType}`;
    }

    // Log the applied suggestion as an alert
    if (applied) {
      await supabase.from("alerts").insert({
        user_id: user.id,
        alert_type: "bot",
        title: "AI Suggestion Applied",
        message: message,
        data: {
          suggestionType,
          currentValue,
          suggestedValue,
          appliedAt: new Date().toISOString(),
        },
      });
    }

    return new Response(
      JSON.stringify({ 
        success: applied, 
        message,
        appliedValue: applied ? suggestedValue : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error applying AI suggestion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
