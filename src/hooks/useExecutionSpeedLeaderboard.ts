import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SpeedRanking {
  name: string;
  avgMs: number;
  tradeCount: number;
  trend: 'faster' | 'stable' | 'slower';
  rank: number;
  minMs: number;
  maxMs: number;
}

interface SpeedLeaderboardData {
  pairRankings: SpeedRanking[];
  exchangeRankings: SpeedRanking[];
  fastestPair: { pair: string; avgMs: number } | null;
  slowestPair: { pair: string; avgMs: number } | null;
  fastestExchange: { exchange: string; avgMs: number } | null;
  isLoading: boolean;
  totalTrades: number;
  avgOverallMs: number;
}

export function useExecutionSpeedLeaderboard(): SpeedLeaderboardData {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchTrades = async () => {
      setIsLoading(true);
      
      // Fetch all trades with telemetry
      const { data: allTrades, error } = await supabase
        .from('trades')
        .select('pair, exchange_name, execution_telemetry, created_at')
        .eq('user_id', user.id)
        .not('execution_telemetry', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!error && allTrades) {
        setTrades(allTrades);
        
        // Get recent trades (last 24h) for trend calculation
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        setRecentTrades(allTrades.filter(t => t.created_at > dayAgo));
      }
      
      setIsLoading(false);
    };

    fetchTrades();
  }, [user]);

  const data = useMemo(() => {
    if (trades.length === 0) {
      return {
        pairRankings: [],
        exchangeRankings: [],
        fastestPair: null,
        slowestPair: null,
        fastestExchange: null,
        totalTrades: 0,
        avgOverallMs: 0,
      };
    }

    // Calculate total duration from telemetry
    const getTotalDuration = (telemetry: any): number => {
      if (!telemetry || !telemetry.phaseMetrics) return 0;
      const phases = telemetry.phaseMetrics;
      let total = 0;
      for (const phase of Object.values(phases) as any[]) {
        total += phase?.durationMs || 0;
      }
      return total;
    };

    // Group by pair
    const pairMap = new Map<string, { durations: number[]; recent: number[] }>();
    trades.forEach(trade => {
      const pair = trade.pair || 'Unknown';
      const duration = getTotalDuration(trade.execution_telemetry);
      if (duration > 0) {
        if (!pairMap.has(pair)) {
          pairMap.set(pair, { durations: [], recent: [] });
        }
        pairMap.get(pair)!.durations.push(duration);
      }
    });

    // Add recent data for trends
    recentTrades.forEach(trade => {
      const pair = trade.pair || 'Unknown';
      const duration = getTotalDuration(trade.execution_telemetry);
      if (duration > 0 && pairMap.has(pair)) {
        pairMap.get(pair)!.recent.push(duration);
      }
    });

    // Group by exchange
    const exchangeMap = new Map<string, { durations: number[]; recent: number[] }>();
    trades.forEach(trade => {
      const exchange = trade.exchange_name || 'Unknown';
      const duration = getTotalDuration(trade.execution_telemetry);
      if (duration > 0) {
        if (!exchangeMap.has(exchange)) {
          exchangeMap.set(exchange, { durations: [], recent: [] });
        }
        exchangeMap.get(exchange)!.durations.push(duration);
      }
    });

    // Add recent data for exchange trends
    recentTrades.forEach(trade => {
      const exchange = trade.exchange_name || 'Unknown';
      const duration = getTotalDuration(trade.execution_telemetry);
      if (duration > 0 && exchangeMap.has(exchange)) {
        exchangeMap.get(exchange)!.recent.push(duration);
      }
    });

    // Calculate trend
    const calculateTrend = (all: number[], recent: number[]): 'faster' | 'stable' | 'slower' => {
      if (recent.length < 3 || all.length < 5) return 'stable';
      const allAvg = all.reduce((a, b) => a + b, 0) / all.length;
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const diff = (recentAvg - allAvg) / allAvg;
      if (diff < -0.1) return 'faster';
      if (diff > 0.1) return 'slower';
      return 'stable';
    };

    // Build pair rankings
    const pairRankings: SpeedRanking[] = Array.from(pairMap.entries())
      .map(([name, data]) => ({
        name,
        avgMs: Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length),
        tradeCount: data.durations.length,
        trend: calculateTrend(data.durations, data.recent),
        rank: 0,
        minMs: Math.min(...data.durations),
        maxMs: Math.max(...data.durations),
      }))
      .sort((a, b) => a.avgMs - b.avgMs)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    // Build exchange rankings
    const exchangeRankings: SpeedRanking[] = Array.from(exchangeMap.entries())
      .map(([name, data]) => ({
        name,
        avgMs: Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length),
        tradeCount: data.durations.length,
        trend: calculateTrend(data.durations, data.recent),
        rank: 0,
        minMs: Math.min(...data.durations),
        maxMs: Math.max(...data.durations),
      }))
      .sort((a, b) => a.avgMs - b.avgMs)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    // Calculate overall stats
    const allDurations = trades
      .map(t => getTotalDuration(t.execution_telemetry))
      .filter(d => d > 0);
    const avgOverallMs = allDurations.length > 0 
      ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
      : 0;

    return {
      pairRankings,
      exchangeRankings,
      fastestPair: pairRankings.length > 0 
        ? { pair: pairRankings[0].name, avgMs: pairRankings[0].avgMs }
        : null,
      slowestPair: pairRankings.length > 0 
        ? { pair: pairRankings[pairRankings.length - 1].name, avgMs: pairRankings[pairRankings.length - 1].avgMs }
        : null,
      fastestExchange: exchangeRankings.length > 0
        ? { exchange: exchangeRankings[0].name, avgMs: exchangeRankings[0].avgMs }
        : null,
      totalTrades: trades.length,
      avgOverallMs,
    };
  }, [trades, recentTrades]);

  return {
    ...data,
    isLoading,
  };
}
