import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface EmergencyKillConfig {
  warningThreshold: number;    // -$3 = show yellow warning
  criticalThreshold: number;   // -$4 = show red alert + audio
  autoKillThreshold: number;   // -$5 = auto-trigger kill
  autoKillEnabled: boolean;
  convertToUSDT: boolean;
}

export interface KillEvent {
  id: string;
  reason: string;
  trigger_pnl: number;
  threshold_used: number;
  bots_killed: number;
  positions_closed: Array<{ asset: string; quantity: number; usdtReceived: number }>;
  total_usdt_recovered: number;
  total_loss_locked: number;
  created_at: string;
}

export interface KillResult {
  success: boolean;
  botsKilled: number;
  positionsClosed: Array<{ asset: string; quantity: number; usdtReceived: number }>;
  totalUsdtRecovered: number;
  totalLossLocked: number;
  timestamp: string;
  killEventId?: string;
}

export type KillStatus = 'idle' | 'safe' | 'warning' | 'critical' | 'executing' | 'complete';

interface UseEmergencyKillSwitchProps {
  currentPnL: number;
  onAutoKill?: (reason: string) => Promise<void>;
}

const DEFAULT_CONFIG: EmergencyKillConfig = {
  warningThreshold: -3,
  criticalThreshold: -4,
  autoKillThreshold: -5,
  autoKillEnabled: true,
  convertToUSDT: true,
};

export function useEmergencyKillSwitch({ currentPnL, onAutoKill }: UseEmergencyKillSwitchProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<EmergencyKillConfig>(() => {
    const saved = localStorage.getItem('emergency_kill_config');
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });
  const [killStatus, setKillStatus] = useState<KillStatus>('idle');
  const [lastKillEvent, setLastKillEvent] = useState<KillEvent | null>(null);
  const [killHistory, setKillHistory] = useState<KillEvent[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoKillTriggeredRef = useRef(false);

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem('emergency_kill_config', JSON.stringify(config));
  }, [config]);

  // Determine kill status based on current P&L
  useEffect(() => {
    if (killStatus === 'executing' || killStatus === 'complete') return;

    if (currentPnL >= 0) {
      setKillStatus('safe');
      autoKillTriggeredRef.current = false;
    } else if (currentPnL <= config.autoKillThreshold && config.autoKillEnabled && !autoKillTriggeredRef.current) {
      setKillStatus('critical');
      autoKillTriggeredRef.current = true;
      // Trigger auto-kill
      triggerKill('auto_threshold');
    } else if (currentPnL <= config.criticalThreshold) {
      setKillStatus('critical');
      // Play alert sound
      if (audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    } else if (currentPnL <= config.warningThreshold) {
      setKillStatus('warning');
    } else {
      setKillStatus('safe');
    }
  }, [currentPnL, config, killStatus]);

  // Fetch kill history
  useEffect(() => {
    if (!user) return;

    async function fetchHistory() {
      const { data } = await supabase
        .from('kill_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        const mapped: KillEvent[] = data.map(d => ({
          id: d.id,
          reason: d.reason,
          trigger_pnl: d.trigger_pnl,
          threshold_used: d.threshold_used,
          bots_killed: d.bots_killed || 0,
          positions_closed: Array.isArray(d.positions_closed) ? d.positions_closed as { asset: string; quantity: number; usdtReceived: number }[] : [],
          total_usdt_recovered: d.total_usdt_recovered || 0,
          total_loss_locked: d.total_loss_locked || 0,
          created_at: d.created_at,
        }));
        setKillHistory(mapped);
        if (mapped.length > 0) {
          setLastKillEvent(mapped[0]);
        }
      }
    }

    fetchHistory();
  }, [user]);

  const updateConfig = useCallback((updates: Partial<EmergencyKillConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const triggerKill = useCallback(async (reason: 'manual' | 'auto_threshold' | 'daily_stop' | 'critical_loss'): Promise<KillResult | null> => {
    if (!user) {
      toast.error('Not authenticated');
      return null;
    }

    setKillStatus('executing');
    const toastId = toast.loading('🔴 Emergency Kill in progress...', { duration: Infinity });

    try {
      const { data, error } = await supabase.functions.invoke('emergency-kill', {
        body: {
          reason,
          currentPnL,
          threshold: config.autoKillThreshold,
          configSnapshot: config,
        }
      });

      if (error) throw error;

      toast.dismiss(toastId);
      toast.success('✅ Emergency Kill Complete', {
        description: `Stopped ${data.botsKilled} bots. Recovered $${data.totalUsdtRecovered.toFixed(2)} USDT.`,
        duration: 10000,
      });

      setKillStatus('complete');
      setLastKillEvent({
        id: data.killEventId,
        reason,
        trigger_pnl: currentPnL,
        threshold_used: config.autoKillThreshold,
        bots_killed: data.botsKilled,
        positions_closed: data.positionsClosed,
        total_usdt_recovered: data.totalUsdtRecovered,
        total_loss_locked: data.totalLossLocked,
        created_at: data.timestamp,
      });

      // Call onAutoKill callback if provided
      if (onAutoKill) {
        await onAutoKill(reason);
      }

      // Reset status after 5 seconds
      setTimeout(() => {
        setKillStatus('idle');
        autoKillTriggeredRef.current = false;
      }, 5000);

      return data as KillResult;

    } catch (err) {
      console.error('Emergency kill failed:', err);
      toast.dismiss(toastId);
      toast.error('Emergency Kill Failed', {
        description: err instanceof Error ? err.message : 'Please try again',
      });
      setKillStatus('idle');
      return null;
    }
  }, [user, currentPnL, config, onAutoKill]);

  const totalLossProtected = killHistory.reduce((sum, k) => sum + k.total_loss_locked, 0);

  return {
    config,
    updateConfig,
    killStatus,
    triggerKill,
    lastKillEvent,
    killHistory,
    totalLossProtected,
    isKilling: killStatus === 'executing',
  };
}
