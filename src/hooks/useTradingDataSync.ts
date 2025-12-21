import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GlobalTradingMetrics {
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  winsCount: number;
  lossesCount: number;
  bestTrade: number;
  worstTrade: number;
  avgProfit: number;
  tradesPerMinute: number;
  lastUpdated: Date;
}

interface TradeBroadcastPayload {
  botId?: string;
  botType?: 'spot' | 'leverage';
  pnl?: number;
  totalPnl?: number;
  trades?: number;
  hitRate?: number;
  exchange?: string;
  timestamp?: number;
}

/**
 * Global trading data sync hook
 * Provides real-time synced metrics across ALL BotCards
 * Uses both Postgres real-time AND broadcast channels for instant updates
 */
export function useTradingDataSync(botType?: 'spot' | 'leverage') {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<GlobalTradingMetrics>({
    currentPnL: 0,
    tradesExecuted: 0,
    hitRate: 0,
    winsCount: 0,
    lossesCount: 0,
    bestTrade: 0,
    worstTrade: 0,
    avgProfit: 0,
    tradesPerMinute: 0,
    lastUpdated: new Date(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Fetch today's trades from database - HISTORICAL DATA ON MOUNT
  const fetchHistoricalTrades = useCallback(async () => {
    if (!user?.id) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString())
        .eq('status', 'closed')
        .eq('is_sandbox', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useTradingDataSync] Error fetching trades:', error);
        setIsLoading(false);
        return;
      }

      if (trades && trades.length > 0) {
        // Filter by bot type if specified
        const filteredTrades = botType 
          ? trades.filter(t => {
              const isLeverage = (t.leverage || 1) > 1;
              return botType === 'leverage' ? isLeverage : !isLeverage;
            })
          : trades;

        const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        const wins = filteredTrades.filter(t => (t.profit_loss || 0) > 0);
        const losses = filteredTrades.filter(t => (t.profit_loss || 0) <= 0);
        const profits = filteredTrades.map(t => t.profit_loss || 0);

        // Calculate trades per minute
        const timestamps = filteredTrades.map(t => new Date(t.created_at).getTime());
        const recentTimestamps = timestamps.filter(t => t > Date.now() - 60000);

        setMetrics({
          currentPnL: totalPnL,
          tradesExecuted: filteredTrades.length,
          hitRate: filteredTrades.length > 0 ? (wins.length / filteredTrades.length) * 100 : 0,
          winsCount: wins.length,
          lossesCount: losses.length,
          bestTrade: profits.length > 0 ? Math.max(...profits) : 0,
          worstTrade: profits.length > 0 ? Math.min(...profits) : 0,
          avgProfit: filteredTrades.length > 0 ? totalPnL / filteredTrades.length : 0,
          tradesPerMinute: recentTimestamps.length,
          lastUpdated: new Date(),
        });
      }

      setIsLoading(false);
      fetchedRef.current = true;
    } catch (err) {
      console.error('[useTradingDataSync] Fetch error:', err);
      setIsLoading(false);
    }
  }, [user?.id, botType]);

  // Initial fetch on mount
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchHistoricalTrades();
    }
  }, [fetchHistoricalTrades]);

  // Subscribe to real-time postgres changes for INSERT events
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`global-trading-sync-${botType || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newTrade = payload.new as {
            profit_loss: number | null;
            is_sandbox: boolean;
            leverage: number | null;
            status: string;
          };

          // Skip sandbox trades and open trades
          if (newTrade.is_sandbox || newTrade.status !== 'closed') return;

          // Filter by bot type if specified
          if (botType) {
            const isLeverage = (newTrade.leverage || 1) > 1;
            if (botType === 'leverage' && !isLeverage) return;
            if (botType === 'spot' && isLeverage) return;
          }

          const pnl = newTrade.profit_loss || 0;
          const isWin = pnl > 0;

          setMetrics(prev => {
            const newPnL = prev.currentPnL + pnl;
            const newTrades = prev.tradesExecuted + 1;
            const newWins = prev.winsCount + (isWin ? 1 : 0);
            const newLosses = prev.lossesCount + (isWin ? 0 : 1);

            return {
              ...prev,
              currentPnL: newPnL,
              tradesExecuted: newTrades,
              hitRate: newTrades > 0 ? (newWins / newTrades) * 100 : 0,
              winsCount: newWins,
              lossesCount: newLosses,
              bestTrade: Math.max(prev.bestTrade, pnl),
              worstTrade: Math.min(prev.worstTrade, pnl),
              avgProfit: newTrades > 0 ? newPnL / newTrades : 0,
              lastUpdated: new Date(),
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, botType]);

  // Subscribe to broadcast events for instant cross-component sync
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`global-trades-broadcast-${botType || 'all'}`)
      .on('broadcast', { event: 'trade_completed' }, (payload) => {
        const data = payload.payload as TradeBroadcastPayload;
        if (!data) return;

        // Filter by bot type if specified
        if (botType && data.botType && data.botType !== botType) return;

        const pnl = data.pnl || 0;
        const isWin = pnl > 0;

        setMetrics(prev => ({
          ...prev,
          currentPnL: prev.currentPnL + pnl,
          tradesExecuted: prev.tradesExecuted + 1,
          hitRate: data.hitRate ?? prev.hitRate,
          winsCount: isWin ? prev.winsCount + 1 : prev.winsCount,
          lossesCount: !isWin ? prev.lossesCount + 1 : prev.lossesCount,
          lastUpdated: new Date(),
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, botType]);

  // Force refresh function
  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchedRef.current = false;
    fetchHistoricalTrades();
  }, [fetchHistoricalTrades]);

  // Reset metrics (for daily reset)
  const resetMetrics = useCallback(() => {
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
      lastUpdated: new Date(),
    });
  }, []);

  return {
    metrics,
    isLoading,
    refresh,
    resetMetrics,
  };
}
