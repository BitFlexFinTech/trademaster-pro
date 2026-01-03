import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PhaseMetric {
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  trend: 'improving' | 'stable' | 'degrading';
  sampleCount: number;
}

export interface OptimizationRecommendation {
  id: string;
  phase: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  suggestedAction: string;
  expectedImprovement: string;
}

export interface ExecutionOptimization {
  phaseMetrics: Record<string, PhaseMetric>;
  slowestPhase: string | null;
  fastestExchange: string | null;
  recommendations: OptimizationRecommendation[];
  telemetryRate: number;
  totalAnalyzed: number;
  exchangeComparison: Record<string, { avgMs: number; count: number }>;
  isLoading: boolean;
}

// Target durations for each phase (ms)
const PHASE_TARGETS = {
  pairSelection: 100,
  aiAnalysis: 200,
  orderPreparation: 50,
  orderPlacement: 500,
  confirmation: 100,
};

const PHASE_LABELS: Record<string, string> = {
  pairSelection: 'Pair Selection',
  aiAnalysis: 'AI Analysis',
  orderPreparation: 'Order Preparation',
  orderPlacement: 'Order Placement',
  confirmation: 'Confirmation',
};

export function useExecutionOptimization(): ExecutionOptimization {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchTrades = async () => {
      setIsLoading(true);
      try {
        // Fetch last 100 trades with telemetry
        const { data } = await supabase
          .from('trades')
          .select('id, pair, direction, exchange_name, execution_telemetry, created_at, profit_loss')
          .eq('user_id', user.id)
          .not('execution_telemetry', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100);

        setTrades(data || []);
      } catch (error) {
        console.error('Failed to fetch execution telemetry:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrades();
  }, [user?.id]);

  const result = useMemo(() => {
    if (trades.length === 0) {
      return {
        phaseMetrics: {},
        slowestPhase: null,
        fastestExchange: null,
        recommendations: [],
        telemetryRate: 0,
        totalAnalyzed: 0,
        exchangeComparison: {},
        isLoading,
      };
    }

    // Extract phase durations from telemetry
    const phaseDurations: Record<string, number[]> = {
      pairSelection: [],
      aiAnalysis: [],
      orderPreparation: [],
      orderPlacement: [],
      confirmation: [],
    };

    const exchangeDurations: Record<string, number[]> = {};

    for (const trade of trades) {
      const telemetry = trade.execution_telemetry as any;
      if (!telemetry?.phases) continue;

      const phases = telemetry.phases;
      for (const [key, value] of Object.entries(phases)) {
        if (value && typeof (value as any).durationMs === 'number') {
          phaseDurations[key]?.push((value as any).durationMs);
        }
      }

      // Track by exchange
      const exchange = trade.exchange_name || 'unknown';
      if (!exchangeDurations[exchange]) {
        exchangeDurations[exchange] = [];
      }
      if (telemetry.totalDurationMs) {
        exchangeDurations[exchange].push(telemetry.totalDurationMs);
      }
    }

    // Calculate metrics for each phase
    const phaseMetrics: Record<string, PhaseMetric> = {};
    let slowestPhase: string | null = null;
    let slowestAvg = 0;

    for (const [phase, durations] of Object.entries(phaseDurations)) {
      if (durations.length === 0) continue;

      const sorted = [...durations].sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Index] || sorted[sorted.length - 1];

      // Calculate trend by comparing first half vs second half
      const halfIndex = Math.floor(durations.length / 2);
      const firstHalf = durations.slice(halfIndex);
      const secondHalf = durations.slice(0, halfIndex);
      
      let trend: 'improving' | 'stable' | 'degrading' = 'stable';
      if (firstHalf.length >= 3 && secondHalf.length >= 3) {
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const change = (secondAvg - firstAvg) / firstAvg;
        
        if (change < -0.15) trend = 'improving';
        else if (change > 0.15) trend = 'degrading';
      }

      phaseMetrics[phase] = {
        avgMs: avg,
        p95Ms: p95,
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
        trend,
        sampleCount: durations.length,
      };

      // Track slowest phase relative to target
      const target = PHASE_TARGETS[phase as keyof typeof PHASE_TARGETS] || 100;
      const relativeSlowness = avg / target;
      if (relativeSlowness > slowestAvg) {
        slowestAvg = relativeSlowness;
        slowestPhase = phase;
      }
    }

    // Calculate exchange comparison
    const exchangeComparison: Record<string, { avgMs: number; count: number }> = {};
    let fastestExchange: string | null = null;
    let fastestAvg = Infinity;

    for (const [exchange, durations] of Object.entries(exchangeDurations)) {
      if (durations.length === 0) continue;
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      exchangeComparison[exchange] = { avgMs: avg, count: durations.length };
      
      if (avg < fastestAvg) {
        fastestAvg = avg;
        fastestExchange = exchange;
      }
    }

    // Generate recommendations
    const recommendations: OptimizationRecommendation[] = [];

    for (const [phase, metrics] of Object.entries(phaseMetrics)) {
      const target = PHASE_TARGETS[phase as keyof typeof PHASE_TARGETS] || 100;
      const label = PHASE_LABELS[phase] || phase;

      if (metrics.avgMs > target * 3) {
        recommendations.push({
          id: `${phase}-critical`,
          phase,
          severity: 'critical',
          title: `${label} is critically slow`,
          description: `Average ${metrics.avgMs.toFixed(0)}ms (target: ${target}ms). This is ${(metrics.avgMs / target).toFixed(1)}x slower than target.`,
          suggestedAction: getActionForPhase(phase, 'critical'),
          expectedImprovement: `Could save ${(metrics.avgMs - target).toFixed(0)}ms per trade`,
        });
      } else if (metrics.avgMs > target * 1.5) {
        recommendations.push({
          id: `${phase}-warning`,
          phase,
          severity: 'warning',
          title: `${label} could be faster`,
          description: `Average ${metrics.avgMs.toFixed(0)}ms (target: ${target}ms).`,
          suggestedAction: getActionForPhase(phase, 'warning'),
          expectedImprovement: `Could save ${(metrics.avgMs - target).toFixed(0)}ms per trade`,
        });
      }

      if (metrics.trend === 'degrading') {
        recommendations.push({
          id: `${phase}-degrading`,
          phase,
          severity: 'warning',
          title: `${label} is getting slower`,
          description: `Performance has degraded over recent trades.`,
          suggestedAction: 'Review recent changes that may have impacted this phase.',
          expectedImprovement: 'Restore previous performance levels',
        });
      }
    }

    // Sort by severity
    recommendations.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    return {
      phaseMetrics,
      slowestPhase,
      fastestExchange,
      recommendations,
      telemetryRate: (trades.length / 100) * 100,
      totalAnalyzed: trades.length,
      exchangeComparison,
      isLoading,
    };
  }, [trades, isLoading]);

  return result;
}

function getActionForPhase(phase: string, severity: 'critical' | 'warning'): string {
  const actions: Record<string, Record<string, string>> = {
    pairSelection: {
      critical: 'Reduce watched pairs or enable WebSocket price streaming for faster scanning.',
      warning: 'Consider caching pair analysis results between cycles.',
    },
    aiAnalysis: {
      critical: 'MTF analysis is too slow. Consider reducing timeframes or caching momentum data.',
      warning: 'Pre-compute momentum indicators to reduce analysis time.',
    },
    orderPreparation: {
      critical: 'Lot size and quantity calculation is slow. Cache exchange info.',
      warning: 'Pre-fetch lot size filters at bot startup.',
    },
    orderPlacement: {
      critical: 'Exchange API latency is high. Check network connection or try a different exchange.',
      warning: 'Consider using a co-located server or exchange with lower latency.',
    },
    confirmation: {
      critical: 'Database writes are slow. Check Supabase connection or reduce payload size.',
      warning: 'Consider async confirmation for non-critical data.',
    },
  };

  return actions[phase]?.[severity] || 'Investigate and optimize this phase.';
}
