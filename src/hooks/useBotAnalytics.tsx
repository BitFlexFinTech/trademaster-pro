import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface TradeData {
  id: string;
  pair: string;
  direction: string;
  profit_loss: number;
  exchange_name: string;
  is_sandbox: boolean;
  closed_at: string;
  created_at: string;
}

interface ProfitByExchange {
  exchange: string;
  profit: number;
  trades: number;
  winRate: number;
}

interface PnLHistory {
  date: string;
  pnl: number;
  trades: number;
  cumulative: number;
}

export interface BotAnalytics {
  winCount: number;
  lossCount: number;
  winRate: number;
  profitByExchange: ProfitByExchange[];
  pnlHistory: PnLHistory[];
  avgWinAmount: number;
  avgLossAmount: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  expectancy: number;
  totalProfit: number;
  totalTrades: number;
}

type TimeframeFilter = '7d' | '30d' | '90d' | 'all';
type ModeFilter = 'all' | 'demo' | 'live';
type BotTypeFilter = 'all' | 'spot' | 'leverage';

export function useBotAnalytics(
  timeframe: TimeframeFilter = '30d',
  modeFilter: ModeFilter = 'all',
  botTypeFilter: BotTypeFilter = 'all'
) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrades() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        let query = supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .order('closed_at', { ascending: false });

        // Apply timeframe filter
        if (timeframe !== 'all') {
          const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          query = query.gte('closed_at', startDate.toISOString());
        }

        // Apply mode filter
        if (modeFilter === 'demo') {
          query = query.eq('is_sandbox', true);
        } else if (modeFilter === 'live') {
          query = query.eq('is_sandbox', false);
        }

        // Apply bot type filter (leverage > 1 = leverage bot)
        if (botTypeFilter === 'spot') {
          query = query.eq('leverage', 1);
        } else if (botTypeFilter === 'leverage') {
          query = query.gt('leverage', 1);
        }

        const { data, error } = await query.limit(1000);

        if (error) throw error;
        setTrades(data || []);
      } catch (error) {
        console.error('Error fetching bot analytics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [user, timeframe, modeFilter, botTypeFilter]);

  const analytics = useMemo<BotAnalytics>(() => {
    if (trades.length === 0) {
      return {
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        profitByExchange: [],
        pnlHistory: [],
        avgWinAmount: 0,
        avgLossAmount: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        expectancy: 0,
        totalProfit: 0,
        totalTrades: 0,
      };
    }

    const wins = trades.filter(t => t.profit_loss > 0);
    const losses = trades.filter(t => t.profit_loss <= 0);

    const winCount = wins.length;
    const lossCount = losses.length;
    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

    const totalWinAmount = wins.reduce((sum, t) => sum + t.profit_loss, 0);
    const totalLossAmount = Math.abs(losses.reduce((sum, t) => sum + t.profit_loss, 0));

    const avgWinAmount = winCount > 0 ? totalWinAmount / winCount : 0;
    const avgLossAmount = lossCount > 0 ? totalLossAmount / lossCount : 0;

    const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.profit_loss)) : 0;
    const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.profit_loss)) : 0;

    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? Infinity : 0;
    const lossRate = 100 - winRate;
    const expectancy = (winRate / 100 * avgWinAmount) - (lossRate / 100 * avgLossAmount);

    const totalProfit = trades.reduce((sum, t) => sum + t.profit_loss, 0);

    // Profit by exchange
    const exchangeMap = new Map<string, { profit: number; trades: number; wins: number }>();
    trades.forEach(t => {
      const ex = t.exchange_name || 'Unknown';
      const current = exchangeMap.get(ex) || { profit: 0, trades: 0, wins: 0 };
      exchangeMap.set(ex, {
        profit: current.profit + t.profit_loss,
        trades: current.trades + 1,
        wins: current.wins + (t.profit_loss > 0 ? 1 : 0),
      });
    });

    const profitByExchange: ProfitByExchange[] = Array.from(exchangeMap.entries())
      .map(([exchange, data]) => ({
        exchange,
        profit: data.profit,
        trades: data.trades,
        winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);

    // P&L history by day
    const dateMap = new Map<string, { pnl: number; trades: number }>();
    trades.forEach(t => {
      const date = new Date(t.closed_at || t.created_at).toISOString().split('T')[0];
      const current = dateMap.get(date) || { pnl: 0, trades: 0 };
      dateMap.set(date, {
        pnl: current.pnl + t.profit_loss,
        trades: current.trades + 1,
      });
    });

    const sortedDates = Array.from(dateMap.keys()).sort();
    let cumulative = 0;
    const pnlHistory: PnLHistory[] = sortedDates.map(date => {
      const data = dateMap.get(date)!;
      cumulative += data.pnl;
      return {
        date,
        pnl: data.pnl,
        trades: data.trades,
        cumulative,
      };
    });

    return {
      winCount,
      lossCount,
      winRate,
      profitByExchange,
      pnlHistory,
      avgWinAmount,
      avgLossAmount,
      bestTrade,
      worstTrade,
      profitFactor,
      expectancy,
      totalProfit,
      totalTrades: trades.length,
    };
  }, [trades]);

  return { analytics, loading, trades };
}
