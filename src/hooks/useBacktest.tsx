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
      // Create backtest record
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

      // Simulate backtest (in production, call edge function)
      // For now, generate simulated results
      const trades = Math.floor(Math.random() * 50) + 20;
      const winRate = Math.random() * 30 + 50; // 50-80%
      const pnlPercent = (Math.random() * 40) - 10; // -10% to +30%
      const totalPnl = initialBalance * (pnlPercent / 100);
      const finalBalance = initialBalance + totalPnl;

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const monthlyResults = months.map(m => ({
        period: m,
        pnl: Math.round((Math.random() * 1000) - 200),
        trades: Math.floor(Math.random() * 15) + 5,
        winRate: Math.round(Math.random() * 30 + 50),
      }));

      const { error: updateError } = await supabase
        .from('backtest_runs')
        .update({
          status: 'completed',
          final_balance: finalBalance,
          total_pnl: totalPnl,
          total_trades: trades,
          win_rate: winRate,
          max_drawdown: Math.random() * 15,
          sharpe_ratio: Math.random() * 2 + 0.5,
          results: { monthlyBreakdown: monthlyResults },
          completed_at: new Date().toISOString(),
        })
        .eq('id', backtest.id);

      if (updateError) throw updateError;

      toast.success('Backtest completed');
      fetchBacktests();
      return backtest;
    } catch (error) {
      console.error('Error running backtest:', error);
      toast.error('Failed to run backtest');
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
