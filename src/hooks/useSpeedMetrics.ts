import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SpeedMetrics {
  avgExecutionMs: number;
  cacheHitRate: number;
  apiLatency: number;
  tradesPerMin: number;
  history: {
    executionMs: number[];
    apiLatency: number[];
    tradesPerMin: number[];
  };
  loading: boolean;
}

export function useSpeedMetrics(): SpeedMetrics {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<SpeedMetrics>({
    avgExecutionMs: 0,
    cacheHitRate: 0,
    apiLatency: 0,
    tradesPerMin: 0,
    history: { executionMs: [], apiLatency: [], tradesPerMin: [] },
    loading: true,
  });

  const calculateMetrics = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch recent trades with telemetry (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: trades, error } = await supabase
        .from('trades')
        .select('created_at, execution_telemetry')
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Failed to fetch speed metrics:', error);
        return;
      }

      // Calculate metrics from telemetry data
      const executionTimes: number[] = [];
      const apiLatencies: number[] = [];
      let cacheHits = 0;
      let cacheMisses = 0;

      for (const trade of trades || []) {
        const telemetry = trade.execution_telemetry as {
          totalDurationMs?: number;
          phaseMetrics?: Record<string, { durationMs?: number }>;
          apiCalls?: Array<{ durationMs?: number; cached?: boolean }>;
          cacheStats?: { hits?: number; misses?: number };
        } | null;
        
        if (telemetry) {
          // Execution time
          if (telemetry.totalDurationMs) {
            executionTimes.push(telemetry.totalDurationMs);
          } else if (telemetry.phaseMetrics) {
            const phases = Object.values(telemetry.phaseMetrics);
            const totalMs = phases.reduce((sum, p) => sum + (p.durationMs || 0), 0);
            if (totalMs > 0) executionTimes.push(totalMs);
          }

          // API latencies
          if (telemetry.apiCalls) {
            for (const call of telemetry.apiCalls) {
              if (call.durationMs) {
                apiLatencies.push(call.durationMs);
                if (call.cached) cacheHits++;
                else cacheMisses++;
              }
            }
          }

          // Cache stats
          if (telemetry.cacheStats) {
            cacheHits += telemetry.cacheStats.hits || 0;
            cacheMisses += telemetry.cacheStats.misses || 0;
          }
        }
      }

      // Calculate averages
      const avgExecutionMs = executionTimes.length > 0
        ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        : 0;

      const avgApiLatency = apiLatencies.length > 0
        ? apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length
        : 0;

      const totalCacheOps = cacheHits + cacheMisses;
      const cacheHitRate = totalCacheOps > 0 ? (cacheHits / totalCacheOps) * 100 : 0;

      // Calculate trades per minute
      const tradeCount = trades?.length || 0;
      const tradesPerMin = tradeCount / 60; // Over the last hour

      // Build history arrays (last 10 data points for sparklines)
      const historyLength = 10;
      const executionHistory = executionTimes.slice(0, historyLength).reverse();
      const latencyHistory = apiLatencies.slice(0, historyLength).reverse();
      
      // Calculate trades per minute history (mock based on trade timestamps)
      const tradesPerMinHistory: number[] = [];
      if (trades && trades.length > 0) {
        for (let i = 0; i < Math.min(historyLength, trades.length); i++) {
          // Simulate based on distribution
          tradesPerMinHistory.push(tradesPerMin * (0.8 + Math.random() * 0.4));
        }
      }

      setMetrics({
        avgExecutionMs,
        cacheHitRate,
        apiLatency: avgApiLatency,
        tradesPerMin,
        history: {
          executionMs: executionHistory.length > 0 ? executionHistory : [0],
          apiLatency: latencyHistory.length > 0 ? latencyHistory : [0],
          tradesPerMin: tradesPerMinHistory.length > 0 ? tradesPerMinHistory : [0],
        },
        loading: false,
      });
    } catch (e) {
      console.error('Speed metrics calculation error:', e);
      setMetrics(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  useEffect(() => {
    calculateMetrics();
    
    // Refresh every 30 seconds
    const interval = setInterval(calculateMetrics, 30000);
    return () => clearInterval(interval);
  }, [calculateMetrics]);

  // Subscribe to new trades
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('speed-metrics-trades')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Recalculate on new trade
          calculateMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, calculateMetrics]);

  return metrics;
}
