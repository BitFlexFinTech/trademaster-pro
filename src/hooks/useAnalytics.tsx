import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface PnlDataPoint {
  date: string;
  pnl: number;
}

interface ExchangePerformance {
  exchange: string;
  trades: number;
  profit: number;
}

interface AnalyticsData {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  avgProfitPerTrade: number;
  activeStrategies: number;
  pnlHistory: PnlDataPoint[];
  winLossRatio: { wins: number; losses: number };
  exchangePerformance: ExchangePerformance[];
}

export function useAnalytics(timeframe: '7d' | '30d' | '90d' = '30d', exchange: string = 'all') {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalPnl: 0,
    winRate: 0,
    totalTrades: 0,
    avgProfitPerTrade: 0,
    activeStrategies: 0,
    pnlHistory: [],
    winLossRatio: { wins: 0, losses: 0 },
    exchangePerformance: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Calculate date range
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Fetch trades
      let query = supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startDate.toISOString());

      if (exchange !== 'all') {
        query = query.eq('exchange_name', exchange);
      }

      const { data: trades, error } = await query;
      if (error) throw error;

      // Calculate metrics
      const closedTrades = trades?.filter(t => t.status === 'closed') || [];
      const wins = closedTrades.filter(t => (t.profit_loss || 0) > 0);
      const losses = closedTrades.filter(t => (t.profit_loss || 0) <= 0);
      
      const totalPnl = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
      const avgProfit = wins.length > 0 
        ? wins.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / wins.length 
        : 0;

      // Group by date for P&L history
      const pnlByDate = new Map<string, number>();
      closedTrades.forEach(trade => {
        const date = new Date(trade.closed_at || trade.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        pnlByDate.set(date, (pnlByDate.get(date) || 0) + (trade.profit_loss || 0));
      });

      const pnlHistory: PnlDataPoint[] = [];
      let cumulative = 0;
      Array.from(pnlByDate.entries()).forEach(([date, pnl]) => {
        cumulative += pnl;
        pnlHistory.push({ date, pnl: Math.round(cumulative) });
      });

      // Group by exchange
      const exchangeMap = new Map<string, { trades: number; profit: number }>();
      closedTrades.forEach(trade => {
        const ex = trade.exchange_name || 'Unknown';
        const current = exchangeMap.get(ex) || { trades: 0, profit: 0 };
        exchangeMap.set(ex, {
          trades: current.trades + 1,
          profit: current.profit + (trade.profit_loss || 0),
        });
      });

      const exchangePerformance: ExchangePerformance[] = Array.from(exchangeMap.entries())
        .map(([exchange, data]) => ({
          exchange,
          trades: data.trades,
          profit: Math.round(data.profit),
        }))
        .sort((a, b) => b.profit - a.profit);

      // Fetch active strategies count
      const { count: strategiesCount } = await supabase
        .from('strategy_executions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'running');

      setAnalytics({
        totalPnl: Math.round(totalPnl),
        winRate: Math.round(winRate * 10) / 10,
        totalTrades: closedTrades.length,
        avgProfitPerTrade: Math.round(avgProfit * 100) / 100,
        activeStrategies: strategiesCount || 0,
        pnlHistory,
        winLossRatio: { wins: wins.length, losses: losses.length },
        exchangePerformance,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [user, timeframe, exchange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
}
