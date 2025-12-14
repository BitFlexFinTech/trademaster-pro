import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+';

interface NotificationSettings {
  soundEnabled: boolean;
  pushEnabled: boolean;
  profitThreshold: number;
}

export function useNotifications() {
  const { toast } = useToast();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const settingsRef = useRef<NotificationSettings>({
    soundEnabled: true,
    pushEnabled: true,
    profitThreshold: 0.5,
  });

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;
  }, []);

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

  const playSound = useCallback(() => {
    if (settingsRef.current.soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Ignore autoplay errors
      });
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
      playSound();
      
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
  }, [playSound, toast, sendPushNotification]);

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

  const notifyTrade = useCallback((
    exchange: string,
    pair: string,
    direction: 'long' | 'short',
    profit: number
  ) => {
    playSound();
    
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
  }, [playSound, toast, sendPushNotification]);

  const notifyTakeProfit = useCallback((
    level: number,
    pair: string,
    profit: number
  ) => {
    playSound();
    
    toast({
      title: `🎯 Take Profit ${level} Hit!`,
      description: `${pair}: +$${profit.toFixed(2)} locked in`,
      duration: 5000,
    });
  }, [playSound, toast]);

  return {
    notify,
    notifyHighProfit,
    notifySignal,
    notifyTrade,
    notifyTakeProfit,
    playSound,
    requestPushPermission,
    saveAlert,
  };
}