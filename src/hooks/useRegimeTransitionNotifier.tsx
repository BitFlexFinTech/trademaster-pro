import { useEffect, useRef, useCallback } from 'react';
import { useJarvisRegime, RegimeType } from '@/hooks/useJarvisRegime';
import { useNotifications } from '@/hooks/useNotifications';

// Regime transition sound - distinctive chime pattern
const REGIME_CHANGE_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YSgAAP///wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/';

interface RegimeNotification {
  from: RegimeType;
  to: RegimeType;
  timestamp: Date;
  recommendation: string;
}

export function useRegimeTransitionNotifier(
  symbol: string = 'BTCUSDT',
  enabled: boolean = true
) {
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

  // Initialize regime change audio
  useEffect(() => {
    audioRef.current = new Audio(REGIME_CHANGE_SOUND);
    audioRef.current.volume = 0.6;
  }, []);

  // Play regime-specific sound
  const playRegimeSound = useCallback((newRegime: RegimeType) => {
    if (!soundEnabled) return;

    // Use different sounds based on regime
    if (newRegime === 'BULL') {
      playWinSound(); // Rising tone for bullish
    } else if (newRegime === 'BEAR') {
      playWarningAlertSound(); // Alert for bearish
    } else {
      // CHOP - play neutral transition sound
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }
  }, [soundEnabled, playWinSound, playWarningAlertSound]);

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
    const recommendation = getRecommendation(from, to);
    const fromIcon = getRegimeIcon(from);
    const toIcon = getRegimeIcon(to);

    // Play audio cue
    playRegimeSound(to);

    // Toast notification
    notify(
      `${fromIcon} → ${toIcon} Regime Change`,
      `Market shifted from ${from} to ${to}. ${recommendation}`,
      to === 'BEAR' ? 'warning' : 'info'
    );

    // Save to alerts database
    saveAlert(
      'regime_transition',
      `Regime: ${from} → ${to}`,
      recommendation,
      { from, to, deviation, symbol }
    );

    console.log(`[useRegimeTransitionNotifier] Notified: ${from} → ${to}`);
  }, [getRecommendation, getRegimeIcon, playRegimeSound, notify, saveAlert, deviation, symbol]);

  // Watch for regime changes
  useEffect(() => {
    if (!enabled || isLoading) return;

    // Skip if regime hasn't been set yet
    if (!regime) return;

    // Initialize previous regime on first load (don't notify)
    if (previousRegimeRef.current === null) {
      previousRegimeRef.current = regime;
      return;
    }

    // Check if regime has changed
    if (regime !== previousRegimeRef.current) {
      // Prevent duplicate notifications within 30 seconds
      const now = new Date();
      if (lastNotifiedTransitionRef.current) {
        const timeSinceLastNotification = now.getTime() - lastNotifiedTransitionRef.current.getTime();
        if (timeSinceLastNotification < 30000) {
          console.log('[useRegimeTransitionNotifier] Skipping duplicate notification');
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
  }, [regime, isLoading, enabled, notifyTransition]);

  // Request push permission on mount
  useEffect(() => {
    if (enabled) {
      requestPushPermission();
    }
  }, [enabled, requestPushPermission]);

  return {
    currentRegime: regime,
    previousRegime: previousRegimeRef.current,
    lastTransition,
    deviation,
  };
}
