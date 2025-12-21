import { useState, useEffect, useCallback, useRef } from 'react';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { calculateEMA } from '@/lib/technicalAnalysis';

export type RegimeType = 'BULL' | 'BEAR' | 'CHOP';

interface RegimeState {
  regime: RegimeType;
  ema200: number;
  currentPrice: number;
  deviation: number;
  adaptiveTarget: number;
  focusDirection: 'long' | 'short' | 'scalp';
  regimeAge: number;
  lastTransition: Date | null;
  isLoading: boolean;
  error: string | null;
}

interface UseJarvisRegimeReturn extends RegimeState {
  refetch: () => Promise<void>;
}

// Default regime thresholds
const DEFAULT_BULL_DEVIATION = 0.005; // 0.5%
const DEFAULT_BEAR_DEVIATION = -0.005; // -0.5%
const DEFAULT_BULL_TARGET = 2.10;
const DEFAULT_BEAR_TARGET = 2.10;
const DEFAULT_CHOP_TARGET = 1.00;

export function useJarvisRegime(symbol: string = 'BTCUSDT'): UseJarvisRegimeReturn {
  const { tickers } = useBinanceWebSocket();
  const { settings } = useJarvisSettings();
  const { user } = useAuth();
  
  const [state, setState] = useState<RegimeState>({
    regime: 'CHOP',
    ema200: 0,
    currentPrice: 0,
    deviation: 0,
    adaptiveTarget: DEFAULT_CHOP_TARGET,
    focusDirection: 'scalp',
    regimeAge: 0,
    lastTransition: null,
    isLoading: true,
    error: null,
  });
  
  const lastRegimeRef = useRef<RegimeType>('CHOP');
  const lastTransitionRef = useRef<Date | null>(null);
  const ema200Ref = useRef<number>(0);
  const priceHistoryRef = useRef<number[]>([]);
  const currentRegimeIdRef = useRef<string | null>(null);
  const tradesInRegimeRef = useRef<number>(0);
  const pnlInRegimeRef = useRef<number>(0);

  // Persist regime transition to database
  const persistRegimeTransition = useCallback(async (
    newRegime: RegimeType,
    price: number,
    ema200: number,
    deviation: number
  ) => {
    if (!user?.id) return;

    try {
      // Close previous regime if exists
      if (currentRegimeIdRef.current) {
        const previousTransition = lastTransitionRef.current;
        const durationMinutes = previousTransition 
          ? Math.floor((Date.now() - previousTransition.getTime()) / 60000)
          : 0;

        await supabase
          .from('regime_history')
          .update({
            ended_at: new Date().toISOString(),
            duration_minutes: durationMinutes,
            trades_during_regime: tradesInRegimeRef.current,
            pnl_during_regime: pnlInRegimeRef.current,
          })
          .eq('id', currentRegimeIdRef.current);

        console.log(`[useJarvisRegime] Closed regime ${lastRegimeRef.current}: ${durationMinutes}min, ${tradesInRegimeRef.current} trades, $${pnlInRegimeRef.current.toFixed(2)} P&L`);
      }

      // Insert new regime record
      const { data, error } = await supabase
        .from('regime_history')
        .insert({
          user_id: user.id,
          symbol,
          regime: newRegime,
          ema200,
          price,
          deviation,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      currentRegimeIdRef.current = data.id;
      tradesInRegimeRef.current = 0;
      pnlInRegimeRef.current = 0;

      console.log(`[useJarvisRegime] Started new regime ${newRegime}: ID ${data.id}`);
    } catch (error) {
      console.error('[useJarvisRegime] Failed to persist regime transition:', error);
    }
  }, [user?.id, symbol]);

  // Fetch historical data for EMA calculation
  const fetchHistoricalData = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1h&limit=200`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch klines');
      }
      
      const klines = await response.json();
      const closePrices = klines.map((k: any[]) => parseFloat(k[4]));
      
      priceHistoryRef.current = closePrices;
      
      const ema = calculateEMA(closePrices, 200);
      ema200Ref.current = typeof ema === 'number' ? ema : 0;
      
      console.log('[useJarvisRegime] 200 EMA calculated:', ema200Ref.current.toFixed(2));
      
      setState(prev => ({
        ...prev,
        ema200: ema200Ref.current,
        isLoading: false,
        error: null,
      }));
      
    } catch (error) {
      console.error('[useJarvisRegime] Error fetching historical data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch data',
      }));
    }
  }, [symbol]);

  // Initial fetch
  useEffect(() => {
    fetchHistoricalData();
    
    const interval = setInterval(fetchHistoricalData, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHistoricalData]);

  // Update regime based on real-time price
  useEffect(() => {
    const symbolLower = symbol.toLowerCase().replace('usdt', '') + 'usdt';
    const ticker = tickers.find(t => t.symbol.toLowerCase() === symbolLower);
    
    if (!ticker || ema200Ref.current === 0) return;
    
    const currentPrice = ticker.price;
    const ema200 = ema200Ref.current;
    const deviation = (currentPrice - ema200) / ema200;
    
    const bullThreshold = settings?.regime_bull_ema_deviation ?? DEFAULT_BULL_DEVIATION;
    const bearThreshold = settings?.regime_bear_ema_deviation ?? DEFAULT_BEAR_DEVIATION;
    const bullTarget = settings?.target_bull_profit ?? DEFAULT_BULL_TARGET;
    const bearTarget = settings?.target_bear_profit ?? DEFAULT_BEAR_TARGET;
    const chopTarget = settings?.target_chop_profit ?? DEFAULT_CHOP_TARGET;
    
    let regime: RegimeType;
    let adaptiveTarget: number;
    let focusDirection: 'long' | 'short' | 'scalp';
    
    if (deviation >= bullThreshold) {
      regime = 'BULL';
      adaptiveTarget = bullTarget;
      focusDirection = 'long';
    } else if (deviation <= bearThreshold) {
      regime = 'BEAR';
      adaptiveTarget = bearTarget;
      focusDirection = 'short';
    } else {
      regime = 'CHOP';
      adaptiveTarget = chopTarget;
      focusDirection = 'scalp';
    }
    
    // Check for regime transition
    if (regime !== lastRegimeRef.current) {
      console.log(`[useJarvisRegime] Regime transition: ${lastRegimeRef.current} → ${regime}`);
      
      // Persist to database
      persistRegimeTransition(regime, currentPrice, ema200, deviation);
      
      // Broadcast regime change globally for instant sync across all components
      supabase.channel('jarvis-regime-broadcast').send({
        type: 'broadcast',
        event: 'regime_changed',
        payload: { 
          regime, 
          deviation: deviation * 100, 
          symbol,
          previousRegime: lastRegimeRef.current,
          timestamp: new Date().toISOString(),
        }
      });
      
      lastRegimeRef.current = regime;
      lastTransitionRef.current = new Date();
    }
    
    const regimeAge = lastTransitionRef.current 
      ? Math.floor((Date.now() - lastTransitionRef.current.getTime()) / 60000)
      : 0;
    
    setState({
      regime,
      ema200,
      currentPrice,
      deviation: deviation * 100,
      adaptiveTarget,
      focusDirection,
      regimeAge,
      lastTransition: lastTransitionRef.current,
      isLoading: false,
      error: null,
    });
    
  }, [tickers, symbol, settings, persistRegimeTransition]);

  return {
    ...state,
    refetch: fetchHistoricalData,
  };
}
