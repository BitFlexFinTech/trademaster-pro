import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface JarvisSettings {
  id?: string;
  user_id?: string;
  // Capital & Leverage
  base_capital: number;
  leverage: number;
  hedge_mode_enabled: boolean;
  margin_type: 'ISOLATED' | 'CROSSED';
  // Regime Thresholds
  regime_bull_ema_deviation: number;
  regime_bear_ema_deviation: number;
  // Profit Targets
  target_bull_profit: number;
  target_bear_profit: number;
  target_chop_profit: number;
  // RateSentinel
  rate_request_interval_ms: number;
  rate_cooldown_threshold: number;
  rate_cooldown_duration_ms: number;
  // LiquidationSentinel
  liquidation_min_distance_percent: number;
  liquidation_warning_threshold: number;
  liquidation_critical_threshold: number;
  // Yield Optimization
  yield_fast_close_threshold_ms: number;
  yield_stall_threshold_ms: number;
  yield_suggest_increase_pct: number;
  yield_suggest_decrease_pct: number;
  yield_auto_apply: boolean;
}

export const DEFAULT_JARVIS_SETTINGS: JarvisSettings = {
  base_capital: 127,
  leverage: 4,
  hedge_mode_enabled: true,
  margin_type: 'ISOLATED',
  regime_bull_ema_deviation: 0.005,
  regime_bear_ema_deviation: -0.005,
  target_bull_profit: 2.10,
  target_bear_profit: 2.10,
  target_chop_profit: 1.00,
  rate_request_interval_ms: 5000,
  rate_cooldown_threshold: 0.80,
  rate_cooldown_duration_ms: 60000,
  liquidation_min_distance_percent: 20,
  liquidation_warning_threshold: 25,
  liquidation_critical_threshold: 22,
  yield_fast_close_threshold_ms: 300000,
  yield_stall_threshold_ms: 7200000,
  yield_suggest_increase_pct: 20,
  yield_suggest_decrease_pct: 20,
  yield_auto_apply: false,
};

export interface UseJarvisSettingsReturn {
  settings: JarvisSettings | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updateSettings: (updates: Partial<JarvisSettings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useJarvisSettings(): UseJarvisSettingsReturn {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<JarvisSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('jarvis_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setSettings({
          ...data,
          margin_type: (data.margin_type as 'ISOLATED' | 'CROSSED') || 'ISOLATED',
        });
      } else {
        // No settings exist yet, use defaults
        setSettings(DEFAULT_JARVIS_SETTINGS);
      }
    } catch (err) {
      console.error('Failed to fetch JARVIS settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
      setSettings(DEFAULT_JARVIS_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateSettings = useCallback(async (updates: Partial<JarvisSettings>) => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const newSettings = { ...settings, ...updates };
      
      // Remove id and user_id from the update payload
      const { id, user_id, ...updatePayload } = newSettings as JarvisSettings & { id?: string; user_id?: string };

      const { data: existing } = await supabase
        .from('jarvis_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error: updateError } = await supabase
          .from('jarvis_settings')
          .update(updatePayload)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from('jarvis_settings')
          .insert({ ...updatePayload, user_id: user.id });

        if (insertError) throw insertError;
      }

      setSettings(newSettings);
      toast({
        title: 'Settings Saved',
        description: 'JARVIS configuration updated successfully.',
      });
    } catch (err) {
      console.error('Failed to update JARVIS settings:', err);
      const message = err instanceof Error ? err.message : 'Failed to save settings';
      setError(message);
      toast({
        title: 'Save Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [user, settings, toast]);

  const resetToDefaults = useCallback(async () => {
    await updateSettings(DEFAULT_JARVIS_SETTINGS);
  }, [updateSettings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    isSaving,
    error,
    updateSettings,
    resetToDefaults,
    refetch: fetchSettings,
  };
}
