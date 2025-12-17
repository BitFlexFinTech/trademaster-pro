import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface BacktestRun {
  id: string;
  asset: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
  finalBalance: number | null;
  totalPnl: number | null;
  totalTrades: number;
  winRate: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: any;
  createdAt: string;
}

interface MonthlyBreakdown {
  period: string;
  pnl: number;
  trades: number;
  winRate: number;
}

export function useBacktest() {
  const { user } = useAuth();
  const [backtests, setBacktests] = useState<BacktestRun[]>([]);
  const [currentBacktest, setCurrentBacktest] = useState<BacktestRun | null>(null);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchBacktests = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('backtest_runs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped: BacktestRun[] = (data || []).map(b => ({
        id: b.id,
        asset: b.asset,
        startDate: b.start_date,
        endDate: b.end_date,
        initialBalance: b.initial_balance || 10000,
        finalBalance: b.final_balance,
        totalPnl: b.total_pnl,
        totalTrades: b.total_trades || 0,
        winRate: b.win_rate,
        maxDrawdown: b.max_drawdown,
        sharpeRatio: b.sharpe_ratio,
        status: b.status as BacktestRun['status'],
        results: b.results,
        createdAt: b.created_at || '',
      }));

      setBacktests(mapped);
      
      // Set most recent completed as current
      const completed = mapped.find(b => b.status === 'completed');
      if (completed) {
        setCurrentBacktest(completed);
        if (completed.results?.monthlyBreakdown) {
          setMonthlyBreakdown(completed.results.monthlyBreakdown);
        }
      }
    } catch (error) {
      console.error('Error fetching backtests:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const runBacktest = async (asset: string, startDate: string, endDate: string, initialBalance: number) => {
    if (!user) {
      toast.error('Please login to run backtests');
      return null;
    }

    setRunning(true);

    try {
      // Create pending backtest record
      const { data: backtest, error: insertError } = await supabase
        .from('backtest_runs')
        .insert({
          user_id: user.id,
          asset,
          start_date: startDate,
          end_date: endDate,
          initial_balance: initialBalance,
          status: 'running',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call real backtesting edge function with historical data
      const { data: results, error: backtestError } = await supabase.functions.invoke('run-backtest', {
        body: {
          asset,
          startDate,
          endDate,
          initialBalance,
          strategy: 'mean_reversion',
          positionSizePercent: 5,
          takeProfitPercent: 0.5,
          stopLossPercent: 0.3,
        }
      });

      if (backtestError) {
        // Update status to failed
        await supabase.from('backtest_runs').update({ status: 'failed' }).eq('id', backtest.id);
        throw backtestError;
      }

      if (results?.error) {
        await supabase.from('backtest_runs').update({ status: 'failed' }).eq('id', backtest.id);
        throw new Error(results.error);
      }

      // Update backtest record with real results
      const { error: updateError } = await supabase
        .from('backtest_runs')
        .update({
          status: 'completed',
          final_balance: results.finalBalance,
          total_pnl: results.totalPnl,
          total_trades: results.totalTrades,
          win_rate: results.winRate,
          max_drawdown: results.maxDrawdown,
          sharpe_ratio: results.sharpeRatio,
          results: {
            monthlyBreakdown: results.monthlyBreakdown,
            trades: results.trades,
            profitFactor: results.profitFactor,
            avgWin: results.avgWin,
            avgLoss: results.avgLoss,
          },
          completed_at: new Date().toISOString(),
        })
        .eq('id', backtest.id);

      if (updateError) throw updateError;

      toast.success('Backtest completed with real historical data');
      fetchBacktests();
      return backtest;
    } catch (error) {
      console.error('Error running backtest:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to run backtest');
      return null;
    } finally {
      setRunning(false);
    }
  };

  const resetBacktest = () => {
    setCurrentBacktest(null);
    setMonthlyBreakdown([]);
  };

  useEffect(() => {
    fetchBacktests();
  }, [fetchBacktests]);

  return { 
    backtests, 
    currentBacktest, 
    monthlyBreakdown,
    loading, 
    running,
    runBacktest, 
    resetBacktest,
    refetch: fetchBacktests 
  };
}
