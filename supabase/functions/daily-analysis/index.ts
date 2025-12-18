import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeAnalysis {
  pair: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

interface HourAnalysis {
  hour: number;
  trades: number;
  pnl: number;
  winRate: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sessionStartTime } = await req.json();
    
    // Calculate period start (24 hours ago if no session start provided)
    const periodStart = sessionStartTime 
      ? new Date(sessionStartTime) 
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    console.log(`[DAILY ANALYSIS] Generating report for ${user.id} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

    // Fetch all trades in the period
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString())
      .order('created_at', { ascending: true });

    if (tradesError) {
      console.error('[DAILY ANALYSIS] Failed to fetch trades:', tradesError);
      throw tradesError;
    }

    const tradeList = trades || [];
    console.log(`[DAILY ANALYSIS] Found ${tradeList.length} trades in period`);

    // Calculate overall metrics
    const wins = tradeList.filter(t => (t.profit_loss || 0) > 0);
    const losses = tradeList.filter(t => (t.profit_loss || 0) < 0);
    const totalPnl = tradeList.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const totalWinAmount = wins.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    const totalLossAmount = Math.abs(losses.reduce((sum, t) => sum + (t.profit_loss || 0), 0));
    
    const overallStats = {
      totalTrades: tradeList.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      totalPnl,
      winRate: tradeList.length > 0 ? (wins.length / tradeList.length) * 100 : 0,
      avgWin: wins.length > 0 ? totalWinAmount / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLossAmount / losses.length : 0,
      profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? Infinity : 0,
      largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.profit_loss || 0)) : 0,
      largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.profit_loss || 0)) : 0,
    };

    // Analyze by pair
    const pairMap = new Map<string, TradeAnalysis>();
    tradeList.forEach(trade => {
      const pair = trade.pair;
      const existing = pairMap.get(pair) || {
        pair,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPnl: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
      };
      
      existing.totalTrades++;
      existing.totalPnl += trade.profit_loss || 0;
      
      if ((trade.profit_loss || 0) > 0) {
        existing.wins++;
      } else if ((trade.profit_loss || 0) < 0) {
        existing.losses++;
      }
      
      pairMap.set(pair, existing);
    });

    // Calculate pair stats
    const pairAnalysis = Array.from(pairMap.values()).map(p => {
      const pairWins = tradeList.filter(t => t.pair === p.pair && (t.profit_loss || 0) > 0);
      const pairLosses = tradeList.filter(t => t.pair === p.pair && (t.profit_loss || 0) < 0);
      return {
        ...p,
        winRate: p.totalTrades > 0 ? (p.wins / p.totalTrades) * 100 : 0,
        avgWin: pairWins.length > 0 ? pairWins.reduce((s, t) => s + (t.profit_loss || 0), 0) / pairWins.length : 0,
        avgLoss: pairLosses.length > 0 ? Math.abs(pairLosses.reduce((s, t) => s + (t.profit_loss || 0), 0)) / pairLosses.length : 0,
      };
    }).sort((a, b) => b.totalPnl - a.totalPnl);

    const bestPairs = pairAnalysis.slice(0, 3);
    const worstPairs = [...pairAnalysis].sort((a, b) => a.totalPnl - b.totalPnl).slice(0, 3);

    // Analyze by hour
    const hourMap = new Map<number, HourAnalysis>();
    tradeList.forEach(trade => {
      const hour = new Date(trade.created_at).getHours();
      const existing = hourMap.get(hour) || { hour, trades: 0, pnl: 0, winRate: 0 };
      existing.trades++;
      existing.pnl += trade.profit_loss || 0;
      hourMap.set(hour, existing);
    });

    const hourAnalysis = Array.from(hourMap.values())
      .map(h => {
        const hourTrades = tradeList.filter(t => new Date(t.created_at).getHours() === h.hour);
        const hourWins = hourTrades.filter(t => (t.profit_loss || 0) > 0);
        return {
          ...h,
          winRate: hourTrades.length > 0 ? (hourWins.length / hourTrades.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.pnl - a.pnl);

    const bestTradingHours = hourAnalysis.slice(0, 3).map(h => h.hour);

    // Calculate average trade duration
    const tradeDurations = tradeList
      .filter(t => t.closed_at)
      .map(t => new Date(t.closed_at).getTime() - new Date(t.created_at).getTime());
    const avgTradeTime = tradeDurations.length > 0 
      ? tradeDurations.reduce((a, b) => a + b, 0) / tradeDurations.length / 1000 
      : 0;

    // Generate AI recommendations
    const recommendations = {
      profitPerTrade: overallStats.avgWin > 0 ? Math.round(overallStats.avgWin * 0.8 * 100) / 100 : 0.50,
      tradeInterval: overallStats.winRate >= 95 ? 15000 : overallStats.winRate >= 90 ? 30000 : 60000,
      focusPairs: bestPairs.slice(0, 5).map(p => p.pair),
      riskLevel: overallStats.profitFactor >= 2 ? 'aggressive' : overallStats.profitFactor >= 1.5 ? 'moderate' : 'conservative',
    };

    // Generate improvement suggestions
    const improvements: string[] = [];
    
    if (overallStats.winRate < 90) {
      improvements.push('Focus on higher-confidence setups to improve win rate above 90%');
    }
    if (overallStats.avgLoss > overallStats.avgWin * 0.5) {
      improvements.push('Tighten stop losses - average loss is too high relative to wins');
    }
    if (worstPairs.length > 0 && worstPairs[0].totalPnl < -5) {
      improvements.push(`Consider removing ${worstPairs[0].pair} from focus pairs - consistently underperforming`);
    }
    if (bestTradingHours.length > 0) {
      improvements.push(`Best trading hours: ${bestTradingHours.map(h => `${h}:00`).join(', ')} - consider focusing activity here`);
    }
    if (overallStats.profitFactor < 1.5) {
      improvements.push('Profit factor below 1.5 - reduce position sizes until performance improves');
    }

    // Compile full analysis report
    const analysis = {
      period: '24h',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      
      // Performance metrics
      totalPnl: overallStats.totalPnl,
      winRate: overallStats.winRate,
      totalTrades: overallStats.totalTrades,
      avgProfitPerTrade: overallStats.totalTrades > 0 ? overallStats.totalPnl / overallStats.totalTrades : 0,
      avgWin: overallStats.avgWin,
      avgLoss: overallStats.avgLoss,
      profitFactor: overallStats.profitFactor,
      largestWin: overallStats.largestWin,
      largestLoss: overallStats.largestLoss,
      
      // Pair analysis
      bestPairs,
      worstPairs,
      pairBreakdown: pairAnalysis,
      
      // Time analysis
      bestTradingHours,
      hourBreakdown: hourAnalysis,
      avgTradeTime,
      
      // AI recommendations for NEXT 24 hours
      recommendations,
      
      // Improvement suggestions
      improvements,
      
      // Summary
      dailyTargetAchieved: overallStats.totalPnl >= 30, // Assuming $30 default target
      targetProgress: (overallStats.totalPnl / 30) * 100,
      
      // Metadata
      generatedAt: new Date().toISOString(),
    };

    // Store analysis in database for historical tracking
    await supabase.from('bot_runs').update({
      analysis_report: analysis,
    }).eq('user_id', user.id).eq('status', 'stopped').order('stopped_at', { ascending: false }).limit(1);

    console.log(`[DAILY ANALYSIS] Report generated successfully:`, {
      totalTrades: analysis.totalTrades,
      totalPnl: analysis.totalPnl.toFixed(2),
      winRate: analysis.winRate.toFixed(1),
    });

    return new Response(JSON.stringify({ 
      success: true, 
      analysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[DAILY ANALYSIS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate analysis';
    return new Response(JSON.stringify({ 
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
