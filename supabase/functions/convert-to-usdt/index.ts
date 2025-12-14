import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  botId: string;
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

    const { botId }: ConvertRequest = await req.json();
    console.log(`Convert to USDT request for bot ${botId}`);

    // Fetch any open trades for this user
    const { data: openTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open");

    if (!openTrades || openTrades.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No open positions to convert",
        closedTrades: 0,
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Close all open trades at current market price
    let totalPnl = 0;
    const closedTrades: string[] = [];

    for (const trade of openTrades) {
      // Fetch current price
      const symbol = trade.pair.replace("/", "");
      let currentPrice = trade.entry_price;
      
      try {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const data = await response.json();
        currentPrice = parseFloat(data.price);
      } catch {
        // Use entry price if fetch fails
      }

      // Calculate P&L
      const priceDiff = trade.direction === "long"
        ? currentPrice - trade.entry_price
        : trade.entry_price - currentPrice;
      const pnl = (priceDiff / trade.entry_price) * trade.amount * (trade.leverage || 1);
      totalPnl += pnl;

      // Close the trade
      await supabase.from("trades").update({
        exit_price: currentPrice,
        profit_loss: pnl,
        profit_percentage: (pnl / trade.amount) * 100,
        status: "closed",
        closed_at: new Date().toISOString(),
      }).eq("id", trade.id);

      closedTrades.push(trade.id);
    }

    // Create alert
    await supabase.from("alerts").insert({
      user_id: user.id,
      alert_type: "positions_closed",
      title: "All Positions Closed",
      message: `Closed ${closedTrades.length} positions. Total P&L: $${totalPnl.toFixed(2)}`,
      data: { botId, closedTrades: closedTrades.length, totalPnl },
    });

    console.log(`Closed ${closedTrades.length} trades with total P&L: $${totalPnl.toFixed(2)}`);

    return new Response(JSON.stringify({
      success: true,
      message: `All positions converted to USDT`,
      closedTrades: closedTrades.length,
      totalPnl,
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Convert to USDT error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
