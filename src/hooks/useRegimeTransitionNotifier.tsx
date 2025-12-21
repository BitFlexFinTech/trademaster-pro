import { useEffect, useRef, useCallback, useState } from 'react';
import { useJarvisRegime, RegimeType } from '@/hooks/useJarvisRegime';
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Regime-specific sounds
const REGIME_SOUNDS = {
  chime: 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdJKVmZydnZ2dm5qYlpSSkI6MioiGhIKAfn17eXd1c3FvbWtpZ2VjYV9dW1lXVVNRUE5MS0lHRURCQD8+PDs6ODc2NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQBCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/',
  pulse: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+',
  announce: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAAABBQoQFR0mMTxIVGFvfIqWoqyztbe3t7Ovp5yRhXdpXE9DOS4jGREKBQEAAQULEhojLzpIVmRyfIeRmqClpqakn5mQhXpuYVNGOi8kGhEJBAEAAQYMFB8sOkZTYW9/ipOan6KjoZ2Xj4N5bV9STj0zJxsRCQMAAAQKEhodJC0yNTo9Pz4+Ozo2LykkHBcRDAcDAAABBgsRFhweISMkJCQjIR4bFhEMCAQBAAABBQoQFh0kLDVARk1UWl9jZmdnZWJdV1BJQTkxKCAdFxMNCAQBAAEFCQ0REhMTExIQDgsHAwAAAQQHCg0QERIRERAQEA8ODQsIBQMBAAEDBAUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYFBQQDAgEA',
};

interface RegimeNotification {
  from: RegimeType;
  to: RegimeType;
  timestamp: Date;
  recommendation: string;
}

interface RegimeAlertSettings {
  enabled: boolean;
  volume: number;
  pushTypes: ('toast' | 'push')[];
  cooldownSeconds: number;
  sound: keyof typeof REGIME_SOUNDS;
}

export function useRegimeTransitionNotifier(
  symbol: string = 'BTCUSDT',
  enabled: boolean = true
) {
  const { user } = useAuth();
  const { regime, deviation, isLoading, lastTransition } = useJarvisRegime(symbol);
  const { 
    notify, 
    playWinSound, 
    playWarningAlertSound, 
    soundEnabled,
    requestPushPermission,
    saveAlert,
  } = useNotifications();

  const previousRegimeRef = useRef<RegimeType | null>(null);
  const lastNotifiedTransitionRef = useRef<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // User settings for regime alerts
  const [alertSettings, setAlertSettings] = useState<RegimeAlertSettings>({
    enabled: true,
    volume: 50,
    pushTypes: ['toast', 'push'],
    cooldownSeconds: 30,
    sound: 'chime',
  });

  // Load settings from localStorage and database
  useEffect(() => {
    // First load from localStorage
    const stored = localStorage.getItem('soundNotificationSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAlertSettings({
          enabled: parsed.regimeAlertsEnabled ?? true,
          volume: parsed.regimeAlertVolume ?? 50,
          pushTypes: parsed.regimeAlertPushTypes ?? ['toast', 'push'],
          cooldownSeconds: parsed.regimeAlertCooldownSeconds ?? 30,
          sound: parsed.regimeAlertSound ?? 'chime',
        });
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Subscribe to localStorage changes (for real-time settings sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'soundNotificationSettings' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setAlertSettings({
            enabled: parsed.regimeAlertsEnabled ?? true,
            volume: parsed.regimeAlertVolume ?? 50,
            pushTypes: parsed.regimeAlertPushTypes ?? ['toast', 'push'],
            cooldownSeconds: parsed.regimeAlertCooldownSeconds ?? 30,
            sound: parsed.regimeAlertSound ?? 'chime',
          });
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Initialize regime audio with user volume
  useEffect(() => {
    audioRef.current = new Audio(REGIME_SOUNDS[alertSettings.sound]);
    audioRef.current.volume = alertSettings.volume / 100;
  }, [alertSettings.sound, alertSettings.volume]);

  // Play regime-specific sound
  const playRegimeSound = useCallback((newRegime: RegimeType) => {
    if (!soundEnabled || !alertSettings.enabled) return;

    // Use different sounds based on regime
    if (newRegime === 'BULL') {
      playWinSound(); // Rising tone for bullish
    } else if (newRegime === 'BEAR') {
      playWarningAlertSound(); // Alert for bearish
    } else {
      // CHOP - play custom regime transition sound
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }
  }, [soundEnabled, alertSettings.enabled, playWinSound, playWarningAlertSound]);

  // Get recommendation based on regime transition
  const getRecommendation = useCallback((from: RegimeType, to: RegimeType): string => {
    if (to === 'BULL') {
      return 'Focus on LONG positions. Increase position sizes on pullbacks.';
    } else if (to === 'BEAR') {
      return 'Focus on SHORT positions. Consider reducing exposure.';
    } else {
      // CHOP
      if (from === 'BULL') {
        return 'Uptrend weakening. Scalp both directions with tight stops.';
      } else if (from === 'BEAR') {
        return 'Downtrend weakening. Reduce size, wait for clarity.';
      }
      return 'Market is choppy. Trade both directions with reduced size.';
    }
  }, []);

  // Get regime icon
  const getRegimeIcon = useCallback((regime: RegimeType): string => {
    switch (regime) {
      case 'BULL': return '🐂';
      case 'BEAR': return '🐻';
      case 'CHOP': return '🌊';
      default: return '📊';
    }
  }, []);

  // Notify regime transition
  const notifyTransition = useCallback((from: RegimeType, to: RegimeType) => {
    if (!alertSettings.enabled) return;

    const recommendation = getRecommendation(from, to);
    const fromIcon = getRegimeIcon(from);
    const toIcon = getRegimeIcon(to);

    // Play audio cue
    playRegimeSound(to);

    // Toast notification (if enabled)
    if (alertSettings.pushTypes.includes('toast')) {
      notify(
        `${fromIcon} → ${toIcon} Regime Change`,
        `Market shifted from ${from} to ${to}. ${recommendation}`,
        to === 'BEAR' ? 'warning' : 'info'
      );
    }

    // Save to alerts database
    saveAlert(
      'regime_transition',
      `Regime: ${from} → ${to}`,
      recommendation,
      { from, to, deviation, symbol }
    );

    console.log(`[useRegimeTransitionNotifier] Notified: ${from} → ${to}`);
  }, [alertSettings, getRecommendation, getRegimeIcon, playRegimeSound, notify, saveAlert, deviation, symbol]);

  // Watch for regime changes
  useEffect(() => {
    if (!enabled || isLoading || !alertSettings.enabled) return;

    // Skip if regime hasn't been set yet
    if (!regime) return;

    // Initialize previous regime on first load (don't notify)
    if (previousRegimeRef.current === null) {
      previousRegimeRef.current = regime;
      return;
    }

    // Check if regime has changed
    if (regime !== previousRegimeRef.current) {
      // Use user-configured cooldown
      const now = new Date();
      if (lastNotifiedTransitionRef.current) {
        const timeSinceLastNotification = now.getTime() - lastNotifiedTransitionRef.current.getTime();
        if (timeSinceLastNotification < alertSettings.cooldownSeconds * 1000) {
          console.log('[useRegimeTransitionNotifier] Skipping - within cooldown period');
          previousRegimeRef.current = regime;
          return;
        }
      }

      // Notify the transition
      notifyTransition(previousRegimeRef.current, regime);

      // Update refs
      previousRegimeRef.current = regime;
      lastNotifiedTransitionRef.current = now;
    }
  }, [regime, isLoading, enabled, alertSettings.enabled, alertSettings.cooldownSeconds, notifyTransition]);

  // Request push permission on mount
  useEffect(() => {
    if (enabled && alertSettings.pushTypes.includes('push')) {
      requestPushPermission();
    }
  }, [enabled, alertSettings.pushTypes, requestPushPermission]);

  return {
    currentRegime: regime,
    previousRegime: previousRegimeRef.current,
    lastTransition,
    deviation,
    alertSettings,
  };
}
