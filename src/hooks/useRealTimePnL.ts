import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface RealTimePnLData {
  currentPnL: number;
  dailyTarget: number;
  progressPercent: number;
  tradesCount: number;
  winsCount: number;
  lossesCount: number;
  winRate: number;
  bestTrade: number;
  worstTrade: number;
  avgTradeProfit: number;
  sessionStart: Date;
  lastUpdate: Date;
  recentPnLHistory: { time: Date; value: number }[];
  recentTrades: {
    id: string;
    pair: string;
    profit: number;
    time: Date;
    direction: string;
  }[];
  isLoading: boolean;
}

export function useRealTimePnL() {
  const { user } = useAuth();
  const [data, setData] = useState<RealTimePnLData>({
    currentPnL: 0,
    dailyTarget: 40,
    progressPercent: 0,
    tradesCount: 0,
    winsCount: 0,
    lossesCount: 0,
    winRate: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgTradeProfit: 0,
    sessionStart: new Date(),
    lastUpdate: new Date(),
    recentPnLHistory: [],
    recentTrades: [],
    isLoading: true,
  });

  const pnlHistoryRef = useRef<{ time: Date; value: number }[]>([]);

  const fetchInitialData = useCallback(async () => {
    if (!user?.id) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch today's trades
    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    // Fetch bot config for daily target
    const { data: config } = await supabase
      .from('bot_config')
      .select('daily_target')
      .eq('user_id', user.id)
      .maybeSingle();

    const dailyTarget = config?.daily_target || 40;

    if (trades && trades.length > 0) {
      const closedTrades = trades.filter(t => t.status === 'closed' && t.profit_loss !== null);
      const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const wins = closedTrades.filter(t => (t.profit_loss || 0) > 0);
      const losses = closedTrades.filter(t => (t.profit_loss || 0) <= 0);
      const profits = closedTrades.map(t => t.profit_loss || 0);
      
      const recentTrades = trades.slice(0, 10).map(t => ({
        id: t.id,
        pair: t.pair,
        profit: t.profit_loss || 0,
        time: new Date(t.created_at),
        direction: t.direction,
      }));

      // Build P&L history from trades
      let cumulative = 0;
      const history = closedTrades
        .sort((a, b) => new Date(a.closed_at || a.created_at).getTime() - new Date(b.closed_at || b.created_at).getTime())
        .map(t => {
          cumulative += t.profit_loss || 0;
          return {
            time: new Date(t.closed_at || t.created_at),
            value: cumulative,
          };
        });

      pnlHistoryRef.current = history;

      setData({
        currentPnL: totalPnL,
        dailyTarget,
        progressPercent: Math.min((totalPnL / dailyTarget) * 100, 100),
        tradesCount: closedTrades.length,
        winsCount: wins.length,
        lossesCount: losses.length,
        winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
        bestTrade: profits.length > 0 ? Math.max(...profits) : 0,
        worstTrade: profits.length > 0 ? Math.min(...profits) : 0,
        avgTradeProfit: closedTrades.length > 0 ? totalPnL / closedTrades.length : 0,
        sessionStart: new Date(trades[trades.length - 1]?.created_at || new Date()),
        lastUpdate: new Date(),
        recentPnLHistory: history.slice(-30),
        recentTrades,
        isLoading: false,
      });
    } else {
      setData(prev => ({
        ...prev,
        dailyTarget,
        isLoading: false,
      }));
    }
  }, [user?.id]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('realtime-pnl')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Real-time trade update:', payload);
          fetchInitialData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_runs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchInitialData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchInitialData]);

  return data;
}
