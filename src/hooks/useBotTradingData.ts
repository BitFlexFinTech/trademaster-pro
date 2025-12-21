import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TradingDataMetrics {
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  winsCount: number;
  lossesCount: number;
  bestTrade: number;
  worstTrade: number;
  avgProfit: number;
  tradesPerMinute: number;
}

interface UseBotTradingDataProps {
  exchange?: string;
  botId?: string;
  enabled?: boolean;
}

/**
 * Shared hook for bot trading data that both BotCard and LivePnLDashboard can use
 * Provides real-time synced data across components
 */
export function useBotTradingData({ exchange, botId, enabled = true }: UseBotTradingDataProps = {}) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<TradingDataMetrics>({
    currentPnL: 0,
    tradesExecuted: 0,
    hitRate: 0,
    winsCount: 0,
    lossesCount: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgProfit: 0,
    tradesPerMinute: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  const tradeTimestampsRef = useRef<number[]>([]);

  // Fetch today's trades from database
  const fetchTodaysTrades = useCallback(async () => {
    if (!user?.id || !enabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())
      .eq('status', 'closed')
      .order('created_at', { ascending: false });

    // Filter by exchange if provided
    if (exchange) {
      query = query.eq('exchange_name', exchange);
    }

    const { data: trades, error } = await query;

    if (error) {
      console.error('Error fetching today\'s trades:', error);
      setIsLoading(false);
      return;
    }

    if (trades && trades.length > 0) {
      const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const wins = trades.filter(t => (t.profit_loss || 0) > 0);
      const losses = trades.filter(t => (t.profit_loss || 0) <= 0);
      const profits = trades.map(t => t.profit_loss || 0);

      // Calculate trades per minute
      const timestamps = trades.map(t => new Date(t.created_at).getTime());
      const recentTimestamps = timestamps.filter(t => t > Date.now() - 60000);
      
      setMetrics({
        currentPnL: totalPnL,
        tradesExecuted: trades.length,
        hitRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        winsCount: wins.length,
        lossesCount: losses.length,
        bestTrade: profits.length > 0 ? Math.max(...profits) : 0,
        worstTrade: profits.length > 0 ? Math.min(...profits) : 0,
        avgProfit: trades.length > 0 ? totalPnL / trades.length : 0,
        tradesPerMinute: recentTimestamps.length,
      });
      
      tradeTimestampsRef.current = timestamps;
    } else {
      setMetrics({
        currentPnL: 0,
        tradesExecuted: 0,
        hitRate: 0,
        winsCount: 0,
        lossesCount: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgProfit: 0,
        tradesPerMinute: 0,
      });
    }

    setLastUpdate(new Date());
    setIsLoading(false);
  }, [user?.id, exchange, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchTodaysTrades();
  }, [fetchTodaysTrades]);

  // Subscribe to real-time postgres changes
  useEffect(() => {
    if (!user?.id || !enabled) return;

    const channel = supabase
      .channel(`bot-trading-data-${exchange || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useBotTradingData] Trade change:', payload.eventType);
          fetchTodaysTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, exchange, enabled, fetchTodaysTrades]);

  // Subscribe to broadcast events for instant cross-component sync
  useEffect(() => {
    if (!user?.id || !enabled) return;

    const channel = supabase
      .channel('bot-trades-broadcast')
      .on('broadcast', { event: 'trade_completed' }, (payload) => {
        console.log('[useBotTradingData] Broadcast received:', payload);
        
        const data = payload.payload;
        if (!data) return;

        // If filtering by exchange, check if this trade matches
        if (exchange && data.exchange !== exchange) return;

        // Apply optimistic update
        setMetrics(prev => ({
          ...prev,
          currentPnL: prev.currentPnL + (data.pnl || 0),
          tradesExecuted: prev.tradesExecuted + 1,
          hitRate: data.hitRate || prev.hitRate,
          winsCount: data.pnl > 0 ? prev.winsCount + 1 : prev.winsCount,
          lossesCount: data.pnl <= 0 ? prev.lossesCount + 1 : prev.lossesCount,
        }));

        setLastUpdate(new Date());
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, exchange, enabled]);

  // Force refresh function
  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchTodaysTrades();
  }, [fetchTodaysTrades]);

  return {
    ...metrics,
    isLoading,
    lastUpdate,
    refresh,
  };
}
