import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Trade {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  entry_price: number;
  exit_price: number | null;
  amount: number;
  leverage: number;
  profit_loss: number | null;
  profit_percentage: number | null;
  status: 'open' | 'closed' | 'cancelled';
  exchange_name: string | null;
  is_sandbox: boolean;
  created_at: string;
  closed_at: string | null;
}

export interface ExecuteTradeParams {
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  exchangeName?: string;
  isSandbox: boolean;
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const { toast } = useToast();
  const { user, session } = useAuth();

  const fetchTrades = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTrades(data as Trade[]);
    } catch (err: any) {
      console.error('Error fetching trades:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch trades',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  const executeTrade = useCallback(async (params: ExecuteTradeParams) => {
    if (!session?.access_token) {
      toast({
        title: 'Error',
        description: 'Please log in to execute trades',
        variant: 'destructive',
      });
      return null;
    }

    setExecuting(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: params,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: 'Trade Opened',
        description: `${params.direction.toUpperCase()} ${params.pair} at $${params.entryPrice.toFixed(2)}`,
      });

      // Refresh trades list
      await fetchTrades();

      return data.trade;
    } catch (err: any) {
      console.error('Error executing trade:', err);
      toast({
        title: 'Trade Failed',
        description: err.message || 'Failed to execute trade',
        variant: 'destructive',
      });
      return null;
    } finally {
      setExecuting(false);
    }
  }, [session, toast, fetchTrades]);

  // Calculate portfolio stats
  const stats = {
    totalTrades: trades.length,
    openTrades: trades.filter(t => t.status === 'open').length,
    winRate: trades.filter(t => t.status === 'closed').length > 0
      ? (trades.filter(t => t.status === 'closed' && (t.profit_loss || 0) > 0).length / 
         trades.filter(t => t.status === 'closed').length) * 100
      : 0,
    totalPnL: trades
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + (t.profit_loss || 0), 0),
    avgProfit: trades.filter(t => t.status === 'closed').length > 0
      ? trades
          .filter(t => t.status === 'closed')
          .reduce((sum, t) => sum + (t.profit_percentage || 0), 0) / 
        trades.filter(t => t.status === 'closed').length
      : 0,
  };

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!user) return;

    fetchTrades();

    const channel = supabase
      .channel('trades-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Trade update:', payload);
          fetchTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTrades]);

  return {
    trades,
    stats,
    loading,
    executing,
    fetchTrades,
    executeTrade,
  };
}