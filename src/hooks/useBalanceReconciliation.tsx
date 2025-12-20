import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface PositionDiscrepancy {
  asset: string;
  expectedQty: number;
  expectedValue: number;
  actualQty: number;
  actualValue: number;
  discrepancyQty: number;
  discrepancyValue: number;
  discrepancyPercent: number;
  orphanTradeCount: number;
}

interface ReconciliationResult {
  discrepancies: PositionDiscrepancy[];
  totalExpectedValue: number;
  totalActualValue: number;
  totalDiscrepancy: number;
  discrepancyPercent: number;
  orphanTradeCount: number;
  hasSignificantMismatch: boolean;
  lastChecked: string;
}

interface OrphanTrade {
  id: string;
  pair: string;
  amount: number;
  entryPrice: number;
  expectedQty: number;
  currentPrice: number;
  estimatedPnL: number;
}

export function useBalanceReconciliation() {
  const { user } = useAuth();
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [orphanTrades, setOrphanTrades] = useState<OrphanTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const fetchReconciliation = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-balances', {
        body: { action: 'check' }
      });

      if (error) throw error;

      if (data) {
        setReconciliation({
          discrepancies: data.discrepancies || [],
          totalExpectedValue: data.totalExpectedValue || 0,
          totalActualValue: data.totalActualValue || 0,
          totalDiscrepancy: data.totalDiscrepancy || 0,
          discrepancyPercent: data.discrepancyPercent || 0,
          orphanTradeCount: data.orphanTradeCount || 0,
          hasSignificantMismatch: data.hasSignificantMismatch || false,
          lastChecked: new Date().toISOString(),
        });
        setOrphanTrades(data.orphanTrades || []);
      }
    } catch (err) {
      console.error('Reconciliation check failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const cleanupOrphanTrades = useCallback(async () => {
    if (!user) return;

    setCleaningUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('reconcile-balances', {
        body: { action: 'cleanup' }
      });

      if (error) throw error;

      if (data?.closedCount > 0) {
        toast.success(`Cleaned up ${data.closedCount} orphan trades`, {
          description: `Estimated P&L: $${data.totalPnL?.toFixed(2) || '0.00'}`,
        });
        // Refresh reconciliation data
        await fetchReconciliation();
      } else {
        toast.info('No orphan trades to clean up');
      }

      return data;
    } catch (err) {
      console.error('Cleanup failed:', err);
      toast.error('Failed to cleanup orphan trades');
      throw err;
    } finally {
      setCleaningUp(false);
    }
  }, [user, fetchReconciliation]);

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchReconciliation();
    const interval = setInterval(fetchReconciliation, 60000);
    return () => clearInterval(interval);
  }, [fetchReconciliation]);

  return {
    reconciliation,
    orphanTrades,
    loading,
    cleaningUp,
    fetchReconciliation,
    cleanupOrphanTrades,
  };
}
