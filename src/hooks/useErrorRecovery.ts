import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ErrorRecoveryStats {
  totalErrors: number;
  pendingRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  recoveryRate: number;
  avgRetryAttempts: number;
}

interface ErrorRecoveryEntry {
  id: string;
  error_type: string;
  error_message: string;
  exchange: string;
  symbol: string;
  attempt_number: number;
  max_attempts: number;
  backoff_ms: number;
  status: string;
  resolution: string | null;
  created_at: string;
  original_request: any;
}

export function useErrorRecovery() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ErrorRecoveryEntry[]>([]);
  const [stats, setStats] = useState<ErrorRecoveryStats>({
    totalErrors: 0,
    pendingRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    recoveryRate: 0,
    avgRetryAttempts: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trade_error_recovery')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const recoveryEntries = data || [];
      setEntries(recoveryEntries);

      // Calculate stats
      const pending = recoveryEntries.filter(e => e.status === 'pending' || e.status === 'retrying').length;
      const successful = recoveryEntries.filter(e => e.status === 'success').length;
      const failed = recoveryEntries.filter(e => e.status === 'failed' || e.status === 'abandoned').length;
      const total = recoveryEntries.length;
      
      const totalAttempts = recoveryEntries.reduce((sum, e) => sum + e.attempt_number, 0);
      const avgAttempts = total > 0 ? totalAttempts / total : 0;
      
      const recoveryRate = total > 0 ? (successful / total) * 100 : 0;

      setStats({
        totalErrors: total,
        pendingRecoveries: pending,
        successfulRecoveries: successful,
        failedRecoveries: failed,
        recoveryRate,
        avgRetryAttempts: avgAttempts,
      });
    } catch (err) {
      console.error('Failed to fetch error recovery data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();

    // Subscribe to realtime updates
    if (!user) return;

    const channel = supabase
      .channel('error-recovery-stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_error_recovery',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchData]);

  const retryEntry = useCallback(async (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return false;

    try {
      // Update status to retrying
      await supabase
        .from('trade_error_recovery')
        .update({ 
          status: 'retrying',
          attempt_number: entry.attempt_number + 1 
        })
        .eq('id', entryId);

      // Trigger the trade execution again
      const { error } = await supabase.functions.invoke('execute-bot-trade', {
        body: { 
          ...entry.original_request,
          retryFromRecovery: true,
          recoveryId: entryId 
        }
      });

      if (error) throw error;
      
      await fetchData();
      return true;
    } catch (err) {
      console.error('Retry failed:', err);
      
      await supabase
        .from('trade_error_recovery')
        .update({ status: 'failed', resolution: 'manual_retry_failed' })
        .eq('id', entryId);
      
      await fetchData();
      return false;
    }
  }, [entries, fetchData]);

  const dismissEntry = useCallback(async (entryId: string) => {
    try {
      await supabase
        .from('trade_error_recovery')
        .update({ status: 'abandoned', resolution: 'user_dismissed' })
        .eq('id', entryId);
      
      await fetchData();
      return true;
    } catch (err) {
      console.error('Failed to dismiss entry:', err);
      return false;
    }
  }, [fetchData]);

  return {
    entries,
    stats,
    isLoading,
    retryEntry,
    dismissEntry,
    refetch: fetchData,
  };
}
