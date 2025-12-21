import { useState, useEffect, useCallback, useRef } from 'react';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
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

  // Fetch historical data for EMA calculation
  const fetchHistoricalData = useCallback(async () => {
    try {
      const symbolLower = symbol.toLowerCase();
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1h&limit=200`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch klines');
      }
      
      const klines = await response.json();
      const closePrices = klines.map((k: any[]) => parseFloat(k[4])); // Close price is index 4
      
      priceHistoryRef.current = closePrices;
      
      // Calculate 200 EMA - the function returns a single number
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
    
    // Refresh EMA every hour
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
    
    // Get thresholds from settings or use defaults
    const bullThreshold = settings?.regime_bull_ema_deviation ?? DEFAULT_BULL_DEVIATION;
    const bearThreshold = settings?.regime_bear_ema_deviation ?? DEFAULT_BEAR_DEVIATION;
    const bullTarget = settings?.target_bull_profit ?? DEFAULT_BULL_TARGET;
    const bearTarget = settings?.target_bear_profit ?? DEFAULT_BEAR_TARGET;
    const chopTarget = settings?.target_chop_profit ?? DEFAULT_CHOP_TARGET;
    
    // Determine regime
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
      lastRegimeRef.current = regime;
      lastTransitionRef.current = new Date();
    }
    
    // Calculate regime age in minutes
    const regimeAge = lastTransitionRef.current 
      ? Math.floor((Date.now() - lastTransitionRef.current.getTime()) / 60000)
      : 0;
    
    setState({
      regime,
      ema200,
      currentPrice,
      deviation: deviation * 100, // Convert to percentage
      adaptiveTarget,
      focusDirection,
      regimeAge,
      lastTransition: lastTransitionRef.current,
      isLoading: false,
      error: null,
    });
    
  }, [tickers, symbol, settings]);

  return {
    ...state,
    refetch: fetchHistoricalData,
  };
}
