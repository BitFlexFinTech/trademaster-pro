/**
 * Background Position Monitor Hook
 * 
 * CRITICAL: This hook runs INDEPENDENTLY of bot running state.
 * It polls for open positions every 3 seconds and closes them when profitable.
 * 
 * Purpose:
 * - Ensures OCO fills are detected even when bot is stopped
 * - Provides continuous profit-taking regardless of UI state
 * - Syncs positions that may have been orphaned
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { toast } from 'sonner';

interface OpenPositionMonitorOptions {
  pollingIntervalMs?: number;
  minProfitThreshold?: number;
  enabled?: boolean;
}

export function useOpenPositionMonitor(options: OpenPositionMonitorOptions = {}) {
  const {
    pollingIntervalMs = 3000, // Poll every 3 seconds
    minProfitThreshold = 0.0001, // 0.01% - just cover fees
    enabled = true,
  } = options;

  const { user } = useAuth();
  const { mode: tradingMode, triggerSync } = useTradingMode();
  
  const lastCheckRef = useRef<number>(0);
  const isCheckingRef = useRef(false);
  const openPositionCountRef = useRef(0);

  // Check and sync open positions
  const checkOpenPositions = useCallback(async (silent: boolean = true) => {
    if (!user || tradingMode === 'demo') return { closedPositions: 0, openPositions: 0 };
    
    // Prevent concurrent checks
    if (isCheckingRef.current) {
      console.log('[PositionMonitor] Already checking, skipping...');
      return { closedPositions: 0, openPositions: openPositionCountRef.current };
    }

    isCheckingRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: { 
          checkOpenPositions: true, 
          profitThreshold: minProfitThreshold 
        }
      });

      if (error) {
        console.error('[PositionMonitor] Failed to check positions:', error);
        return { closedPositions: 0, openPositions: openPositionCountRef.current };
      }

      const closedPositions = data?.closedPositions || 0;
      const openPositions = data?.openPositions || 0;
      const profitsTaken = data?.profitsTaken || 0;

      openPositionCountRef.current = openPositions;

      // Show toast only when positions are closed (not on every poll)
      if (closedPositions > 0 && !silent) {
        toast.success(`${closedPositions} Position(s) Closed`, {
          description: profitsTaken > 0 
            ? `${profitsTaken} profit(s) taken` 
            : 'Positions synced',
        });
        
        // Trigger balance sync after closing positions
        triggerSync();
      } else if (closedPositions > 0) {
        console.log(`[PositionMonitor] ${closedPositions} position(s) closed, ${profitsTaken} profit(s) taken`);
        triggerSync();
      }

      lastCheckRef.current = Date.now();
      return { closedPositions, openPositions };

    } catch (err) {
      console.error('[PositionMonitor] Error:', err);
      return { closedPositions: 0, openPositions: openPositionCountRef.current };
    } finally {
      isCheckingRef.current = false;
    }
  }, [user, tradingMode, minProfitThreshold, triggerSync]);

  // Manual sync function for user-triggered sync
  const syncNow = useCallback(async () => {
    const result = await checkOpenPositions(false);
    if (result.closedPositions === 0 && result.openPositions === 0) {
      toast.info('No open positions to sync');
    }
    return result;
  }, [checkOpenPositions]);

  // Get current open position count from database
  const getOpenPositionCount = useCallback(async () => {
    if (!user) return 0;
    
    const { count } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    return count || 0;
  }, [user]);

  // Background polling effect - runs independently of bot state
  useEffect(() => {
    if (!enabled || !user || tradingMode === 'demo') return;

    // Initial check
    checkOpenPositions(true);

    // Set up polling interval
    const intervalId = setInterval(() => {
      checkOpenPositions(true);
    }, pollingIntervalMs);

    console.log(`[PositionMonitor] Started background monitoring (every ${pollingIntervalMs}ms)`);

    return () => {
      clearInterval(intervalId);
      console.log('[PositionMonitor] Stopped background monitoring');
    };
  }, [enabled, user, tradingMode, pollingIntervalMs, checkOpenPositions]);

  return {
    syncNow,
    getOpenPositionCount,
    openPositionCount: openPositionCountRef.current,
    lastCheck: lastCheckRef.current,
    isChecking: isCheckingRef.current,
  };
}
