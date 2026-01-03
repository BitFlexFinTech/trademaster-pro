import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TelemetryTimePoint {
  timestamp: Date;
  avgTotal: number;
  phases: {
    pairSelection: number;
    aiAnalysis: number;
    orderPreparation: number;
    orderPlacement: number;
    confirmation: number;
  };
  tradeCount: number;
  successRate: number;
}

export interface TelemetryAnomaly {
  timestamp: Date;
  durationMs: number;
  reason: string;
  tradeId: string;
}

export interface TelemetryHistoryData {
  timeSeries: TelemetryTimePoint[];
  exchangeComparison: Record<string, { avgTotal: number; count: number; successRate: number }>;
  pairComparison: Record<string, { avgTotal: number; count: number }>;
  anomalies: TelemetryAnomaly[];
  overallStats: {
    avgTotal: number;
    p95Total: number;
    minTotal: number;
    maxTotal: number;
    totalTrades: number;
    tradesWithTelemetry: number;
  };
  isLoading: boolean;
}

type DateRange = '1d' | '7d' | '30d' | '90d';

export function useTelemetryHistory(dateRange: DateRange = '7d'): TelemetryHistoryData {
  const { user } = useAuth();
  const [trades, setTrades] = useState<any[]>([]);
  const [allTradesCount, setAllTradesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const fetchTrades = async () => {
      setIsLoading(true);
      try {
        const days = dateRange === '1d' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get all trades count
        const { count } = await supabase
          .from('trades')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', startDate.toISOString());

        setAllTradesCount(count || 0);

        // Fetch trades with telemetry
        const { data } = await supabase
          .from('trades')
          .select('id, pair, direction, exchange_name, execution_telemetry, created_at, profit_loss, status')
          .eq('user_id', user.id)
          .not('execution_telemetry', 'is', null)
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: true });

        setTrades(data || []);
      } catch (error) {
        console.error('Failed to fetch telemetry history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrades();
  }, [user?.id, dateRange]);

  const result = useMemo(() => {
    if (trades.length === 0) {
      return {
        timeSeries: [],
        exchangeComparison: {},
        pairComparison: {},
        anomalies: [],
        overallStats: {
          avgTotal: 0,
          p95Total: 0,
          minTotal: 0,
          maxTotal: 0,
          totalTrades: allTradesCount,
          tradesWithTelemetry: 0,
        },
        isLoading,
      };
    }

    // Group trades by hour for time series
    const hourlyGroups: Record<string, any[]> = {};
    const allDurations: number[] = [];
    const exchangeData: Record<string, { durations: number[]; wins: number; total: number }> = {};
    const pairData: Record<string, { durations: number[] }> = {};
    const anomalies: TelemetryAnomaly[] = [];

    for (const trade of trades) {
      const telemetry = trade.execution_telemetry as any;
      if (!telemetry?.totalDurationMs) continue;

      const totalMs = telemetry.totalDurationMs;
      allDurations.push(totalMs);

      // Group by hour
      const date = new Date(trade.created_at);
      const hourKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
      if (!hourlyGroups[hourKey]) hourlyGroups[hourKey] = [];
      hourlyGroups[hourKey].push({ trade, telemetry });

      // Track by exchange
      const exchange = trade.exchange_name || 'unknown';
      if (!exchangeData[exchange]) {
        exchangeData[exchange] = { durations: [], wins: 0, total: 0 };
      }
      exchangeData[exchange].durations.push(totalMs);
      exchangeData[exchange].total++;
      if ((trade.profit_loss || 0) > 0) exchangeData[exchange].wins++;

      // Track by pair
      const pair = trade.pair || 'unknown';
      if (!pairData[pair]) pairData[pair] = { durations: [] };
      pairData[pair].durations.push(totalMs);

      // Detect anomalies (>2x average of surrounding trades)
      if (totalMs > 2000) {
        anomalies.push({
          timestamp: date,
          durationMs: totalMs,
          reason: totalMs > 5000 ? 'Extremely slow execution' : 'Slow execution',
          tradeId: trade.id,
        });
      }
    }

    // Build time series
    const timeSeries: TelemetryTimePoint[] = [];
    for (const [hourKey, group] of Object.entries(hourlyGroups)) {
      const phaseAvgs = {
        pairSelection: 0,
        aiAnalysis: 0,
        orderPreparation: 0,
        orderPlacement: 0,
        confirmation: 0,
      };

      let phaseCounts = { ...phaseAvgs };
      let totalSum = 0;
      let successCount = 0;

      for (const { trade, telemetry } of group) {
        totalSum += telemetry.totalDurationMs || 0;
        if ((trade.profit_loss || 0) > 0) successCount++;

        const phases = telemetry.phases || {};
        for (const [key, value] of Object.entries(phases)) {
          if (value && typeof (value as any).durationMs === 'number' && key in phaseAvgs) {
            (phaseAvgs as any)[key] += (value as any).durationMs;
            (phaseCounts as any)[key]++;
          }
        }
      }

      // Calculate averages
      for (const key of Object.keys(phaseAvgs)) {
        const count = (phaseCounts as any)[key];
        if (count > 0) {
          (phaseAvgs as any)[key] = (phaseAvgs as any)[key] / count;
        }
      }

      timeSeries.push({
        timestamp: new Date(hourKey),
        avgTotal: totalSum / group.length,
        phases: phaseAvgs,
        tradeCount: group.length,
        successRate: (successCount / group.length) * 100,
      });
    }

    // Calculate exchange comparison
    const exchangeComparison: Record<string, { avgTotal: number; count: number; successRate: number }> = {};
    for (const [exchange, data] of Object.entries(exchangeData)) {
      const avg = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      exchangeComparison[exchange] = {
        avgTotal: avg,
        count: data.total,
        successRate: (data.wins / data.total) * 100,
      };
    }

    // Calculate pair comparison
    const pairComparison: Record<string, { avgTotal: number; count: number }> = {};
    for (const [pair, data] of Object.entries(pairData)) {
      const avg = data.durations.reduce((a, b) => a + b, 0) / data.durations.length;
      pairComparison[pair] = { avgTotal: avg, count: data.durations.length };
    }

    // Calculate overall stats
    const sorted = [...allDurations].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      timeSeries: timeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
      exchangeComparison,
      pairComparison,
      anomalies: anomalies.slice(-10), // Last 10 anomalies
      overallStats: {
        avgTotal: allDurations.reduce((a, b) => a + b, 0) / allDurations.length,
        p95Total: sorted[p95Index] || 0,
        minTotal: sorted[0] || 0,
        maxTotal: sorted[sorted.length - 1] || 0,
        totalTrades: allTradesCount,
        tradesWithTelemetry: trades.length,
      },
      isLoading,
    };
  }, [trades, allTradesCount, isLoading]);

  return result;
}
