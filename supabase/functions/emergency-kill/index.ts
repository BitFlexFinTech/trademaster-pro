import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KillRequest {
  reason: 'manual' | 'auto_threshold' | 'daily_stop' | 'critical_loss';
  currentPnL: number;
  threshold: number;
  configSnapshot?: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: KillRequest = await req.json();
    const { reason, currentPnL, threshold, configSnapshot } = body;

    console.log(`🔴 EMERGENCY KILL initiated by ${user.id}`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Current P&L: $${currentPnL}`);
    console.log(`   Threshold: $${threshold}`);

    // Step 1: Stop ALL running bots for this user
    const { data: runningBots, error: botsError } = await supabase
      .from('bot_runs')
      .select('id, bot_name')
      .eq('user_id', user.id)
      .eq('status', 'running');

    if (botsError) {
      console.error('Failed to fetch running bots:', botsError);
    }

    let botsKilled = 0;
    if (runningBots && runningBots.length > 0) {
      const { error: stopError } = await supabase
        .from('bot_runs')
        .update({ 
          status: 'killed', 
          stopped_at: new Date().toISOString(),
          analysis_report: { kill_reason: reason, killed_at: new Date().toISOString() }
        })
        .eq('user_id', user.id)
        .eq('status', 'running');

      if (stopError) {
        console.error('Failed to stop bots:', stopError);
      } else {
        botsKilled = runningBots.length;
        console.log(`✅ Stopped ${botsKilled} running bots`);
      }
    }

    // Step 2: Call convert-to-usdt to liquidate all positions
    let positionsClosed: Array<{ asset: string; quantity: number; usdtReceived: number }> = [];
    let totalUsdtRecovered = 0;

    try {
      console.log('📤 Calling convert-to-usdt to liquidate positions...');
      
      const { data: convertData, error: convertError } = await supabase.functions.invoke('convert-to-usdt', {
        body: {},
        headers: { Authorization: authHeader }
      });

      if (convertError) {
        console.error('Convert-to-USDT error:', convertError);
      } else if (convertData) {
        positionsClosed = convertData.closedPositions || [];
        totalUsdtRecovered = convertData.totalUsdtRecovered || 0;
        console.log(`✅ Liquidated ${positionsClosed.length} positions, recovered $${totalUsdtRecovered}`);
      }
    } catch (e) {
      console.error('Failed to convert positions to USDT:', e);
    }

    // Step 3: Record kill event in database
    const { data: killEvent, error: killError } = await supabase
      .from('kill_events')
      .insert({
        user_id: user.id,
        reason,
        trigger_pnl: currentPnL,
        threshold_used: threshold,
        bots_killed: botsKilled,
        positions_closed: positionsClosed,
        total_usdt_recovered: totalUsdtRecovered,
        total_loss_locked: Math.abs(currentPnL),
        config_snapshot: configSnapshot || {},
      })
      .select()
      .single();

    if (killError) {
      console.error('Failed to record kill event:', killError);
    }

    // Step 4: Create alert for user
    await supabase.from('alerts').insert({
      user_id: user.id,
      title: '🔴 Emergency Kill Executed',
      message: `Reason: ${reason}. Stopped ${botsKilled} bots. Recovered $${totalUsdtRecovered.toFixed(2)} USDT.`,
      alert_type: 'emergency_kill',
      data: {
        reason,
        trigger_pnl: currentPnL,
        threshold,
        bots_killed: botsKilled,
        total_usdt_recovered: totalUsdtRecovered,
      }
    });

    console.log('✅ Emergency kill complete');

    return new Response(JSON.stringify({
      success: true,
      botsKilled,
      positionsClosed,
      totalUsdtRecovered,
      totalLossLocked: Math.abs(currentPnL),
      timestamp: new Date().toISOString(),
      killEventId: killEvent?.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Emergency kill error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Emergency kill failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
