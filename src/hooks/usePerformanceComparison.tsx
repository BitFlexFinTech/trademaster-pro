import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, format } from 'date-fns';

export interface PerformanceMetrics {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  avgTradeSize: number;
  avgHoldTime: number;
}

export interface ComparisonPeriod {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
  metrics: PerformanceMetrics;
}

export type ComparisonDimension = 'time' | 'regime' | 'strategy' | 'pair' | 'hour';

interface UsePerformanceComparisonResult {
  periods: ComparisonPeriod[];
  dimension: ComparisonDimension;
  setDimension: (dim: ComparisonDimension) => void;
  addPeriod: (preset: string) => void;
  removePeriod: (id: string) => void;
  loading: boolean;
  deltaAnalysis: DeltaAnalysis | null;
}

interface DeltaAnalysis {
  pnlChange: number;
  pnlChangePercent: number;
  winRateChange: number;
  tradeCountChange: number;
  riskAdjustedChange: number;
  insights: string[];
}

const PERIOD_PRESETS = {
  'this_week': () => ({ start: startOfWeek(new Date()), end: new Date() }),
  'last_week': () => ({ start: startOfWeek(subWeeks(new Date(), 1)), end: endOfWeek(subWeeks(new Date(), 1)) }),
  'this_month': () => ({ start: startOfMonth(new Date()), end: new Date() }),
  'last_month': () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }),
};

export function usePerformanceComparison(): UsePerformanceComparisonResult {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<ComparisonPeriod[]>([]);
  const [dimension, setDimension] = useState<ComparisonDimension>('time');
  const [loading, setLoading] = useState(false);
  const [deltaAnalysis, setDeltaAnalysis] = useState<DeltaAnalysis | null>(null);

  const fetchMetricsForPeriod = useCallback(async (startDate: Date, endDate: Date): Promise<PerformanceMetrics> => {
    if (!user) {
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        avgTradeSize: 0,
        avgHoldTime: 0,
      };
    }

    try {
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (!trades || trades.length === 0) {
        return {
          totalPnL: 0,
          winRate: 0,
          totalTrades: 0,
          bestTrade: 0,
          worstTrade: 0,
          profitFactor: 0,
          avgTradeSize: 0,
          avgHoldTime: 0,
        };
      }

      const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const wins = trades.filter(t => (t.profit_loss || 0) > 0);
      const losses = trades.filter(t => (t.profit_loss || 0) < 0);
      const winRate = (wins.length / trades.length) * 100;
      const bestTrade = Math.max(...trades.map(t => t.profit_loss || 0));
      const worstTrade = Math.min(...trades.map(t => t.profit_loss || 0));
      
      const totalWins = wins.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.profit_loss || 0), 0));
      const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
      
      const avgTradeSize = trades.reduce((sum, t) => sum + t.amount, 0) / trades.length;
      
      // Calculate average hold time
      let totalHoldTime = 0;
      let holdTimeCount = 0;
      trades.forEach(t => {
        if (t.closed_at && t.created_at) {
          totalHoldTime += new Date(t.closed_at).getTime() - new Date(t.created_at).getTime();
          holdTimeCount++;
        }
      });
      const avgHoldTime = holdTimeCount > 0 ? totalHoldTime / holdTimeCount / 1000 : 0; // in seconds

      return {
        totalPnL,
        winRate,
        totalTrades: trades.length,
        bestTrade,
        worstTrade,
        profitFactor,
        avgTradeSize,
        avgHoldTime,
      };
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return {
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        avgTradeSize: 0,
        avgHoldTime: 0,
      };
    }
  }, [user]);

  const addPeriod = useCallback(async (preset: string) => {
    if (periods.length >= 4) return; // Max 4 periods
    
    const presetFn = PERIOD_PRESETS[preset as keyof typeof PERIOD_PRESETS];
    if (!presetFn) return;

    setLoading(true);
    const { start, end } = presetFn();
    const metrics = await fetchMetricsForPeriod(start, end);

    const newPeriod: ComparisonPeriod = {
      id: `period-${Date.now()}`,
      label: preset.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      startDate: start,
      endDate: end,
      metrics,
    };

    setPeriods(prev => [...prev, newPeriod]);
    setLoading(false);
  }, [periods.length, fetchMetricsForPeriod]);

  const removePeriod = useCallback((id: string) => {
    setPeriods(prev => prev.filter(p => p.id !== id));
  }, []);

  // Calculate delta analysis when periods change
  useEffect(() => {
    if (periods.length < 2) {
      setDeltaAnalysis(null);
      return;
    }

    const [first, second] = periods;
    const pnlChange = second.metrics.totalPnL - first.metrics.totalPnL;
    const pnlChangePercent = first.metrics.totalPnL !== 0 
      ? (pnlChange / Math.abs(first.metrics.totalPnL)) * 100 
      : 0;
    const winRateChange = second.metrics.winRate - first.metrics.winRate;
    const tradeCountChange = second.metrics.totalTrades - first.metrics.totalTrades;
    const riskAdjustedChange = second.metrics.profitFactor - first.metrics.profitFactor;

    // Generate insights
    const insights: string[] = [];
    if (pnlChange > 0) {
      insights.push(`P&L improved by $${pnlChange.toFixed(2)} (${pnlChangePercent.toFixed(1)}%)`);
    } else if (pnlChange < 0) {
      insights.push(`P&L decreased by $${Math.abs(pnlChange).toFixed(2)}`);
    }
    if (winRateChange > 5) {
      insights.push(`Win rate improved significantly (+${winRateChange.toFixed(1)}%)`);
    } else if (winRateChange < -5) {
      insights.push(`Win rate dropped by ${Math.abs(winRateChange).toFixed(1)}%`);
    }
    if (tradeCountChange > 0) {
      insights.push(`More active trading (${tradeCountChange} more trades)`);
    }

    setDeltaAnalysis({
      pnlChange,
      pnlChangePercent,
      winRateChange,
      tradeCountChange,
      riskAdjustedChange,
      insights,
    });
  }, [periods]);

  // Initialize with default periods
  useEffect(() => {
    if (user && periods.length === 0) {
      addPeriod('this_week');
      setTimeout(() => addPeriod('last_week'), 100);
    }
  }, [user]);

  return {
    periods,
    dimension,
    setDimension,
    addPeriod,
    removePeriod,
    loading,
    deltaAnalysis,
  };
}