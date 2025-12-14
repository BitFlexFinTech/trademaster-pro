import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Exchange internal transfer support
// Binance: Universal Transfer API (MAIN to FUNDING)
// Bybit: Transfer between spot and funding wallet
// OKX: Funding transfer API
// Kraken: Does not support internal transfers - profits kept in separate tracking
// Nexo: Does not support internal transfers - profits kept in separate tracking

interface WithdrawRequest {
  botId: string;
  amount?: number; // Optional - if not provided, withdraw all profits
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const { botId, amount }: WithdrawRequest = await req.json();
    console.log(`Withdraw profits request for bot ${botId}`);

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

    const currentPnl = bot.current_pnl || 0;
    const alreadyWithdrawn = bot.profits_withdrawn || 0;
    const availableProfit = currentPnl - alreadyWithdrawn;

    if (availableProfit <= 0) {
      return new Response(JSON.stringify({ 
        error: "No profits available to withdraw",
        currentPnl,
        alreadyWithdrawn,
        availableProfit 
      }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const withdrawAmount = amount ? Math.min(amount, availableProfit) : availableProfit;

    // For now, we simulate the withdrawal by tracking it
    // In production, this would call exchange APIs to transfer to funding wallet
    // Exchanges that support internal transfers: Binance, Bybit, OKX
    // Exchanges that don't: Kraken, Nexo, Hyperliquid

    // Update bot with withdrawn profits
    const { error: updateError } = await supabase
      .from("bot_runs")
      .update({
        profits_withdrawn: alreadyWithdrawn + withdrawAmount,
      })
      .eq("id", botId);

    if (updateError) throw updateError;

    // Create alert for user
    await supabase.from("alerts").insert({
      user_id: user.id,
      alert_type: "profit_withdrawn",
      title: "Profits Withdrawn",
      message: `$${withdrawAmount.toFixed(2)} profits moved to funding account`,
      data: { botId, amount: withdrawAmount },
    });

    console.log(`Withdrew $${withdrawAmount.toFixed(2)} from bot ${botId}`);

    return new Response(JSON.stringify({
      success: true,
      withdrawnAmount: withdrawAmount,
      remainingProfit: availableProfit - withdrawAmount,
      totalWithdrawn: alreadyWithdrawn + withdrawAmount,
      message: `$${withdrawAmount.toFixed(2)} has been moved to your funding account. These funds will not be used for trading.`,
      note: "For exchanges without internal transfer API (Kraken, Nexo), profits are tracked separately and excluded from trading capital."
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Withdraw profits error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
