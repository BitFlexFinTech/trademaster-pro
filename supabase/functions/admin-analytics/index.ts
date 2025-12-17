import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // User client to check admin role
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service client for platform-wide queries
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch platform-wide bot performance
    const { data: botRuns } = await serviceClient
      .from('bot_runs')
      .select('id, bot_name, user_id, current_pnl, trades_executed, hit_rate, status, started_at, mode');

    // Fetch all trades for volume analysis
    const { data: trades } = await serviceClient
      .from('trades')
      .select('id, exchange_name, profit_loss, amount, created_at, is_sandbox')
      .order('created_at', { ascending: false })
      .limit(10000);

    // Fetch user profiles
    const { data: profiles } = await serviceClient
      .from('profiles')
      .select('user_id, created_at');

    // Fetch subscriptions for revenue analysis
    const { data: subscriptions } = await serviceClient
      .from('subscriptions')
      .select('id, plan, status, user_id');

    // Fetch error logs
    const { data: errorLogs } = await serviceClient
      .from('error_logs')
      .select('id, level, message, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    // Calculate metrics
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalUsers = profiles?.length || 0;
    const newUsersLast30Days = profiles?.filter(p => new Date(p.created_at) > thirtyDaysAgo).length || 0;
    
    const totalBots = botRuns?.length || 0;
    const runningBots = botRuns?.filter(b => b.status === 'running').length || 0;
    const platformPnL = botRuns?.reduce((sum, b) => sum + (b.current_pnl || 0), 0) || 0;
    const totalTrades = trades?.length || 0;
    const liveTrades = trades?.filter(t => !t.is_sandbox).length || 0;
    const demoTrades = trades?.filter(t => t.is_sandbox).length || 0;

    const avgHitRate = totalBots > 0
      ? botRuns!.reduce((sum, b) => sum + (b.hit_rate || 0), 0) / totalBots
      : 0;

    const activeTraders = new Set(
      botRuns?.filter(b => b.started_at && new Date(b.started_at) > sevenDaysAgo).map(b => b.user_id)
    ).size;

    const totalVolume = trades?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

    // Subscription stats
    const activeSubscriptions = subscriptions?.filter(s => s.status === 'active').length || 0;
    const proUsers = subscriptions?.filter(s => s.plan === 'pro' && s.status === 'active').length || 0;
    const enterpriseUsers = subscriptions?.filter(s => s.plan === 'enterprise' && s.status === 'active').length || 0;

    // Top performing bots
    const topBots = [...(botRuns || [])]
      .sort((a, b) => (b.current_pnl || 0) - (a.current_pnl || 0))
      .slice(0, 10)
      .map(b => ({
        id: b.id,
        name: b.bot_name,
        pnl: b.current_pnl || 0,
        trades: b.trades_executed || 0,
        hitRate: b.hit_rate || 0,
        status: b.status,
        mode: b.mode,
      }));

    // Daily trade volume (last 30 days)
    const volumeByDate = new Map<string, { count: number; pnl: number; volume: number }>();
    trades?.forEach(t => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      const existing = volumeByDate.get(date) || { count: 0, pnl: 0, volume: 0 };
      volumeByDate.set(date, {
        count: existing.count + 1,
        pnl: existing.pnl + (t.profit_loss || 0),
        volume: existing.volume + (t.amount || 0),
      });
    });

    const dailyStats = Array.from(volumeByDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    // Exchange distribution
    const exchangeCounts = new Map<string, number>();
    trades?.forEach(t => {
      if (t.exchange_name) {
        exchangeCounts.set(t.exchange_name, (exchangeCounts.get(t.exchange_name) || 0) + 1);
      }
    });

    const exchangeStats = Array.from(exchangeCounts.entries())
      .map(([name, count]) => ({ name, count, percentage: totalTrades > 0 ? (count / totalTrades) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);

    // Error stats
    const errorCounts = { error: 0, warning: 0, info: 0 };
    errorLogs?.forEach(e => {
      if (e.level in errorCounts) {
        errorCounts[e.level as keyof typeof errorCounts]++;
      }
    });

    return new Response(JSON.stringify({
      platformStats: {
        totalUsers,
        newUsersLast30Days,
        activeTraders,
        totalBots,
        runningBots,
        platformPnL,
        totalTrades,
        liveTrades,
        demoTrades,
        avgHitRate,
        totalVolume,
        activeSubscriptions,
        proUsers,
        enterpriseUsers,
      },
      topBots,
      dailyStats,
      exchangeStats,
      errorStats: errorCounts,
      recentErrors: (errorLogs || []).slice(0, 20),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
