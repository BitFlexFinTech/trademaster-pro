import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeRequest {
  pair: string;
  direction: "long" | "short";
  entryPrice: number;
  amount: number;
  leverage: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  exchangeName?: string;
  isSandbox: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tradeReq: TradeRequest = await req.json();
    
    console.log(`Executing trade for user ${user.id}:`, tradeReq);

    // Validate trade parameters
    if (!tradeReq.pair || !tradeReq.direction || !tradeReq.entryPrice || !tradeReq.amount) {
      return new Response(
        JSON.stringify({ error: "Missing required trade parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create trade record
    const { data: trade, error: insertError } = await supabase
      .from("trades")
      .insert({
        user_id: user.id,
        pair: tradeReq.pair,
        direction: tradeReq.direction,
        entry_price: tradeReq.entryPrice,
        amount: tradeReq.amount,
        leverage: tradeReq.leverage || 1,
        exchange_name: tradeReq.exchangeName || "Simulated",
        is_sandbox: tradeReq.isSandbox,
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating trade:", insertError);
      throw insertError;
    }

    // Simulate trade execution (45-90 second delay in real implementation)
    // For demo, we'll simulate immediate execution with random outcome
    const simulatedOutcome = simulateTrade(tradeReq);

    // Update trade with simulated results after a short delay
    setTimeout(async () => {
      const { error: updateError } = await supabase
        .from("trades")
        .update({
          exit_price: simulatedOutcome.exitPrice,
          profit_loss: simulatedOutcome.profitLoss,
          profit_percentage: simulatedOutcome.profitPercentage,
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", trade.id);

      if (updateError) {
        console.error("Error updating trade:", updateError);
      } else {
        console.log(`Trade ${trade.id} closed with P&L: $${simulatedOutcome.profitLoss.toFixed(2)}`);
      }

      // Create alert for trade completion
      await supabase.from("alerts").insert({
        user_id: user.id,
        alert_type: "trade_closed",
        title: `Trade ${simulatedOutcome.profitLoss >= 0 ? "Won" : "Lost"}`,
        message: `${tradeReq.pair} ${tradeReq.direction} closed with ${simulatedOutcome.profitPercentage.toFixed(2)}% P&L`,
        data: {
          tradeId: trade.id,
          profitLoss: simulatedOutcome.profitLoss,
          profitPercentage: simulatedOutcome.profitPercentage,
        },
      });
    }, 5000); // 5 second simulation delay

    return new Response(
      JSON.stringify({ 
        success: true,
        trade: trade,
        message: "Trade opened successfully. Simulating execution...",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error executing trade:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function simulateTrade(trade: TradeRequest) {
  // Simulate trade outcome based on probability
  // In production, this would be real market execution
  const random = Math.random();
  const leverage = trade.leverage || 1;
  
  let exitPrice: number;
  let targetHit: string;
  
  if (random < 0.33) {
    // Hit TP1 (33% chance)
    exitPrice = trade.direction === "long" ? trade.takeProfit1 : trade.takeProfit1;
    targetHit = "TP1";
  } else if (random < 0.55) {
    // Hit TP2 (22% chance)
    exitPrice = trade.direction === "long" ? trade.takeProfit2 : trade.takeProfit2;
    targetHit = "TP2";
  } else if (random < 0.70) {
    // Hit TP3 (15% chance)
    exitPrice = trade.direction === "long" ? trade.takeProfit3 : trade.takeProfit3;
    targetHit = "TP3";
  } else {
    // Hit SL (30% chance)
    exitPrice = trade.stopLoss;
    targetHit = "SL";
  }
  
  const priceChange = trade.direction === "long" 
    ? (exitPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - exitPrice) / trade.entryPrice;
  
  const profitPercentage = priceChange * 100 * leverage;
  const profitLoss = trade.amount * priceChange * leverage;
  
  console.log(`Trade simulation: ${targetHit} hit, P&L: ${profitPercentage.toFixed(2)}%`);
  
  return {
    exitPrice,
    profitLoss,
    profitPercentage,
    targetHit,
  };
}