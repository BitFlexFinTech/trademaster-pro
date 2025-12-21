import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface AlertThresholds {
  pnlWarning: number;
  pnlDanger: number;
  hitRateWarning: number;
  largeProfitCelebration: number;
  consecutiveLossAlert: number;
  enablePnlAlerts: boolean;
  enableHitRateAlerts: boolean;
  enableProfitAlerts: boolean;
  enableLossStreakAlerts: boolean;
}

export interface AlertEvent {
  id: string;
  type: 'pnl_warning' | 'pnl_danger' | 'hitrate_warning' | 'large_profit' | 'loss_streak';
  message: string;
  value: number;
  timestamp: Date;
  acknowledged: boolean;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  pnlWarning: -5,
  pnlDanger: -10,
  hitRateWarning: 60,
  largeProfitCelebration: 5,
  consecutiveLossAlert: 5,
  enablePnlAlerts: true,
  enableHitRateAlerts: true,
  enableProfitAlerts: true,
  enableLossStreakAlerts: true,
};

const STORAGE_KEY = 'greenback-alert-thresholds';

export function useTradeAlerts() {
  const { user } = useAuth();
  const [thresholds, setThresholds] = useState<AlertThresholds>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) } : DEFAULT_THRESHOLDS;
    } catch {
      return DEFAULT_THRESHOLDS;
    }
  });
  
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [lastCheckedPnL, setLastCheckedPnL] = useState<number>(0);
  const [lastCheckedHitRate, setLastCheckedHitRate] = useState<number>(100);

  // Save thresholds to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  }, [thresholds]);

  const addAlert = useCallback((alert: Omit<AlertEvent, 'id' | 'timestamp' | 'acknowledged'>) => {
    const newAlert: AlertEvent = {
      ...alert,
      id: `alert-${Date.now()}`,
      timestamp: new Date(),
      acknowledged: false,
    };
    
    setAlerts(prev => [newAlert, ...prev].slice(0, 50)); // Keep last 50 alerts
    
    // Show toast notification
    const toastFn = alert.type === 'large_profit' ? toast.success : 
                    alert.type === 'pnl_danger' || alert.type === 'loss_streak' ? toast.error : 
                    toast.warning;
    
    toastFn(alert.message, {
      description: `Value: ${alert.value.toFixed(2)}`,
      duration: 10000,
    });

    // Create alert in database
    if (user) {
      supabase.from('alerts').insert([{
        user_id: user.id,
        alert_type: alert.type,
        title: alert.message,
        message: `Value: ${alert.value.toFixed(2)}`,
        data: { value: alert.value },
      }]).then(({ error }) => {
        if (error) console.error('Error saving alert:', error);
      });
    }
  }, [user, thresholds]);

  const checkPnL = useCallback((currentPnL: number, dailyTarget: number) => {
    if (!thresholds.enablePnlAlerts) return;
    
    // Check for large profit
    if (thresholds.enableProfitAlerts && currentPnL >= thresholds.largeProfitCelebration && lastCheckedPnL < thresholds.largeProfitCelebration) {
      addAlert({
        type: 'large_profit',
        message: `🎉 Great job! You've reached $${currentPnL.toFixed(2)} profit!`,
        value: currentPnL,
      });
    }
    
    // Check for P&L warning
    if (currentPnL <= thresholds.pnlWarning && lastCheckedPnL > thresholds.pnlWarning) {
      addAlert({
        type: 'pnl_warning',
        message: `⚠️ P&L Warning: Daily loss approaching $${Math.abs(thresholds.pnlWarning)}`,
        value: currentPnL,
      });
    }
    
    // Check for P&L danger
    if (currentPnL <= thresholds.pnlDanger && lastCheckedPnL > thresholds.pnlDanger) {
      addAlert({
        type: 'pnl_danger',
        message: `🚨 P&L Critical: Daily loss exceeded $${Math.abs(thresholds.pnlDanger)}!`,
        value: currentPnL,
      });
    }
    
    setLastCheckedPnL(currentPnL);
  }, [thresholds, lastCheckedPnL, addAlert]);

  const checkHitRate = useCallback((currentHitRate: number) => {
    if (!thresholds.enableHitRateAlerts) return;
    
    if (currentHitRate < thresholds.hitRateWarning && lastCheckedHitRate >= thresholds.hitRateWarning) {
      addAlert({
        type: 'hitrate_warning',
        message: `📉 Hit Rate dropped below ${thresholds.hitRateWarning}%!`,
        value: currentHitRate,
      });
    }
    
    setLastCheckedHitRate(currentHitRate);
  }, [thresholds, lastCheckedHitRate, addAlert]);

  const checkLossStreak = useCallback((consecutiveLosses: number) => {
    if (!thresholds.enableLossStreakAlerts) return;
    
    if (consecutiveLosses >= thresholds.consecutiveLossAlert) {
      addAlert({
        type: 'loss_streak',
        message: `🔴 ${consecutiveLosses} consecutive losses detected!`,
        value: consecutiveLosses,
      });
    }
  }, [thresholds, addAlert]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const updateThresholds = useCallback((updates: Partial<AlertThresholds>) => {
    setThresholds(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    thresholds,
    alerts,
    unacknowledgedCount: alerts.filter(a => !a.acknowledged).length,
    checkPnL,
    checkHitRate,
    checkLossStreak,
    acknowledgeAlert,
    clearAlerts,
    updateThresholds,
  };
}
