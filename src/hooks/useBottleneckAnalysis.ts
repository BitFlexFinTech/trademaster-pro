import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface ApiCallMetric {
  endpoint: string;
  method: string;
  durationMs: number;
  cached: boolean;
  status: 'success' | 'error';
}

interface PhaseMetric {
  startMs: number;
  durationMs: number;
  details: string;
  apiCalls?: ApiCallMetric[];
}

interface TelemetryData {
  tradeId: string;
  pair: string;
  direction: string;
  exchange: string;
  phases: {
    pairSelection?: PhaseMetric;
    aiAnalysis?: PhaseMetric;
    orderPreparation?: PhaseMetric;
    orderPlacement?: PhaseMetric;
    confirmation?: PhaseMetric;
  };
  totalDurationMs: number;
  success: boolean;
  timestamp: string;
  apiCalls?: ApiCallMetric[];
  cacheStats?: {
    hits: number;
    misses: number;
  };
}

interface BottleneckSummary {
  endpoint: string;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  callCount: number;
  errorRate: number;
  cacheHitRate: number;
}

interface PhaseBreakdown {
  phase: string;
  avgDuration: number;
  maxDuration: number;
  frequency: number;
  percentOfTotal: number;
}

export function useBottleneckAnalysis(daysBack: number = 7) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch trades with telemetry
  useEffect(() => {
    if (!user) return;

    const fetchTrades = async () => {
      setLoading(true);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const { data, error } = await supabase
        .from('trades')
        .select('id, pair, direction, exchange_name, execution_telemetry, created_at')
        .eq('user_id', user.id)
        .not('execution_telemetry', 'is', null)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (!error && data) {
        setTrades(data);
      }
      setLoading(false);
    };

    fetchTrades();
  }, [user, daysBack]);

  // Analyze telemetry data
  const analysis = useMemo(() => {
    if (trades.length === 0) {
      return {
        phaseBreakdown: [],
        apiBottlenecks: [],
        cacheStats: { totalHits: 0, totalMisses: 0, hitRate: 0 },
        avgTotalDuration: 0,
        slowestTrades: [],
        recommendations: [],
      };
    }

    const phaseData: Record<string, number[]> = {
      pairSelection: [],
      aiAnalysis: [],
      orderPreparation: [],
      orderPlacement: [],
      confirmation: [],
    };

    const apiCallData: Record<string, { durations: number[]; errors: number; cached: number }> = {};
    let totalHits = 0;
    let totalMisses = 0;
    const totalDurations: number[] = [];

    for (const trade of trades) {
      const telemetry = trade.execution_telemetry as TelemetryData | null;
      if (!telemetry) continue;

      // Track total duration
      if (telemetry.totalDurationMs) {
        totalDurations.push(telemetry.totalDurationMs);
      }

      // Track phase durations
      if (telemetry.phases) {
        for (const [phase, metrics] of Object.entries(telemetry.phases)) {
          if (metrics?.durationMs && phaseData[phase]) {
            phaseData[phase].push(metrics.durationMs);
          }
        }
      }

      // Track API calls
      if (telemetry.apiCalls) {
        for (const call of telemetry.apiCalls) {
          if (!apiCallData[call.endpoint]) {
            apiCallData[call.endpoint] = { durations: [], errors: 0, cached: 0 };
          }
          apiCallData[call.endpoint].durations.push(call.durationMs);
          if (call.status === 'error') apiCallData[call.endpoint].errors++;
          if (call.cached) apiCallData[call.endpoint].cached++;
        }
      }

      // Track cache stats
      if (telemetry.cacheStats) {
        totalHits += telemetry.cacheStats.hits;
        totalMisses += telemetry.cacheStats.misses;
      }
    }

    // Calculate phase breakdown
    const totalAvg = totalDurations.length > 0
      ? totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length
      : 0;

    const phaseBreakdown: PhaseBreakdown[] = Object.entries(phaseData)
      .filter(([_, durations]) => durations.length > 0)
      .map(([phase, durations]) => {
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        return {
          phase,
          avgDuration: Math.round(avg),
          maxDuration: Math.max(...durations),
          frequency: durations.length,
          percentOfTotal: totalAvg > 0 ? (avg / totalAvg) * 100 : 0,
        };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration);

    // Calculate API bottlenecks
    const apiBottlenecks: BottleneckSummary[] = Object.entries(apiCallData)
      .map(([endpoint, data]) => {
        const avg = data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0;
        return {
          endpoint,
          avgDuration: Math.round(avg),
          maxDuration: data.durations.length > 0 ? Math.max(...data.durations) : 0,
          minDuration: data.durations.length > 0 ? Math.min(...data.durations) : 0,
          callCount: data.durations.length,
          errorRate: data.durations.length > 0 ? (data.errors / data.durations.length) * 100 : 0,
          cacheHitRate: data.durations.length > 0 ? (data.cached / data.durations.length) * 100 : 0,
        };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration);

    // Find slowest trades
    const slowestTrades = [...trades]
      .filter(t => t.execution_telemetry?.totalDurationMs)
      .sort((a, b) => b.execution_telemetry.totalDurationMs - a.execution_telemetry.totalDurationMs)
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        pair: t.pair,
        exchange: t.exchange_name,
        duration: t.execution_telemetry.totalDurationMs,
        createdAt: t.created_at,
      }));

    // Generate recommendations
    const recommendations: string[] = [];

    // Check for slow phases
    const slowPhases = phaseBreakdown.filter(p => p.avgDuration > 500);
    for (const phase of slowPhases) {
      if (phase.phase === 'orderPreparation') {
        recommendations.push(`Order preparation averages ${phase.avgDuration}ms. Enable lot size caching to reduce this.`);
      } else if (phase.phase === 'aiAnalysis') {
        recommendations.push(`AI analysis averages ${phase.avgDuration}ms. Consider caching MTF results for 5 seconds.`);
      } else if (phase.phase === 'orderPlacement') {
        recommendations.push(`Order placement averages ${phase.avgDuration}ms. This depends on exchange response time.`);
      }
    }

    // Check cache effectiveness
    const cacheHitRate = totalHits + totalMisses > 0
      ? (totalHits / (totalHits + totalMisses)) * 100
      : 0;

    if (cacheHitRate < 50 && totalHits + totalMisses > 10) {
      recommendations.push(`Cache hit rate is only ${cacheHitRate.toFixed(0)}%. Consider increasing cache TTL.`);
    }

    // Check for high error rate APIs
    const highErrorApis = apiBottlenecks.filter(a => a.errorRate > 10);
    for (const api of highErrorApis) {
      recommendations.push(`${api.endpoint} has ${api.errorRate.toFixed(0)}% error rate. Check API limits.`);
    }

    return {
      phaseBreakdown,
      apiBottlenecks,
      cacheStats: {
        totalHits,
        totalMisses,
        hitRate: cacheHitRate,
      },
      avgTotalDuration: Math.round(totalAvg),
      slowestTrades,
      recommendations,
    };
  }, [trades]);

  return {
    ...analysis,
    loading,
    tradeCount: trades.length,
  };
}
