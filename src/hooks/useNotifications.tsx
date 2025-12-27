import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// Notification sounds - Base64 encoded for instant playback
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+';

// Win sound - pleasant rising chime
const WIN_SOUND = 'data:audio/wav;base64,UklGRl9vT19teleVuZSIiIiIiIiIiIiIkZWVlZWVlZWVlZGRkZGNjY2NjY2JiYmJiYmJhYWFhYWFhYGBgYGBgYF9fX19fX19e3t7e3t7e3d3d3d3d3dzc3Nzc3NzVFRUVFRUVFRUUFBQUFBQUExMTExMTExJSUlJSUlJSUVFRUVFRUVBQUFBQUFBQT09PT09PT05OTk5OTk5OTk5KSkpKSkpKSklJSUlJSUlJSEhISEhISEhHR0dHR0dHR0ZGRkZGRkZGRUVFRUVFRUVEREREREREQ0NDQ0NDQ0NCQkJCQkJCQkFBQUFBQUFBQEBAQEBAQEA/Pz8/Pz8/Pz4+Pj4+Pj4+PT09PT09PTw8PDw8PDw7Ozs7Ozs7Ozo6Ojo6Ojo5OTk5OTk5ODg4ODg4ODc3Nzc3Nzc2NjY2NjY2NTU1NTU1NTQ0NDQ0NDQzMzMzMzMzMjIyMjIyMjExMTExMTEwMDAwMDAwLy8vLy8vLy4uLi4uLi4tLS0tLS0tLCwsLCwsLCsrKysrKysqKioqKioqKSkpKSkpKSgoKCgoKCgnJycnJycnJiYmJiYmJiUlJSUlJSUkJCQkJCQkIyMjIyMjIyIiIiIiIiIhISEhISEhICAgICAgIB8fHx8fHx8eHh4eHh4eHR0dHR0dHRwcHBwcHBwbGxsbGxsbGhoaGhoaGhkZGRkZGRkYGBgYGBgYFxcXFxcXFxYWFhYWFhYVFRUVFRUVFBQUFBQUFBMTExMTExMSEhISEhISERERERERERERJCQkJCQkJCYmJiYmJiYoKCgoKCgoKisrKysrKystLS0tLS0tLy8vLy8vLzExMTExMTEzMzMzMzMzNTU1NTU1NTc3Nzc3Nzc5OTk5OTk5Ozs7Ozs7Oz09PT09PT0/Pz8/Pz8/QUFBQUFBQUNDQ0NDQ0NFRUVFRUVFRUdHR0dHR0dJSUlJSUlJSUtLS0tLS0tNTU1NTU1NT09PT09PT1FRUVFRUVFTV1VVVVVVVVVXV1dXV1dXWVlZWVlZWVtbW1tbW1tdXV1dXV1dX19fX19fX2FhYWFhYWFjY2NjY2NjZWVlZWVlZWdnZ2dnZ2dpampqampqa2tra2tra21tbW1tbW9vb29vb29xcXFxcXFxc3Nzc3Nzc3V1dXV1dXV3d3d3d3d3eXl5eXl5eXt7e3t7e3t9fX19fX19f39/f39/f4GBgYGBgYGDg4ODg4ODhYWFhYWFhYeHh4eHh4eJiYmJiYmJi4uLi4uLi42NjY2NjY2Pj4+Pj4+PkZGRkZGRkZOTk5OTk5OVlZWVlZWVl5eXl5eXl5mZmZmZmZmbm5ubm5ubnZ2dnZ2dnQ==';

// Loss sound - subtle low tone
const LOSS_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+f35+fXx8e3t6eXl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEA';

// Target reached sound - celebration fanfare
const TARGET_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdJKVmZydnZ2dm5qYlpSSkI6MioiGhIKAfn17eXd1c3FvbWtpZ2VjYV9dW1lXVVNRUE5MS0lHRURCQD8+PDs6ODc2NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQBCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/';

// URGENT ALARM - Critical alerts (liquidation < 22%, API cooldown)
const URGENT_ALARM_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YSgAAP//////////////////////////////////////////////////////////////////////////AAAA//////////////////////////////////////////////////////////////////////////////////8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAAD///8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//';

// WARNING ALERT - Approaching thresholds (liquidation 22-25%, API 80-95%)
const WARNING_ALERT_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YSgAAAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AAD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8=';

// REGIME CHANGE - Distinctive transition chime
const REGIME_CHANGE_SOUND = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YSgAAP///wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/';

interface NotificationSettings {
  soundEnabled: boolean;
  pushEnabled: boolean;
  profitThreshold: number;
}

export function useNotifications() {
  const { toast } = useToast();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const lossAudioRef = useRef<HTMLAudioElement | null>(null);
  const targetAudioRef = useRef<HTMLAudioElement | null>(null);
  const urgentAlarmRef = useRef<HTMLAudioElement | null>(null);
  const warningAlertRef = useRef<HTMLAudioElement | null>(null);
  const regimeChangeRef = useRef<HTMLAudioElement | null>(null);
  
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem('notificationSoundEnabled');
    return stored !== null ? stored === 'true' : true;
  });
  const soundEnabledRef = useRef(soundEnabled);
  
  const settingsRef = useRef<NotificationSettings>({
    soundEnabled: true,
    pushEnabled: true,
    profitThreshold: 0.5,
  });

  // Initialize audio elements
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
    
    winAudioRef.current = new Audio(WIN_SOUND);
    winAudioRef.current.volume = 0.6;
    
    lossAudioRef.current = new Audio(LOSS_SOUND);
    lossAudioRef.current.volume = 0.4;
    
    targetAudioRef.current = new Audio(TARGET_SOUND);
    targetAudioRef.current.volume = 0.7;

    urgentAlarmRef.current = new Audio(URGENT_ALARM_SOUND);
    urgentAlarmRef.current.volume = 0.9;

    warningAlertRef.current = new Audio(WARNING_ALERT_SOUND);
    warningAlertRef.current.volume = 0.7;

    regimeChangeRef.current = new Audio(REGIME_CHANGE_SOUND);
    regimeChangeRef.current.volume = 0.6;
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    localStorage.setItem('notificationSoundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  // Fetch user notification settings
  useEffect(() => {
    if (!user) return;

    const fetchSettings = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('notification_sounds, push_notifications, profit_threshold')
        .eq('user_id', user.id)
        .single();

      if (data) {
        settingsRef.current = {
          soundEnabled: data.notification_sounds ?? true,
          pushEnabled: data.push_notifications ?? true,
          profitThreshold: Number(data.profit_threshold) || 0.5,
        };
      }
    };

    fetchSettings();
  }, [user]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => !prev);
  }, []);

  const playSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const playWinSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && winAudioRef.current) {
      winAudioRef.current.currentTime = 0;
      winAudioRef.current.play().catch(() => {});
    }
  }, []);

  const playLossSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && lossAudioRef.current) {
      lossAudioRef.current.currentTime = 0;
      lossAudioRef.current.play().catch(() => {});
    }
  }, []);

  const playTargetSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && targetAudioRef.current) {
      targetAudioRef.current.currentTime = 0;
      targetAudioRef.current.play().catch(() => {});
    }
  }, []);

  const playUrgentAlarmSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && urgentAlarmRef.current) {
      urgentAlarmRef.current.currentTime = 0;
      urgentAlarmRef.current.play().catch(() => {});
    }
  }, []);

  const playWarningAlertSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && warningAlertRef.current) {
      warningAlertRef.current.currentTime = 0;
      warningAlertRef.current.play().catch(() => {});
    }
  }, []);

  const playRegimeChangeSound = useCallback(() => {
    if (soundEnabledRef.current && settingsRef.current.soundEnabled && regimeChangeRef.current) {
      regimeChangeRef.current.currentTime = 0;
      regimeChangeRef.current.play().catch(() => {});
    }
  }, []);

  const requestPushPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  const sendPushNotification = useCallback((title: string, body: string, icon?: string) => {
    if (settingsRef.current.pushEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'arbterminal',
        requireInteraction: false,
      });
    }
  }, []);

  const notifyHighProfit = useCallback((pair: string, profit: number, buyExchange: string, sellExchange: string) => {
    if (profit >= settingsRef.current.profitThreshold) {
      playWinSound();
      
      toast({
        title: '🚀 High Profit Opportunity!',
        description: `${pair}: ${profit.toFixed(2)}% profit (${buyExchange} → ${sellExchange})`,
        duration: 10000,
      });

      sendPushNotification(
        '🚀 High Profit Arbitrage!',
        `${pair}: ${profit.toFixed(2)}% profit between ${buyExchange} and ${sellExchange}`
      );
    }
  }, [playWinSound, toast, sendPushNotification]);

  const notifySignal = useCallback((pair: string, direction: 'long' | 'short', profit: number) => {
    playSound();
    
    toast({
      title: `📊 New ${direction.toUpperCase()} Signal`,
      description: `${pair}: Potential ${profit.toFixed(2)}% profit`,
      duration: 8000,
    });

    sendPushNotification(
      `📊 New Trading Signal`,
      `${direction.toUpperCase()} ${pair}: ${profit.toFixed(2)}% potential profit`
    );
  }, [playSound, toast, sendPushNotification]);

  const notify = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    playSound();
    
    toast({
      title,
      description: message,
      variant: type === 'error' ? 'destructive' : 'default',
    });

    if (settingsRef.current.pushEnabled) {
      sendPushNotification(title, message);
    }
  }, [playSound, toast, sendPushNotification]);

  // Save alert to database
  const saveAlert = useCallback(async (alertType: string, title: string, message: string, data?: any) => {
    if (!user) return;

    await supabase.from('alerts').insert({
      user_id: user.id,
      alert_type: alertType,
      title,
      message,
      data,
    });
  }, [user]);

  // Filter to only notify for exchanges with USDT balance
  const notifyTrade = useCallback((
    exchange: string,
    pair: string,
    direction: 'long' | 'short',
    profit: number,
    exchangeBalances?: { exchange: string; usdtBalance: number }[]
  ) => {
    // CRITICAL: Validate required fields - skip invalid notifications
    if (!exchange || !pair || !direction) {
      console.warn('[NOTIFICATION] Skipping trade notification - missing required fields:', { exchange, pair, direction });
      return;
    }
    
    // Ensure profit is a valid number
    if (!Number.isFinite(profit)) {
      console.warn('[NOTIFICATION] Skipping trade notification - invalid profit value:', profit);
      return;
    }
    
    // CRITICAL: Only notify if exchange has balance (or no balance info provided)
    if (exchangeBalances && exchangeBalances.length > 0) {
      const hasBalance = exchangeBalances.some(
        b => b.exchange === exchange && b.usdtBalance > 0
      );
      if (!hasBalance) {
        console.log(`[NOTIFICATION] Skipping notification for ${exchange} - no USDT balance`);
        return;
      }
    }
    
    // Play appropriate sound based on profit
    if (profit >= 0) {
      playWinSound();
    } else {
      playLossSound();
    }
    
    const isProfit = profit >= 0;
    toast({
      title: `💰 Trade on ${exchange}`,
      description: `${direction.toUpperCase()} ${pair}: ${isProfit ? '+' : ''}$${profit.toFixed(2)}`,
      duration: 5000,
      variant: isProfit ? 'default' : 'destructive',
    });

    if (settingsRef.current.pushEnabled) {
      sendPushNotification(
        `Trade Executed`,
        `${direction.toUpperCase()} ${pair} on ${exchange}: ${isProfit ? '+' : ''}$${profit.toFixed(2)}`
      );
    }
  }, [playWinSound, playLossSound, toast, sendPushNotification]);

  const notifyTakeProfit = useCallback((
    level: number,
    pair: string,
    profit: number
  ) => {
    playWinSound();
    
    toast({
      title: `🎯 Take Profit ${level} Hit!`,
      description: `${pair}: +$${profit.toFixed(2)} locked in`,
      duration: 5000,
    });
  }, [playWinSound, toast]);

  // Track which progress thresholds have been notified - PERSIST TO LOCALSTORAGE
  const getStorageKey = () => {
    const today = new Date().toDateString();
    return `notifiedThresholds-${today}`;
  };

  // Initialize from localStorage
  const initNotifiedThresholds = (): Set<number> => {
    try {
      const today = new Date().toDateString();
      const lastNotifiedDate = localStorage.getItem('lastNotifiedDate');
      
      // Reset if it's a new day
      if (lastNotifiedDate !== today) {
        localStorage.setItem('lastNotifiedDate', today);
        localStorage.setItem(getStorageKey(), '[]');
        // Clean up old day's storage
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('notifiedThresholds-') && key !== getStorageKey()) {
            localStorage.removeItem(key);
          }
        });
        return new Set<number>();
      }
      
      const stored = localStorage.getItem(getStorageKey());
      return new Set<number>(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set<number>();
    }
  };

  const notifiedThresholdsRef = useRef<Set<number>>(initNotifiedThresholds());

  // Persist notified thresholds to localStorage
  const persistNotifiedThresholds = useCallback(() => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify([...notifiedThresholdsRef.current]));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const notifyDailyProgress = useCallback((
    currentPnL: number,
    dailyTarget: number,
    botName: string
  ) => {
    const progressPercent = (currentPnL / dailyTarget) * 100;
    const thresholds = [50, 75, 90, 100];
    
    for (const threshold of thresholds) {
      if (progressPercent >= threshold && !notifiedThresholdsRef.current.has(threshold)) {
        notifiedThresholdsRef.current.add(threshold);
        persistNotifiedThresholds(); // Persist immediately
        
        // Special celebration sound for 100%
        if (threshold === 100) {
          playTargetSound();
        } else {
          playWinSound();
        }
        
        const messages: Record<number, { title: string; desc: string }> = {
          50: { title: '📈 Halfway There!', desc: `${botName} at 50% of daily target ($${currentPnL.toFixed(2)}/$${dailyTarget})` },
          75: { title: '🔥 Almost There!', desc: `${botName} at 75% of daily target ($${currentPnL.toFixed(2)}/$${dailyTarget})` },
          90: { title: '⚡ So Close!', desc: `${botName} at 90% of daily target ($${currentPnL.toFixed(2)}/$${dailyTarget})` },
          100: { title: '🎯 Target Reached!', desc: `${botName} hit $${dailyTarget} daily target! Bot continues running.` },
        };
        
        const msg = messages[threshold];
        toast({
          title: msg.title,
          description: msg.desc,
          duration: threshold === 100 ? 10000 : 5000,
        });

        if (settingsRef.current.pushEnabled) {
          sendPushNotification(msg.title, msg.desc);
        }
        break; // Only notify one threshold at a time
      }
    }
  }, [playWinSound, playTargetSound, toast, sendPushNotification, persistNotifiedThresholds]);

  const resetProgressNotifications = useCallback(() => {
    notifiedThresholdsRef.current.clear();
    persistNotifiedThresholds();
  }, [persistNotifiedThresholds]);

  // Sentinel-specific alert notification
  const notifySentinelAlert = useCallback((
    type: 'liquidation' | 'rate',
    severity: 'warning' | 'critical',
    message: string
  ) => {
    if (severity === 'critical') {
      playUrgentAlarmSound();
    } else {
      playWarningAlertSound();
    }

    toast({
      title: type === 'liquidation' 
        ? (severity === 'critical' ? '🚨 Liquidation Critical' : '⚠️ Liquidation Warning')
        : (severity === 'critical' ? '🔴 API Rate Limit' : '⚠️ API Load Warning'),
      description: message,
      variant: 'destructive',
      duration: severity === 'critical' ? 10000 : 5000,
    });

    sendPushNotification(
      severity === 'critical' ? '🚨 CRITICAL ALERT' : '⚠️ Warning',
      message
    );
  }, [playUrgentAlarmSound, playWarningAlertSound, toast, sendPushNotification]);

  return {
    notify,
    notifyHighProfit,
    notifySignal,
    notifyTrade,
    notifyTakeProfit,
    notifyDailyProgress,
    resetProgressNotifications,
    notifySentinelAlert,
    playSound,
    playWinSound,
    playLossSound,
    playTargetSound,
    playUrgentAlarmSound,
    playWarningAlertSound,
    playRegimeChangeSound,
    requestPushPermission,
    saveAlert,
    soundEnabled,
    toggleSound,
  };
}