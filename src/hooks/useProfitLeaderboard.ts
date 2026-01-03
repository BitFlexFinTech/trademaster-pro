import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { startOfDay, startOfWeek, startOfMonth, subDays } from 'date-fns';

export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'all';

export interface PairRanking {
  rank: number;
  pair: string;
  totalProfit: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgProfit: number;
  longProfit: number;
  shortProfit: number;
  longCount: number;
  shortCount: number;
  bestTrade: number;
  worstTrade: number;
  // Trend indicators
  trend: 'up' | 'down' | 'stable';
  trendValue: number; // % change vs previous period
}

export interface LeaderboardData {
  rankings: PairRanking[];
  totalProfit: number;
  totalTrades: number;
  overallWinRate: number;
  topPerformer: string | null;
  worstPerformer: string | null;
  isLoading: boolean;
}

export function useProfitLeaderboard(period: LeaderboardPeriod = 'day'): LeaderboardData {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [previousPeriodTrades, setPreviousPeriodTrades] = useState<any[]>([]);

  // Fetch trades for current and previous period (for trend calculation)
  useEffect(() => {
    if (!user?.id) return;

    const fetchTrades = async () => {
      setIsLoading(true);
      
      // Calculate date filters for current and previous periods
      let currentDateFilter: string | undefined;
      let previousDateFilter: string | undefined;
      let previousEndFilter: string | undefined;
      const now = new Date();
      
      switch (period) {
        case 'day':
          currentDateFilter = startOfDay(now).toISOString();
          previousEndFilter = startOfDay(now).toISOString();
          previousDateFilter = subDays(startOfDay(now), 1).toISOString();
          break;
        case 'week':
          currentDateFilter = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
          previousEndFilter = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
          previousDateFilter = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7).toISOString();
          break;
        case 'month':
          currentDateFilter = startOfMonth(now).toISOString();
          previousEndFilter = startOfMonth(now).toISOString();
          previousDateFilter = subDays(startOfMonth(now), 30).toISOString();
          break;
        case 'all':
          currentDateFilter = undefined;
          previousDateFilter = undefined;
          break;
      }

      // Fetch current period trades
      let query = supabase
        .from('trades')
        .select('pair, direction, profit_loss, status, closed_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });

      if (currentDateFilter) {
        query = query.gte('closed_at', currentDateFilter);
      }

      const { data, error } = await query.limit(1000);

      if (error) {
        console.error('[useProfitLeaderboard] Error fetching trades:', error);
        setIsLoading(false);
        return;
      }

      setTrades(data || []);

      // Fetch previous period trades for trend calculation
      if (previousDateFilter && previousEndFilter) {
        const { data: prevData } = await supabase
          .from('trades')
          .select('pair, direction, profit_loss, status')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('closed_at', previousDateFilter)
          .lt('closed_at', previousEndFilter)
          .limit(1000);
        
        setPreviousPeriodTrades(prevData || []);
      } else {
        setPreviousPeriodTrades([]);
      }

      setIsLoading(false);
    };

    fetchTrades();
  }, [user?.id, period]);

  // Calculate rankings
  const leaderboardData = useMemo((): LeaderboardData => {
    if (trades.length === 0) {
      return {
        rankings: [],
        totalProfit: 0,
        totalTrades: 0,
        overallWinRate: 0,
        topPerformer: null,
        worstPerformer: null,
        isLoading,
      };
    }

    // Group trades by pair
    const pairStats: Record<string, {
      totalProfit: number;
      tradeCount: number;
      winCount: number;
      lossCount: number;
      longProfit: number;
      shortProfit: number;
      longCount: number;
      shortCount: number;
      bestTrade: number;
      worstTrade: number;
    }> = {};

    trades.forEach(trade => {
      const pair = trade.pair || 'Unknown';
      const profit = trade.profit_loss || 0;
      const isWin = profit > 0;
      const isLong = trade.direction === 'long';

      if (!pairStats[pair]) {
        pairStats[pair] = {
          totalProfit: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
          longProfit: 0,
          shortProfit: 0,
          longCount: 0,
          shortCount: 0,
          bestTrade: -Infinity,
          worstTrade: Infinity,
        };
      }

      const stats = pairStats[pair];
      stats.totalProfit += profit;
      stats.tradeCount += 1;
      if (isWin) stats.winCount += 1;
      else stats.lossCount += 1;
      
      if (isLong) {
        stats.longProfit += profit;
        stats.longCount += 1;
      } else {
        stats.shortProfit += profit;
        stats.shortCount += 1;
      }

      if (profit > stats.bestTrade) stats.bestTrade = profit;
      if (profit < stats.worstTrade) stats.worstTrade = profit;
    });

    // Calculate previous period profit by pair for trend comparison
    const previousPairProfit: Record<string, number> = {};
    previousPeriodTrades.forEach(trade => {
      const pair = trade.pair || 'Unknown';
      const profit = trade.profit_loss || 0;
      previousPairProfit[pair] = (previousPairProfit[pair] || 0) + profit;
    });

    // Calculate trend for a pair
    const calculateTrend = (pair: string, currentProfit: number): { trend: 'up' | 'down' | 'stable'; trendValue: number } => {
      const previousProfit = previousPairProfit[pair] || 0;
      if (previousProfit === 0 && currentProfit === 0) {
        return { trend: 'stable', trendValue: 0 };
      }
      if (previousProfit === 0) {
        return { trend: currentProfit > 0 ? 'up' : 'down', trendValue: 100 };
      }
      const trendValue = ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100;
      const trend = trendValue > 5 ? 'up' : trendValue < -5 ? 'down' : 'stable';
      return { trend, trendValue };
    };

    // Convert to rankings array and sort by total profit
    const rankings: PairRanking[] = Object.entries(pairStats)
      .map(([pair, stats]) => {
        const { trend, trendValue } = calculateTrend(pair, stats.totalProfit);
        return {
          rank: 0, // Will be set after sorting
          pair,
          totalProfit: stats.totalProfit,
          tradeCount: stats.tradeCount,
          winCount: stats.winCount,
          lossCount: stats.lossCount,
          winRate: stats.tradeCount > 0 ? (stats.winCount / stats.tradeCount) * 100 : 0,
          avgProfit: stats.tradeCount > 0 ? stats.totalProfit / stats.tradeCount : 0,
          longProfit: stats.longProfit,
          shortProfit: stats.shortProfit,
          longCount: stats.longCount,
          shortCount: stats.shortCount,
          bestTrade: stats.bestTrade === -Infinity ? 0 : stats.bestTrade,
          worstTrade: stats.worstTrade === Infinity ? 0 : stats.worstTrade,
          trend,
          trendValue,
        };
      })
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const totalProfit = rankings.reduce((sum, r) => sum + r.totalProfit, 0);
    const totalTrades = rankings.reduce((sum, r) => sum + r.tradeCount, 0);
    const totalWins = rankings.reduce((sum, r) => sum + r.winCount, 0);
    const overallWinRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    return {
      rankings,
      totalProfit,
      totalTrades,
      overallWinRate,
      topPerformer: rankings.length > 0 ? rankings[0].pair : null,
      worstPerformer: rankings.length > 0 ? rankings[rankings.length - 1].pair : null,
      isLoading,
    };
  }, [trades, previousPeriodTrades, isLoading]);

  return leaderboardData;
}
