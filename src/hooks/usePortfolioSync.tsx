import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PortfolioSyncResult {
  totalBalance: number;
  exchangeBalances: Record<string, number>;
  lastSyncTime: Date | null;
  optimalPositionSize: number;
}

const MINIMUM_POSITION_SIZE = 333; // Minimum for $1 profit target
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function usePortfolioSync() {
  const { user } = useAuth();
  const [syncResult, setSyncResult] = useState<PortfolioSyncResult>({
    totalBalance: 0,
    exchangeBalances: {},
    lastSyncTime: null,
    optimalPositionSize: MINIMUM_POSITION_SIZE,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateOptimalPositionSize = useCallback((balance: number): number => {
    // Position size formula for $1 net profit:
    // positionSize = targetProfit / (edgePercent - 2 * feeRate)
    // With 0.6% edge and 0.1% fee (0.2% round-trip):
    // positionSize = $1 / (0.006 - 0.002) = $250
    // We use $333 as minimum for safety buffer
    
    const TARGET_PROFIT = 1.00;
    const MIN_EDGE = 0.006; // 0.6%
    const ROUND_TRIP_FEES = 0.002; // 0.2%
    
    const calculatedSize = TARGET_PROFIT / (MIN_EDGE - ROUND_TRIP_FEES);
    const withBuffer = Math.max(calculatedSize, MINIMUM_POSITION_SIZE);
    
    // Cap at 50% of available balance
    const maxFromBalance = balance * 0.5;
    
    if (maxFromBalance < MINIMUM_POSITION_SIZE) {
      return MINIMUM_POSITION_SIZE; // Return minimum even if balance is low (for display)
    }
    
    return Math.min(withBuffer, maxFromBalance);
  }, []);

  const syncPortfolio = useCallback(async (): Promise<PortfolioSyncResult | null> => {
    if (!user?.id) return null;
    
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      // Call sync-exchange-balances edge function
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances', {
        body: { userId: user.id }
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to sync balances');
      }
      
      // Calculate total USDT balance across all exchanges
      const exchangeBalances: Record<string, number> = {};
      let totalBalance = 0;
      
      if (data?.balances) {
        for (const balance of data.balances) {
          const usdtAmount = balance.usdt || balance.USDT || 0;
          exchangeBalances[balance.exchange] = usdtAmount;
          totalBalance += usdtAmount;
        }
      }
      
      // Fallback: Try to get from portfolio_holdings if edge function returns nothing
      if (totalBalance === 0) {
        const { data: holdings } = await supabase
          .from('portfolio_holdings')
          .select('asset_symbol, quantity, exchange_name')
          .eq('user_id', user.id)
          .in('asset_symbol', ['USDT', 'USDC', 'USD']);
        
        if (holdings) {
          for (const holding of holdings) {
            const exchange = holding.exchange_name || 'Unknown';
            const amount = holding.quantity || 0;
            exchangeBalances[exchange] = (exchangeBalances[exchange] || 0) + amount;
            totalBalance += amount;
          }
        }
      }
      
      const optimalPositionSize = calculateOptimalPositionSize(totalBalance);
      const lastSyncTime = new Date();
      
      const result: PortfolioSyncResult = {
        totalBalance,
        exchangeBalances,
        lastSyncTime,
        optimalPositionSize,
      };
      
      setSyncResult(result);
      
      // Save to database for persistence
      await supabase
        .from('bot_config')
        .update({
          synced_portfolio_balance: totalBalance,
          last_balance_sync: lastSyncTime.toISOString(),
        })
        .eq('user_id', user.id);
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setSyncError(message);
      console.error('Portfolio sync error:', err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [user?.id, calculateOptimalPositionSize]);

  const startAutoSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }
    
    // Initial sync
    syncPortfolio();
    
    // Set up periodic sync
    syncIntervalRef.current = setInterval(() => {
      syncPortfolio();
    }, SYNC_INTERVAL_MS);
  }, [syncPortfolio]);

  const stopAutoSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // Load cached sync data on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const loadCachedSync = async () => {
      const { data } = await supabase
        .from('bot_config')
        .select('synced_portfolio_balance, last_balance_sync')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data?.synced_portfolio_balance) {
        setSyncResult(prev => ({
          ...prev,
          totalBalance: data.synced_portfolio_balance,
          lastSyncTime: data.last_balance_sync ? new Date(data.last_balance_sync) : null,
          optimalPositionSize: calculateOptimalPositionSize(data.synced_portfolio_balance),
        }));
      }
    };
    
    loadCachedSync();
    
    return () => {
      stopAutoSync();
    };
  }, [user?.id, calculateOptimalPositionSize, stopAutoSync]);

  const formatTimeSinceSync = useCallback((): string => {
    if (!syncResult.lastSyncTime) return 'Never';
    
    const diffMs = Date.now() - syncResult.lastSyncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  }, [syncResult.lastSyncTime]);

  return {
    syncResult,
    isSyncing,
    syncError,
    syncPortfolio,
    startAutoSync,
    stopAutoSync,
    formatTimeSinceSync,
    isBalanceSufficient: syncResult.totalBalance >= MINIMUM_POSITION_SIZE,
    MINIMUM_POSITION_SIZE,
  };
}
