import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConfigPayload {
  user_id?: string;
  daily_target?: number;
  profit_per_trade?: number;
  amount_per_trade?: number;
  trade_interval_ms?: number;
  daily_stop_loss?: number;
  per_trade_stop_loss?: number;
  focus_pairs?: string[];
  leverage_defaults?: Record<string, number>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError) {
        console.error('Auth error:', authError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user?.id || null;
    }
    
    const body: ConfigPayload = await req.json();
    
    // Use user_id from auth or from body (for webhook calls)
    const targetUserId = userId || body.user_id;
    
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'No user_id provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate minimum values
    const configData = {
      user_id: targetUserId,
      daily_target: body.daily_target ?? 40,
      profit_per_trade: Math.max(0.01, body.profit_per_trade ?? 0.01), // Min $0.01
      amount_per_trade: Math.max(10, body.amount_per_trade ?? 10),     // Min $10
      trade_interval_ms: Math.max(1000, body.trade_interval_ms ?? 3000), // Min 1s
      daily_stop_loss: body.daily_stop_loss ?? 5,
      per_trade_stop_loss: body.per_trade_stop_loss ?? (body.profit_per_trade ? body.profit_per_trade * 0.2 : 0.002), // 80/20 rule
      focus_pairs: body.focus_pairs ?? ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'],
      leverage_defaults: body.leverage_defaults ?? {},
      updated_at: new Date().toISOString(),
    };

    // Upsert config
    const { data, error } = await supabase
      .from('bot_config')
      .upsert(configData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Upsert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log the config change for audit trail
    await supabase.from('alerts').insert({
      user_id: targetUserId,
      alert_type: 'config_auto_applied',
      title: 'AI Config Auto-Applied',
      message: `Daily: $${configData.daily_target}, Profit/Trade: $${configData.profit_per_trade.toFixed(2)}, Position: $${configData.amount_per_trade}`,
      data: configData,
    });

    console.log(`[AUTO-APPLY CONFIG] User ${targetUserId}: Daily $${configData.daily_target}, Profit $${configData.profit_per_trade}`);

    return new Response(JSON.stringify({ 
      success: true, 
      config: data,
      message: 'Config auto-applied and synced',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Auto-apply config error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
