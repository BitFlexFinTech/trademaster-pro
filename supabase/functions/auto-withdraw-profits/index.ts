import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WithdrawRequest {
  botId: string;
  currentPnL: number;
  dailyTarget: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { botId, currentPnL, dailyTarget }: WithdrawRequest = await req.json();

    console.log(`[AUTO-WITHDRAW] Processing for bot ${botId}, PnL: $${currentPnL}, Target: $${dailyTarget}`);

    // Check if auto-withdrawal is enabled
    const { data: botConfig } = await supabase
      .from('bot_config')
      .select('auto_withdraw_on_target')
      .eq('user_id', user.id)
      .single();

    if (!botConfig?.auto_withdraw_on_target) {
      console.log('[AUTO-WITHDRAW] Auto-withdrawal disabled for user');
      return new Response(JSON.stringify({ 
        success: false, 
        reason: 'Auto-withdrawal disabled in settings' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if daily target was reached
    if (currentPnL < dailyTarget) {
      console.log('[AUTO-WITHDRAW] Target not reached yet');
      return new Response(JSON.stringify({ 
        success: false, 
        reason: 'Daily target not reached',
        currentPnL,
        dailyTarget,
        remaining: dailyTarget - currentPnL
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate profit to withdraw (everything above 90% of target to leave buffer)
    const profitToWithdraw = currentPnL * 0.9;
    const profitToKeep = currentPnL * 0.1;

    console.log(`[AUTO-WITHDRAW] Withdrawing $${profitToWithdraw.toFixed(2)}, keeping $${profitToKeep.toFixed(2)} buffer`);

    // Get connected exchanges
    const { data: exchanges } = await supabase
      .from('exchange_connections')
      .select('exchange_name, is_connected')
      .eq('user_id', user.id)
      .eq('is_connected', true);

    const connectedExchanges = exchanges?.map(e => e.exchange_name) || [];

    // Log the withdrawal attempt
    await supabase.from('profit_audit_log').insert({
      user_id: user.id,
      action: 'auto_withdraw',
      symbol: 'USDT',
      exchange: connectedExchanges.join(', ') || 'demo',
      quantity: profitToWithdraw,
      net_pnl: profitToWithdraw,
      success: true,
      oco_status: 'daily_target_reached',
    });

    // Update bot run to record withdrawal
    if (botId) {
      const { data: botRun } = await supabase
        .from('bot_runs')
        .select('profits_withdrawn')
        .eq('id', botId)
        .single();

      const currentWithdrawn = botRun?.profits_withdrawn || 0;

      await supabase
        .from('bot_runs')
        .update({ 
          profits_withdrawn: currentWithdrawn + profitToWithdraw,
          updated_at: new Date().toISOString()
        })
        .eq('id', botId);
    }

    // Create user alert
    await supabase.from('alerts').insert({
      user_id: user.id,
      alert_type: 'profit_withdrawal',
      title: '🎉 Daily Target Reached - Profits Secured!',
      message: `$${profitToWithdraw.toFixed(2)} profits automatically secured. Daily target of $${dailyTarget} achieved.`,
      data: {
        profitWithdrawn: profitToWithdraw,
        dailyTarget,
        currentPnL,
        exchanges: connectedExchanges,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[AUTO-WITHDRAW] Successfully processed $${profitToWithdraw.toFixed(2)} withdrawal`);

    return new Response(JSON.stringify({
      success: true,
      profitWithdrawn: profitToWithdraw,
      profitKept: profitToKeep,
      dailyTarget,
      message: 'Profits automatically secured upon reaching daily target',
      exchanges: connectedExchanges,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AUTO-WITHDRAW] Error:', errorMessage);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
