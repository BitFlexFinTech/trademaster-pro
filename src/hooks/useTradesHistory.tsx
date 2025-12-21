import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Trade {
  id: string;
  pair: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  amount: number;
  profit_loss: number | null;
  profit_percentage: number | null;
  status: string;
  exchange_name: string | null;
  leverage: number | null;
  is_sandbox: boolean;
  created_at: string;
  closed_at: string | null;
  bot_run_id: string | null;
}

export interface BotSession {
  id: string;
  bot_name: string;
  mode: string;
  status: string;
  started_at: string | null;
  stopped_at: string | null;
  current_pnl: number;
  trades_executed: number;
  hit_rate: number;
  is_sandbox: boolean;
  trades: Trade[];
}

export interface TradesHistoryFilters {
  dateFrom: string;
  dateTo: string;
  mode: 'all' | 'demo' | 'live';
  status: 'all' | 'running' | 'stopped';
  exchange: string;
  pair: string;
}

export function useTradesHistory() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<BotSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TradesHistoryFilters>({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    dateTo: new Date().toISOString().split('T')[0],
    mode: 'all',
    status: 'all',
    exchange: '',
    pair: '',
  });

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch bot runs with their trades
      let query = supabase
        .from('bot_runs')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', `${filters.dateFrom}T00:00:00`)
        .lte('created_at', `${filters.dateTo}T23:59:59`)
        .order('created_at', { ascending: false });
      
      if (filters.mode === 'demo') {
        query = query.eq('is_sandbox', true);
      } else if (filters.mode === 'live') {
        query = query.eq('is_sandbox', false);
      }
      
      if (filters.status === 'running') {
        query = query.eq('status', 'running');
      } else if (filters.status === 'stopped') {
        query = query.eq('status', 'stopped');
      }

      const { data: botRuns, error: runsError } = await query;
      if (runsError) throw runsError;

      // Fetch trades for each session
      const sessionsWithTrades: BotSession[] = [];
      
      for (const run of botRuns || []) {
        let tradesQuery = supabase
          .from('trades')
          .select('*')
          .eq('bot_run_id', run.id)
          .order('created_at', { ascending: false });
        
        if (filters.exchange) {
          tradesQuery = tradesQuery.eq('exchange_name', filters.exchange);
        }
        
        if (filters.pair) {
          tradesQuery = tradesQuery.ilike('pair', `%${filters.pair}%`);
        }

        const { data: trades } = await tradesQuery;
        
        sessionsWithTrades.push({
          id: run.id,
          bot_name: run.bot_name,
          mode: run.mode,
          status: run.status || 'stopped',
          started_at: run.started_at,
          stopped_at: run.stopped_at,
          current_pnl: run.current_pnl || 0,
          trades_executed: run.trades_executed || 0,
          hit_rate: run.hit_rate || 0,
          is_sandbox: run.is_sandbox || false,
          trades: trades || [],
        });
      }

      // Also fetch orphan trades (trades without a bot_run_id)
      let orphanQuery = supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .is('bot_run_id', null)
        .gte('created_at', `${filters.dateFrom}T00:00:00`)
        .lte('created_at', `${filters.dateTo}T23:59:59`)
        .order('created_at', { ascending: false });
      
      if (filters.exchange) {
        orphanQuery = orphanQuery.eq('exchange_name', filters.exchange);
      }
      
      if (filters.pair) {
        orphanQuery = orphanQuery.ilike('pair', `%${filters.pair}%`);
      }

      const { data: orphanTrades } = await orphanQuery;
      
      if (orphanTrades && orphanTrades.length > 0) {
        sessionsWithTrades.push({
          id: 'orphan-trades',
          bot_name: 'Manual/Orphan Trades',
          mode: 'mixed',
          status: 'completed',
          started_at: null,
          stopped_at: null,
          current_pnl: orphanTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0),
          trades_executed: orphanTrades.length,
          hit_rate: (orphanTrades.filter(t => (t.profit_loss || 0) > 0).length / orphanTrades.length) * 100,
          is_sandbox: false,
          trades: orphanTrades,
        });
      }

      setSessions(sessionsWithTrades);
    } catch (err) {
      console.error('Error fetching trades history:', err);
    } finally {
      setLoading(false);
    }
  }, [user, filters]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const exportToCSV = useCallback(() => {
    const allTrades: Trade[] = sessions.flatMap(s => s.trades);
    
    if (allTrades.length === 0) return;

    const headers = [
      'Session',
      'Pair',
      'Direction',
      'Entry Price',
      'Exit Price',
      'Amount',
      'P&L',
      'P&L %',
      'Status',
      'Exchange',
      'Leverage',
      'Mode',
      'Opened',
      'Closed',
    ];

    const rows = allTrades.map(t => {
      const session = sessions.find(s => s.trades.some(st => st.id === t.id));
      return [
        session?.bot_name || 'Unknown',
        t.pair,
        t.direction,
        t.entry_price.toFixed(4),
        t.exit_price?.toFixed(4) || '',
        t.amount.toFixed(4),
        t.profit_loss?.toFixed(2) || '',
        t.profit_percentage?.toFixed(2) || '',
        t.status,
        t.exchange_name || '',
        t.leverage?.toString() || '1',
        t.is_sandbox ? 'Demo' : 'Live',
        t.created_at,
        t.closed_at || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${c}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trades-history-${filters.dateFrom}-to-${filters.dateTo}.csv`;
    link.click();
  }, [sessions, filters]);

  const totalTrades = sessions.reduce((sum, s) => sum + s.trades.length, 0);
  const totalPnL = sessions.reduce((sum, s) => sum + s.current_pnl, 0);

  return {
    sessions,
    loading,
    filters,
    setFilters,
    fetchHistory,
    exportToCSV,
    totalTrades,
    totalPnL,
  };
}
