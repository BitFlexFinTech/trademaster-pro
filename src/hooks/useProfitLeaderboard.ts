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

  // Fetch trades for the period
  useEffect(() => {
    if (!user?.id) return;

    const fetchTrades = async () => {
      setIsLoading(true);
      
      // Calculate date filter
      let dateFilter: string | undefined;
      const now = new Date();
      
      switch (period) {
        case 'day':
          dateFilter = startOfDay(now).toISOString();
          break;
        case 'week':
          dateFilter = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
          break;
        case 'month':
          dateFilter = startOfMonth(now).toISOString();
          break;
        case 'all':
          dateFilter = undefined;
          break;
      }

      let query = supabase
        .from('trades')
        .select('pair, direction, profit_loss, status')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false });

      if (dateFilter) {
        query = query.gte('closed_at', dateFilter);
      }

      const { data, error } = await query.limit(1000);

      if (error) {
        console.error('[useProfitLeaderboard] Error fetching trades:', error);
        setIsLoading(false);
        return;
      }

      setTrades(data || []);
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

    // Convert to rankings array and sort by total profit
    const rankings: PairRanking[] = Object.entries(pairStats)
      .map(([pair, stats]) => ({
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
      }))
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
  }, [trades, isLoading]);

  return leaderboardData;
}
