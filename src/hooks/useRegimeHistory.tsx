import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface RegimeHistoryEntry {
  id: string;
  symbol: string;
  regime: 'BULL' | 'BEAR' | 'CHOP';
  ema200: number;
  price: number;
  deviation: number;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  trades_during_regime: number;
  pnl_during_regime: number;
  created_at: string;
}

export interface RegimeStats {
  totalBullMinutes: number;
  totalBearMinutes: number;
  totalChopMinutes: number;
  bullPnL: number;
  bearPnL: number;
  chopPnL: number;
  bullTrades: number;
  bearTrades: number;
  chopTrades: number;
  avgBullDuration: number;
  avgBearDuration: number;
  avgChopDuration: number;
  transitionsCount: number;
  mostRecentRegime: 'BULL' | 'BEAR' | 'CHOP' | null;
}

interface UseRegimeHistoryReturn {
  history: RegimeHistoryEntry[];
  stats: RegimeStats;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRegimeHistory(
  symbol: string = 'BTCUSDT',
  timeframeDays: number = 30
): UseRegimeHistoryReturn {
  const { user } = useAuth();
  const [history, setHistory] = useState<RegimeHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - timeframeDays);

      const { data, error: fetchError } = await supabase
        .from('regime_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('symbol', symbol)
        .gte('created_at', startDate.toISOString())
        .order('started_at', { ascending: false });

      if (fetchError) throw fetchError;

      setHistory((data || []) as RegimeHistoryEntry[]);
    } catch (err) {
      console.error('[useRegimeHistory] Error fetching:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch regime history');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, symbol, timeframeDays]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('regime-history-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'regime_history',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchHistory]);

  const stats = useMemo<RegimeStats>(() => {
    if (history.length === 0) {
      return {
        totalBullMinutes: 0,
        totalBearMinutes: 0,
        totalChopMinutes: 0,
        bullPnL: 0,
        bearPnL: 0,
        chopPnL: 0,
        bullTrades: 0,
        bearTrades: 0,
        chopTrades: 0,
        avgBullDuration: 0,
        avgBearDuration: 0,
        avgChopDuration: 0,
        transitionsCount: history.length,
        mostRecentRegime: null,
      };
    }

    const bullEntries = history.filter(h => h.regime === 'BULL');
    const bearEntries = history.filter(h => h.regime === 'BEAR');
    const chopEntries = history.filter(h => h.regime === 'CHOP');

    const sumDuration = (entries: RegimeHistoryEntry[]) =>
      entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

    const sumPnL = (entries: RegimeHistoryEntry[]) =>
      entries.reduce((sum, e) => sum + (e.pnl_during_regime || 0), 0);

    const sumTrades = (entries: RegimeHistoryEntry[]) =>
      entries.reduce((sum, e) => sum + (e.trades_during_regime || 0), 0);

    const totalBullMinutes = sumDuration(bullEntries);
    const totalBearMinutes = sumDuration(bearEntries);
    const totalChopMinutes = sumDuration(chopEntries);

    return {
      totalBullMinutes,
      totalBearMinutes,
      totalChopMinutes,
      bullPnL: sumPnL(bullEntries),
      bearPnL: sumPnL(bearEntries),
      chopPnL: sumPnL(chopEntries),
      bullTrades: sumTrades(bullEntries),
      bearTrades: sumTrades(bearEntries),
      chopTrades: sumTrades(chopEntries),
      avgBullDuration: bullEntries.length > 0 ? totalBullMinutes / bullEntries.length : 0,
      avgBearDuration: bearEntries.length > 0 ? totalBearMinutes / bearEntries.length : 0,
      avgChopDuration: chopEntries.length > 0 ? totalChopMinutes / chopEntries.length : 0,
      transitionsCount: history.length,
      mostRecentRegime: history[0]?.regime || null,
    };
  }, [history]);

  return {
    history,
    stats,
    isLoading,
    error,
    refetch: fetchHistory,
  };
}
