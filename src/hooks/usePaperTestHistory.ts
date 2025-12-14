import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { PaperTestResult, ThresholdConfig } from '@/lib/sandbox/types';

interface PaperTestRun {
  id: string;
  created_at: string;
  num_trades: number;
  target_hit_rate: number;
  min_signal_score: number;
  min_confluence: number;
  min_volume_ratio: number;
  passed: boolean;
  hit_rate: number;
  total_trades: number;
  wins: number;
  losses: number;
  trades_skipped: number;
  total_pnl: number;
  avg_signal_score: number | null;
  avg_confluence: number | null;
  failed_trades_breakdown: any;
  ai_analysis: any;
}

export function usePaperTestHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<PaperTestRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('paper_test_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to fetch paper test history:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const saveTestResult = async (
    result: PaperTestResult,
    thresholds: ThresholdConfig,
    numTrades: number
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      const insertData = {
        user_id: user.id,
        num_trades: numTrades,
        target_hit_rate: thresholds.targetHitRate,
        min_signal_score: thresholds.minSignalScore,
        min_confluence: thresholds.minConfluence,
        min_volume_ratio: thresholds.minVolumeRatio,
        passed: result.passed,
        hit_rate: result.hitRate,
        total_trades: result.totalTrades,
        wins: result.wins,
        losses: result.losses,
        trades_skipped: result.tradesSkipped,
        total_pnl: result.totalPnL,
        avg_signal_score: result.avgSignalScore,
        avg_confluence: result.avgConfluence,
        failed_trades_breakdown: result.failedTradesBreakdown as unknown,
      };
      
      const { data, error } = await supabase
        .from('paper_test_runs')
        .insert(insertData as any)
        .select('id')
        .single();

      if (error) throw error;
      
      await fetchHistory();
      return data.id;
    } catch (err) {
      console.error('Failed to save paper test result:', err);
      return null;
    }
  };

  const updateAIAnalysis = async (testId: string, analysis: any): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('paper_test_runs')
        .update({ ai_analysis: analysis })
        .eq('id', testId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      await fetchHistory();
      return true;
    } catch (err) {
      console.error('Failed to update AI analysis:', err);
      return false;
    }
  };

  const getImprovementTrend = (): 'improving' | 'declining' | 'stable' => {
    if (history.length < 3) return 'stable';
    
    const recent = history.slice(0, 5);
    const older = history.slice(5, 10);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, r) => sum + r.hit_rate, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r.hit_rate, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    if (diff > 2) return 'improving';
    if (diff < -2) return 'declining';
    return 'stable';
  };

  const getBestRun = (): PaperTestRun | null => {
    if (history.length === 0) return null;
    return history.reduce((best, run) => run.hit_rate > best.hit_rate ? run : best);
  };

  return {
    history,
    loading,
    refetch: fetchHistory,
    saveTestResult,
    updateAIAnalysis,
    getImprovementTrend,
    getBestRun,
    hasHistory: history.length > 0,
  };
}
