import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type LoopState = 
  | 'idle' 
  | 'scanning' 
  | 'analyzing' 
  | 'executing' 
  | 'monitoring' 
  | 'closing' 
  | 'cooldown';

export interface TradingLoopState {
  loopState: LoopState;
  idleReason: string;
  nextScanIn: number; // seconds
  lastAction: string;
  lastActionTime: Date | null;
  pairsScanned: number;
  totalPairs: number;
  bestOpportunity: {
    pair: string;
    volatility: number;
    direction: 'long' | 'short';
  } | null;
  autoTriggerEnabled: boolean;
  isAutoTriggering: boolean;
  openPositionsCount: number;
  maxPositions: number;
  consecutiveIdleCycles: number;
}

interface UseTradingLoopMonitorOptions {
  botRunning: boolean;
  tradeIntervalMs: number;
  onAutoTrigger?: () => void;
}

export function useTradingLoopMonitor({ 
  botRunning, 
  tradeIntervalMs = 60000,
  onAutoTrigger 
}: UseTradingLoopMonitorOptions) {
  const { user } = useAuth();
  const [state, setState] = useState<TradingLoopState>({
    loopState: 'idle',
    idleReason: 'Bot not running',
    nextScanIn: 0,
    lastAction: 'None',
    lastActionTime: null,
    pairsScanned: 0,
    totalPairs: 15,
    bestOpportunity: null,
    autoTriggerEnabled: true,
    isAutoTriggering: false,
    openPositionsCount: 0,
    maxPositions: 6,
    consecutiveIdleCycles: 0,
  });

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const autoTriggerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTradeTimeRef = useRef<Date | null>(null);

  // Fetch open positions count
  const fetchOpenPositions = useCallback(async () => {
    if (!user?.id) return 0;
    
    const { count } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    return count || 0;
  }, [user?.id]);

  // Fetch last trade time
  const fetchLastTrade = useCallback(async () => {
    if (!user?.id) return null;
    
    const { data } = await supabase
      .from('trades')
      .select('closed_at, created_at, pair, profit_loss')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      const lastTime = data.closed_at ? new Date(data.closed_at) : new Date(data.created_at);
      lastTradeTimeRef.current = lastTime;
      return {
        time: lastTime,
        pair: data.pair,
        pnl: data.profit_loss,
      };
    }
    return null;
  }, [user?.id]);

  // Determine idle reason based on conditions
  const determineIdleReason = useCallback(async (): Promise<string> => {
    if (!botRunning) return 'Bot not running';
    
    const openCount = await fetchOpenPositions();
    if (openCount >= state.maxPositions) {
      return `Max positions reached (${openCount}/${state.maxPositions})`;
    }
    
    // Check volatility threshold (simulated)
    if (state.bestOpportunity && state.bestOpportunity.volatility < 0.3) {
      return `Waiting for volatility > 0.3% (current: ${state.bestOpportunity.volatility.toFixed(2)}%)`;
    }
    
    // Check rate limiting
    const now = Date.now();
    if (lastTradeTimeRef.current) {
      const timeSinceLastTrade = now - lastTradeTimeRef.current.getTime();
      if (timeSinceLastTrade < tradeIntervalMs) {
        const remainingMs = tradeIntervalMs - timeSinceLastTrade;
        return `Rate limit cooldown (${Math.ceil(remainingMs / 1000)}s remaining)`;
      }
    }
    
    return 'Scanning for opportunities...';
  }, [botRunning, fetchOpenPositions, state.maxPositions, state.bestOpportunity, tradeIntervalMs]);

  // Auto-trigger next trade when conditions are met
  const triggerNextTrade = useCallback(async () => {
    if (!state.autoTriggerEnabled || !botRunning) return;
    
    const openCount = await fetchOpenPositions();
    if (openCount >= state.maxPositions) return;
    
    const now = Date.now();
    if (lastTradeTimeRef.current) {
      const timeSinceLastTrade = now - lastTradeTimeRef.current.getTime();
      if (timeSinceLastTrade < tradeIntervalMs) return;
    }
    
    setState(prev => ({ ...prev, isAutoTriggering: true, loopState: 'executing' }));
    
    try {
      onAutoTrigger?.();
    } finally {
      setTimeout(() => {
        setState(prev => ({ ...prev, isAutoTriggering: false, loopState: 'scanning' }));
      }, 2000);
    }
  }, [state.autoTriggerEnabled, botRunning, fetchOpenPositions, state.maxPositions, tradeIntervalMs, onAutoTrigger]);

  // Toggle auto-trigger
  const toggleAutoTrigger = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, autoTriggerEnabled: enabled }));
  }, []);

  // Update loop state based on conditions
  useEffect(() => {
    if (!botRunning) {
      setState(prev => ({
        ...prev,
        loopState: 'idle',
        idleReason: 'Bot not running',
        nextScanIn: 0,
      }));
      return;
    }

    const updateState = async () => {
      const openCount = await fetchOpenPositions();
      const lastTrade = await fetchLastTrade();
      const idleReason = await determineIdleReason();
      
      // Calculate next scan time
      let nextScanIn = 0;
      if (lastTradeTimeRef.current) {
        const timeSinceLastTrade = Date.now() - lastTradeTimeRef.current.getTime();
        const remaining = Math.max(0, tradeIntervalMs - timeSinceLastTrade);
        nextScanIn = Math.ceil(remaining / 1000);
      }

      // Determine loop state
      let loopState: LoopState = 'scanning';
      if (openCount > 0 && openCount < state.maxPositions) {
        loopState = 'monitoring';
      } else if (openCount >= state.maxPositions) {
        loopState = 'monitoring';
      } else if (nextScanIn > 0) {
        loopState = 'cooldown';
      }

      setState(prev => ({
        ...prev,
        loopState,
        idleReason,
        nextScanIn,
        lastAction: lastTrade ? `Traded ${lastTrade.pair} ${lastTrade.pnl !== null ? (lastTrade.pnl >= 0 ? '+' : '') + '$' + lastTrade.pnl.toFixed(2) : ''}` : 'None',
        lastActionTime: lastTrade?.time || null,
        openPositionsCount: openCount,
        pairsScanned: 15,
        consecutiveIdleCycles: nextScanIn > 0 ? prev.consecutiveIdleCycles + 1 : 0,
      }));

      // Auto-trigger if conditions are met
      if (state.autoTriggerEnabled && loopState === 'scanning' && openCount < state.maxPositions && nextScanIn === 0) {
        triggerNextTrade();
      }
    };

    updateState();
    const interval = setInterval(updateState, 2000);
    
    return () => clearInterval(interval);
  }, [botRunning, fetchOpenPositions, fetchLastTrade, determineIdleReason, tradeIntervalMs, state.maxPositions, state.autoTriggerEnabled, triggerNextTrade]);

  // Countdown timer
  useEffect(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    if (state.nextScanIn > 0 && botRunning) {
      countdownRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          nextScanIn: Math.max(0, prev.nextScanIn - 1),
        }));
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [state.nextScanIn, botRunning]);

  return {
    ...state,
    toggleAutoTrigger,
    triggerNextTrade,
    refresh: async () => {
      const openCount = await fetchOpenPositions();
      const lastTrade = await fetchLastTrade();
      setState(prev => ({
        ...prev,
        openPositionsCount: openCount,
        lastAction: lastTrade ? `Traded ${lastTrade.pair}` : 'None',
        lastActionTime: lastTrade?.time || null,
      }));
    },
  };
}
