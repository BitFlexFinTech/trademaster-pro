import { useState, useEffect, useCallback, useRef } from 'react';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useJarvisFuturesPositions } from '@/hooks/useJarvisFuturesPositions';
import { useNotifications } from '@/hooks/useNotifications';

export type RateStatus = 'ok' | 'warning' | 'cooldown';
export type LiquidationAlertLevel = 'safe' | 'warning' | 'critical';

interface RateSentinelState {
  load: number;
  status: RateStatus;
  color: 'green' | 'yellow' | 'red';
  requestsPerMinute: number;
  cooldownEndsAt: Date | null;
  isInCooldown: boolean;
}

interface LiquidationSentinelState {
  longDistance: number | null;
  shortDistance: number | null;
  minDistance: number;
  alertLevel: LiquidationAlertLevel;
  longLiqPrice: number | null;
  shortLiqPrice: number | null;
}

interface SentinelAlert {
  type: 'rate' | 'liquidation';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: Date;
}

interface UseJarvisSentinelsReturn {
  rate: RateSentinelState;
  liquidation: LiquidationSentinelState;
  alerts: SentinelAlert[];
  clearAlerts: () => void;
  trackApiCall: () => void;
}

// Default thresholds
const DEFAULT_RATE_COOLDOWN_THRESHOLD = 0.80; // 80%
const DEFAULT_RATE_COOLDOWN_DURATION = 60000; // 60 seconds
const DEFAULT_LIQUIDATION_WARNING = 25; // 25%
const DEFAULT_LIQUIDATION_CRITICAL = 22; // 22%
const MAX_REQUESTS_PER_MINUTE = 1200; // Binance limit

export function useJarvisSentinels(): UseJarvisSentinelsReturn {
  const { settings } = useJarvisSettings();
  const { longPosition, shortPosition } = useJarvisFuturesPositions();
  const { notify, notifySentinelAlert } = useNotifications();
  
  const [rateState, setRateState] = useState<RateSentinelState>({
    load: 0,
    status: 'ok',
    color: 'green',
    requestsPerMinute: 0,
    cooldownEndsAt: null,
    isInCooldown: false,
  });
  
  const [liquidationState, setLiquidationState] = useState<LiquidationSentinelState>({
    longDistance: null,
    shortDistance: null,
    minDistance: 100,
    alertLevel: 'safe',
    longLiqPrice: null,
    shortLiqPrice: null,
  });
  
  const [alerts, setAlerts] = useState<SentinelAlert[]>([]);
  
  // Track API calls in the last minute
  const apiCallsRef = useRef<number[]>([]);
  const lastAlertRef = useRef<{ rate: number; liquidation: number }>({ rate: 0, liquidation: 0 });

  // Track a new API call
  const trackApiCall = useCallback(() => {
    const now = Date.now();
    apiCallsRef.current.push(now);
    
    // Remove calls older than 1 minute
    apiCallsRef.current = apiCallsRef.current.filter(t => now - t < 60000);
  }, []);

  // Rate sentinel monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Clean old calls
      apiCallsRef.current = apiCallsRef.current.filter(t => now - t < 60000);
      
      const requestsPerMinute = apiCallsRef.current.length;
      const load = (requestsPerMinute / MAX_REQUESTS_PER_MINUTE) * 100;
      
      const cooldownThreshold = (settings?.rate_cooldown_threshold ?? DEFAULT_RATE_COOLDOWN_THRESHOLD) * 100;
      
      let status: RateStatus;
      let color: 'green' | 'yellow' | 'red';
      let cooldownEndsAt: Date | null = rateState.cooldownEndsAt;
      let isInCooldown = rateState.isInCooldown;
      
      // Check if we're exiting cooldown
      if (isInCooldown && cooldownEndsAt && now > cooldownEndsAt.getTime()) {
        isInCooldown = false;
        cooldownEndsAt = null;
      }
      
      // Determine status
      if (isInCooldown) {
        status = 'cooldown';
        color = 'red';
      } else if (load >= cooldownThreshold) {
        // Enter cooldown
        status = 'cooldown';
        color = 'red';
        isInCooldown = true;
        const cooldownDuration = settings?.rate_cooldown_duration_ms ?? DEFAULT_RATE_COOLDOWN_DURATION;
        cooldownEndsAt = new Date(now + cooldownDuration);
        
        // Alert if not recently alerted
        if (now - lastAlertRef.current.rate > 60000) {
          const alert: SentinelAlert = {
            type: 'rate',
            severity: 'critical',
            message: `API rate limit exceeded (${load.toFixed(0)}%). Entering 60s cooldown.`,
            timestamp: new Date(),
          };
          setAlerts(prev => [...prev.slice(-9), alert]);
          notifySentinelAlert('rate', 'critical', alert.message);
          lastAlertRef.current.rate = now;
        }
      } else if (load >= 50) {
        status = 'warning';
        color = 'yellow';
        
        // Alert at 80%
        if (load >= 80 && now - lastAlertRef.current.rate > 30000) {
          const alert: SentinelAlert = {
            type: 'rate',
            severity: 'warning',
            message: `API load high (${load.toFixed(0)}%). Approaching rate limit.`,
            timestamp: new Date(),
          };
          setAlerts(prev => [...prev.slice(-9), alert]);
          notifySentinelAlert('rate', 'warning', alert.message);
          lastAlertRef.current.rate = now;
        }
      } else {
        status = 'ok';
        color = 'green';
      }
      
      setRateState({
        load,
        status,
        color,
        requestsPerMinute,
        cooldownEndsAt,
        isInCooldown,
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [settings, rateState.cooldownEndsAt, rateState.isInCooldown, notifySentinelAlert]);

  // Liquidation sentinel monitoring
  useEffect(() => {
    const warningThreshold = settings?.liquidation_warning_threshold ?? DEFAULT_LIQUIDATION_WARNING;
    const criticalThreshold = settings?.liquidation_critical_threshold ?? DEFAULT_LIQUIDATION_CRITICAL;
    
    const longDistance = longPosition?.liquidationDistance ?? null;
    const shortDistance = shortPosition?.liquidationDistance ?? null;
    const longLiqPrice = longPosition?.liquidationPrice ?? null;
    const shortLiqPrice = shortPosition?.liquidationPrice ?? null;
    
    // Calculate minimum distance
    let minDistance = 100;
    if (longDistance !== null && longDistance < minDistance) minDistance = longDistance;
    if (shortDistance !== null && shortDistance < minDistance) minDistance = shortDistance;
    
    // Determine alert level
    let alertLevel: LiquidationAlertLevel;
    if (minDistance < criticalThreshold) {
      alertLevel = 'critical';
    } else if (minDistance < warningThreshold) {
      alertLevel = 'warning';
    } else {
      alertLevel = 'safe';
    }
    
    // Check for alerts
    const now = Date.now();
    if (alertLevel !== 'safe' && now - lastAlertRef.current.liquidation > 30000) {
      const severity = alertLevel === 'critical' ? 'critical' : 'warning';
      const position = minDistance === longDistance ? 'LONG' : 'SHORT';
      const alert: SentinelAlert = {
        type: 'liquidation',
        severity,
        message: `${position} position liquidation distance: ${minDistance.toFixed(1)}%`,
        timestamp: new Date(),
      };
      setAlerts(prev => [...prev.slice(-9), alert]);
      notifySentinelAlert('liquidation', severity, alert.message);
      lastAlertRef.current.liquidation = now;
    }
    
    setLiquidationState({
      longDistance,
      shortDistance,
      minDistance,
      alertLevel,
      longLiqPrice,
      shortLiqPrice,
    });
  }, [longPosition, shortPosition, settings, notifySentinelAlert]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    rate: rateState,
    liquidation: liquidationState,
    alerts,
    clearAlerts,
    trackApiCall,
  };
}
