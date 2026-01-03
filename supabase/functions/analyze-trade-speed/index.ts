import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'update_analytics') {
      // Update speed analytics from closed trades
      const { tradeId, symbol, timeframe, durationSeconds, isWin, hourOfDay } = body;

      // Get existing analytics
      const { data: existing } = await supabase
        .from('trade_speed_analytics')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .eq('timeframe', timeframe || '1m')
        .eq('hour_of_day', hourOfDay)
        .maybeSingle();

      if (existing) {
        // Update running averages
        const newSampleSize = (existing.sample_size || 0) + 1;
        const oldWins = Math.round((existing.win_rate || 0) / 100 * (existing.sample_size || 0));
        const newWins = oldWins + (isWin ? 1 : 0);
        const newWinRate = (newWins / newSampleSize) * 100;
        const newAvgDuration = Math.round(
          ((existing.avg_duration_seconds || 0) * (existing.sample_size || 0) + durationSeconds) / newSampleSize
        );

        await supabase
          .from('trade_speed_analytics')
          .update({
            avg_duration_seconds: newAvgDuration,
            sample_size: newSampleSize,
            win_rate: newWinRate,
            last_updated: new Date().toISOString(),
          })
          .eq('id', existing.id);

        console.log(`📊 Updated speed analytics for ${symbol}: avg=${newAvgDuration}s, samples=${newSampleSize}`);
      } else {
        // Create new record
        await supabase
          .from('trade_speed_analytics')
          .insert({
            user_id: user.id,
            symbol,
            timeframe: timeframe || '1m',
            avg_duration_seconds: durationSeconds,
            sample_size: 1,
            win_rate: isWin ? 100 : 0,
            hour_of_day: hourOfDay,
            day_of_week: new Date().getDay(),
          });

        console.log(`📊 Created speed analytics for ${symbol}: duration=${durationSeconds}s`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'get_fast_pairs') {
      // Get pairs with fastest average closing times
      const { data: fastPairs } = await supabase
        .from('trade_speed_analytics')
        .select('symbol, avg_duration_seconds, win_rate, sample_size')
        .eq('user_id', user.id)
        .lt('avg_duration_seconds', 300) // Under 5 minutes
        .gte('sample_size', 5) // At least 5 samples
        .order('avg_duration_seconds', { ascending: true })
        .limit(10);

      return new Response(JSON.stringify({ fastPairs: fastPairs || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'get_rejection_stats') {
      // Get rejection statistics for analysis
      const { data: rejections } = await supabase
        .from('rejected_trades')
        .select('rejection_reason, symbol')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Group by reason
      const reasonCounts: Record<string, number> = {};
      const symbolCounts: Record<string, number> = {};

      (rejections || []).forEach(r => {
        const reasonKey = r.rejection_reason.split(':')[0];
        reasonCounts[reasonKey] = (reasonCounts[reasonKey] || 0) + 1;
        symbolCounts[r.symbol] = (symbolCounts[r.symbol] || 0) + 1;
      });

      return new Response(JSON.stringify({ 
        totalRejections: rejections?.length || 0,
        byReason: reasonCounts,
        bySymbol: symbolCounts,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("analyze-trade-speed error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
