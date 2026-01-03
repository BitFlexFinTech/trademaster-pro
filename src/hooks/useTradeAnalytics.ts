import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PairStats {
  pair: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfit: number;
  avgProfit: number;
  avgHoldTime: number; // in minutes
}

export interface DirectionStats {
  direction: 'long' | 'short';
  totalTrades: number;
  wins: number;
  winRate: number;
  totalProfit: number;
}

export interface DailyProfit {
  date: string;
  profit: number;
  trades: number;
}

export interface ProfitBucket {
  range: string;
  count: number;
}

export interface TradeAnalytics {
  // Summary
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  overallWinRate: number;
  totalProfit: number;
  avgProfitPerTrade: number;
  avgHoldTime: number;
  
  // By pair
  pairStats: PairStats[];
  bestPair: PairStats | null;
  worstPair: PairStats | null;
  
  // By direction
  longStats: DirectionStats;
  shortStats: DirectionStats;
  
  // Time series
  dailyProfits: DailyProfit[];
  
  // Distribution
  profitDistribution: ProfitBucket[];
  
  // MTF alignment (if mtf_analysis column exists)
  mtfAlignedWinRate: number;
  mtfMixedWinRate: number;
}

const DEFAULT_ANALYTICS: TradeAnalytics = {
  totalTrades: 0,
  totalWins: 0,
  totalLosses: 0,
  overallWinRate: 0,
  totalProfit: 0,
  avgProfitPerTrade: 0,
  avgHoldTime: 0,
  pairStats: [],
  bestPair: null,
  worstPair: null,
  longStats: { direction: 'long', totalTrades: 0, wins: 0, winRate: 0, totalProfit: 0 },
  shortStats: { direction: 'short', totalTrades: 0, wins: 0, winRate: 0, totalProfit: 0 },
  dailyProfits: [],
  profitDistribution: [],
  mtfAlignedWinRate: 0,
  mtfMixedWinRate: 0,
};

export function useTradeAnalytics(days: number = 30) {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<TradeAnalytics>(DEFAULT_ANALYTICS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use UTC for consistent date calculations
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);

      const { data: trades, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', startDate.toISOString())
        .order('closed_at', { ascending: true });

      if (tradesError) throw tradesError;
      if (!trades || trades.length === 0) {
        setAnalytics(DEFAULT_ANALYTICS);
        return;
      }

      // Calculate summary stats
      const totalTrades = trades.length;
      const wins = trades.filter(t => (t.profit_loss || 0) > 0);
      const losses = trades.filter(t => (t.profit_loss || 0) <= 0);
      const totalProfit = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      
      // Calculate avg hold time
      const holdTimes = trades
        .filter(t => t.created_at && t.closed_at)
        .map(t => {
          const open = new Date(t.created_at).getTime();
          const close = new Date(t.closed_at!).getTime();
          return (close - open) / 60000; // minutes
        });
      const avgHoldTime = holdTimes.length > 0 
        ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
        : 0;

      // Group by pair
      const pairMap = new Map<string, { wins: number; losses: number; profit: number; holdTimes: number[] }>();
      trades.forEach(t => {
        const existing = pairMap.get(t.pair) || { wins: 0, losses: 0, profit: 0, holdTimes: [] };
        if ((t.profit_loss || 0) > 0) existing.wins++;
        else existing.losses++;
        existing.profit += t.profit_loss || 0;
        if (t.created_at && t.closed_at) {
          const holdTime = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 60000;
          existing.holdTimes.push(holdTime);
        }
        pairMap.set(t.pair, existing);
      });

      const pairStats: PairStats[] = Array.from(pairMap.entries()).map(([pair, stats]) => ({
        pair,
        totalTrades: stats.wins + stats.losses,
        wins: stats.wins,
        losses: stats.losses,
        winRate: (stats.wins / (stats.wins + stats.losses)) * 100,
        totalProfit: stats.profit,
        avgProfit: stats.profit / (stats.wins + stats.losses),
        avgHoldTime: stats.holdTimes.length > 0 
          ? stats.holdTimes.reduce((a, b) => a + b, 0) / stats.holdTimes.length 
          : 0,
      }));

      // Sort by total profit for best/worst
      const sortedByProfit = [...pairStats].sort((a, b) => b.totalProfit - a.totalProfit);
      const bestPair = sortedByProfit[0] || null;
      const worstPair = sortedByProfit[sortedByProfit.length - 1] || null;

      // Group by direction
      const longTrades = trades.filter(t => t.direction === 'long');
      const shortTrades = trades.filter(t => t.direction === 'short');

      const longStats: DirectionStats = {
        direction: 'long',
        totalTrades: longTrades.length,
        wins: longTrades.filter(t => (t.profit_loss || 0) > 0).length,
        winRate: longTrades.length > 0 
          ? (longTrades.filter(t => (t.profit_loss || 0) > 0).length / longTrades.length) * 100 
          : 0,
        totalProfit: longTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
      };

      const shortStats: DirectionStats = {
        direction: 'short',
        totalTrades: shortTrades.length,
        wins: shortTrades.filter(t => (t.profit_loss || 0) > 0).length,
        winRate: shortTrades.length > 0 
          ? (shortTrades.filter(t => (t.profit_loss || 0) > 0).length / shortTrades.length) * 100 
          : 0,
        totalProfit: shortTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
      };

      // Daily profits
      const dailyMap = new Map<string, { profit: number; trades: number }>();
      trades.forEach(t => {
        if (!t.closed_at) return;
        const date = t.closed_at.split('T')[0];
        const existing = dailyMap.get(date) || { profit: 0, trades: 0 };
        existing.profit += t.profit_loss || 0;
        existing.trades++;
        dailyMap.set(date, existing);
      });

      const dailyProfits: DailyProfit[] = Array.from(dailyMap.entries())
        .map(([date, stats]) => ({
          date,
          profit: stats.profit,
          trades: stats.trades,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Profit distribution buckets
      const buckets = [
        { min: -Infinity, max: -1, label: '< -$1' },
        { min: -1, max: 0, label: '-$1 to $0' },
        { min: 0, max: 0.5, label: '$0 to $0.50' },
        { min: 0.5, max: 1, label: '$0.50 to $1' },
        { min: 1, max: 1.5, label: '$1 to $1.50' },
        { min: 1.5, max: Infinity, label: '> $1.50' },
      ];

      const profitDistribution: ProfitBucket[] = buckets.map(bucket => ({
        range: bucket.label,
        count: trades.filter(t => {
          const pnl = t.profit_loss || 0;
          return pnl > bucket.min && pnl <= bucket.max;
        }).length,
      }));

      // Calculate MTF alignment win rates
      const mtfAlignedTrades = trades.filter(t => {
        if (!t.mtf_analysis) return false;
        try {
          const mtf = typeof t.mtf_analysis === 'string' 
            ? JSON.parse(t.mtf_analysis) 
            : t.mtf_analysis;
          return mtf.alignment === 'aligned' || (mtf.confluence && mtf.confluence >= 3);
        } catch {
          return false;
        }
      });
      
      const mtfMixedTrades = trades.filter(t => {
        if (!t.mtf_analysis) return false;
        try {
          const mtf = typeof t.mtf_analysis === 'string' 
            ? JSON.parse(t.mtf_analysis) 
            : t.mtf_analysis;
          return mtf.alignment === 'mixed' || (mtf.confluence && mtf.confluence < 3);
        } catch {
          return false;
        }
      });
      
      const mtfAlignedWinRate = mtfAlignedTrades.length > 0
        ? (mtfAlignedTrades.filter(t => (t.profit_loss || 0) > 0).length / mtfAlignedTrades.length) * 100
        : 0;
        
      const mtfMixedWinRate = mtfMixedTrades.length > 0
        ? (mtfMixedTrades.filter(t => (t.profit_loss || 0) > 0).length / mtfMixedTrades.length) * 100
        : 0;

      setAnalytics({
        totalTrades,
        totalWins: wins.length,
        totalLosses: losses.length,
        overallWinRate: totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0,
        totalProfit,
        avgProfitPerTrade: totalTrades > 0 ? totalProfit / totalTrades : 0,
        avgHoldTime,
        pairStats: sortedByProfit,
        bestPair,
        worstPair,
        longStats,
        shortStats,
        dailyProfits,
        profitDistribution,
        mtfAlignedWinRate,
        mtfMixedWinRate,
      });
    } catch (e) {
      console.error('Failed to fetch trade analytics:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Subscribe to trade updates for real-time refresh
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('trade-analytics-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        // Refresh analytics when trades change
        fetchAnalytics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchAnalytics]);

  return { analytics, isLoading, error, refresh: fetchAnalytics };
}
