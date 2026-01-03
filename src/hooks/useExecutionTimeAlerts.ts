import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ExecutionTimeThresholds {
  totalMs: number;
  pairSelectionMs: number;
  aiAnalysisMs: number;
  orderPlacementMs: number;
  confirmationMs: number;
  enableAlerts: boolean;
}

export interface ExecutionAlert {
  id: string;
  type: 'slow_total' | 'slow_phase';
  phase?: string;
  durationMs: number;
  thresholdMs: number;
  tradeId: string;
  pair: string;
  exchange: string;
  timestamp: Date;
}

const DEFAULT_THRESHOLDS: ExecutionTimeThresholds = {
  totalMs: 1500,
  pairSelectionMs: 300,
  aiAnalysisMs: 400,
  orderPlacementMs: 700,
  confirmationMs: 200,
  enableAlerts: true,
};

const PHASE_MAP: Record<string, keyof ExecutionTimeThresholds> = {
  'PAIR_SELECTION': 'pairSelectionMs',
  'AI_ANALYSIS': 'aiAnalysisMs',
  'ORDER_PLACEMENT': 'orderPlacementMs',
  'CONFIRMATION': 'confirmationMs',
};

export function useExecutionTimeAlerts() {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState<ExecutionTimeThresholds>(() => {
    const saved = localStorage.getItem('execution-time-thresholds');
    if (saved) {
      try {
        return { ...DEFAULT_THRESHOLDS, ...JSON.parse(saved) };
      } catch { /* ignore */ }
    }
    return DEFAULT_THRESHOLDS;
  });
  const [alerts, setAlerts] = useState<ExecutionAlert[]>([]);
  const [recentAlertCount, setRecentAlertCount] = useState(0);
  const processedTradesRef = useRef<Set<string>>(new Set());

  // Save thresholds to localStorage
  useEffect(() => {
    localStorage.setItem('execution-time-thresholds', JSON.stringify(thresholds));
  }, [thresholds]);

  // Update thresholds
  const updateThresholds = useCallback((updates: Partial<ExecutionTimeThresholds>) => {
    setThresholds(prev => ({ ...prev, ...updates }));
  }, []);

  // Check trade telemetry and generate alerts
  const checkTradeForAlerts = useCallback((trade: any) => {
    if (!thresholds.enableAlerts) return;
    if (!trade.execution_telemetry?.phaseMetrics) return;
    if (processedTradesRef.current.has(trade.id)) return;
    
    processedTradesRef.current.add(trade.id);
    const newAlerts: ExecutionAlert[] = [];
    const telemetry = trade.execution_telemetry;
    const phases = telemetry.phaseMetrics;

    // Calculate total duration
    let totalMs = 0;
    for (const phase of Object.values(phases) as any[]) {
      totalMs += phase?.durationMs || 0;
    }

    // Check total threshold
    if (totalMs > thresholds.totalMs) {
      const alert: ExecutionAlert = {
        id: `${trade.id}-total`,
        type: 'slow_total',
        durationMs: totalMs,
        thresholdMs: thresholds.totalMs,
        tradeId: trade.id,
        pair: trade.pair || 'Unknown',
        exchange: trade.exchange_name || 'Unknown',
        timestamp: new Date(),
      };
      newAlerts.push(alert);
      toast.warning(`Slow Execution: ${trade.pair}`, {
        description: `Total: ${totalMs}ms (threshold: ${thresholds.totalMs}ms)`,
      });
    }

    // Check individual phase thresholds
    for (const [phaseName, phaseData] of Object.entries(phases) as [string, any][]) {
      const thresholdKey = PHASE_MAP[phaseName];
      if (!thresholdKey) continue;
      
      const phaseThreshold = thresholds[thresholdKey] as number;
      const phaseDuration = phaseData?.durationMs || 0;
      
      if (phaseDuration > phaseThreshold) {
        const alert: ExecutionAlert = {
          id: `${trade.id}-${phaseName}`,
          type: 'slow_phase',
          phase: phaseName,
          durationMs: phaseDuration,
          thresholdMs: phaseThreshold,
          tradeId: trade.id,
          pair: trade.pair || 'Unknown',
          exchange: trade.exchange_name || 'Unknown',
          timestamp: new Date(),
        };
        newAlerts.push(alert);
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 50)); // Keep last 50 alerts
      setRecentAlertCount(prev => prev + newAlerts.length);
    }
  }, [thresholds]);

  // Subscribe to realtime trade inserts
  useEffect(() => {
    if (!user || !thresholds.enableAlerts) return;

    const channel = supabase
      .channel('execution-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            checkTradeForAlerts(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, thresholds.enableAlerts, checkTradeForAlerts]);

  // Clear recent alert count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setRecentAlertCount(0);
    }, 60000); // Reset every minute
    return () => clearInterval(interval);
  }, []);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setRecentAlertCount(0);
  }, []);

  return {
    thresholds,
    updateThresholds,
    alerts,
    recentAlertCount,
    dismissAlert,
    clearAlerts,
    DEFAULT_THRESHOLDS,
  };
}
