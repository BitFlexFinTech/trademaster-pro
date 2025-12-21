import { useState, useEffect, useRef } from 'react';
import { useJarvisRegime, RegimeType } from '@/hooks/useJarvisRegime';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { calculateRSI, calculateVolumeRatio } from '@/lib/technicalAnalysis';

export type SuggestionType = 'entry' | 'exit' | 'hold' | 'warning';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

interface AISuggestion {
  type: SuggestionType;
  direction: 'long' | 'short' | 'neutral';
  message: string;
  confidence: ConfidenceLevel;
  timestamp: Date;
}

interface RegimeHistoryEntry {
  regime: RegimeType;
  startTime: Date;
  duration: number;
}

interface UseJarvisAIAdvisorReturn {
  suggestions: AISuggestion[];
  currentAnalysis: string;
  regimeHistory: RegimeHistoryEntry[];
  isLoading: boolean;
  lastAnalysis: Date | null;
}

export function useJarvisAIAdvisor(symbol: string = 'BTCUSDT'): UseJarvisAIAdvisorReturn {
  const { regime, ema200, currentPrice, deviation, lastTransition, regimeAge } = useJarvisRegime(symbol);
  const { tickers } = useBinanceWebSocket();
  
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState('Initializing JARVIS AI Advisor...');
  const [regimeHistory, setRegimeHistory] = useState<RegimeHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null);
  
  const lastRegimeRef = useRef<RegimeType | null>(null);
  const priceHistoryRef = useRef<number[]>([]);
  const volumeHistoryRef = useRef<number[]>([]);

  // Track price and volume history
  useEffect(() => {
    const symbolLower = symbol.toLowerCase().replace('usdt', '') + 'usdt';
    const ticker = tickers.find(t => t.symbol.toLowerCase() === symbolLower);
    
    if (ticker) {
      priceHistoryRef.current = [...priceHistoryRef.current.slice(-99), ticker.price];
      volumeHistoryRef.current = [...volumeHistoryRef.current.slice(-99), ticker.volume];
    }
  }, [tickers, symbol]);

  // Analyze regime transitions
  useEffect(() => {
    if (!lastTransition) return;
    
    // Detect regime change
    if (lastRegimeRef.current !== null && lastRegimeRef.current !== regime) {
      // Record history
      const entry: RegimeHistoryEntry = {
        regime: lastRegimeRef.current,
        startTime: new Date(lastTransition.getTime() - regimeAge * 60000),
        duration: regimeAge,
      };
      setRegimeHistory(prev => [...prev.slice(-9), entry]);
      
      // Generate transition suggestion
      const transitionSuggestion = generateTransitionSuggestion(lastRegimeRef.current, regime);
      setSuggestions(prev => [...prev.slice(-4), transitionSuggestion]);
    }
    
    lastRegimeRef.current = regime;
  }, [regime, lastTransition, regimeAge]);

  // Generate analysis based on current conditions
  useEffect(() => {
    if (ema200 === 0 || currentPrice === 0) return;
    
    const prices = priceHistoryRef.current;
    const volumes = volumeHistoryRef.current;
    
    if (prices.length < 14) {
      setCurrentAnalysis('Collecting price data for analysis...');
      setIsLoading(true);
      return;
    }
    
    setIsLoading(false);
    
    // Calculate indicators
    const currentRSI = prices.length >= 14 ? calculateRSI(prices, 14) ?? 50 : 50;
    
    // Simple MACD signal based on EMA crossover direction
    const shortEMA = prices.slice(-12).reduce((a, b) => a + b, 0) / 12;
    const longEMA = prices.slice(-26).reduce((a, b) => a + b, 0) / 26;
    const macdSignal = shortEMA - longEMA;
    
    const volumeRatio = volumes.length >= 20 ? calculateVolumeRatio(volumes, 20) ?? 1 : 1;
    
    // Generate analysis
    let analysis = '';
    const newSuggestions: AISuggestion[] = [];
    
    // Regime-based analysis
    if (regime === 'BULL') {
      analysis = `BULL regime confirmed. Price ${deviation.toFixed(2)}% above 200 EMA ($${ema200.toFixed(2)}). `;
      
      if (volumeRatio > 1.5) {
        analysis += `Strong volume (${volumeRatio.toFixed(1)}x avg) confirms trend. `;
        newSuggestions.push({
          type: 'hold',
          direction: 'long',
          message: 'Strong volume confirms BULL trend. Hold LONG positions.',
          confidence: 'high',
          timestamp: new Date(),
        });
      }
      
      if (currentRSI > 70) {
        analysis += `RSI overbought (${currentRSI.toFixed(0)}). Consider taking partial profits. `;
        newSuggestions.push({
          type: 'warning',
          direction: 'long',
          message: `RSI overbought at ${currentRSI.toFixed(0)}. Consider scaling out.`,
          confidence: 'medium',
          timestamp: new Date(),
        });
      } else if (currentRSI < 40) {
        analysis += `RSI pullback (${currentRSI.toFixed(0)}). Good entry zone for LONGs. `;
        newSuggestions.push({
          type: 'entry',
          direction: 'long',
          message: 'RSI pullback in BULL regime. Favorable LONG entry.',
          confidence: 'high',
          timestamp: new Date(),
        });
      }
    } else if (regime === 'BEAR') {
      analysis = `BEAR regime active. Price ${Math.abs(deviation).toFixed(2)}% below 200 EMA ($${ema200.toFixed(2)}). `;
      
      if (volumeRatio > 1.5) {
        analysis += `High selling volume (${volumeRatio.toFixed(1)}x avg). `;
        newSuggestions.push({
          type: 'hold',
          direction: 'short',
          message: 'Strong selling volume. Maintain SHORT bias.',
          confidence: 'high',
          timestamp: new Date(),
        });
      }
      
      if (currentRSI < 30) {
        analysis += `RSI oversold (${currentRSI.toFixed(0)}). Bounce possible. `;
        newSuggestions.push({
          type: 'warning',
          direction: 'short',
          message: `RSI oversold at ${currentRSI.toFixed(0)}. Watch for dead cat bounce.`,
          confidence: 'medium',
          timestamp: new Date(),
        });
      } else if (currentRSI > 60) {
        analysis += `RSI bounce (${currentRSI.toFixed(0)}). Good entry for SHORTs. `;
        newSuggestions.push({
          type: 'entry',
          direction: 'short',
          message: 'RSI bounce in BEAR regime. Favorable SHORT entry.',
          confidence: 'high',
          timestamp: new Date(),
        });
      }
    } else {
      analysis = `CHOP regime. Price within ±0.5% of 200 EMA ($${ema200.toFixed(2)}). `;
      analysis += 'Scalping mode recommended. Reduce position sizes. ';
      
      if (macdSignal > 0) {
        analysis += 'MACD bullish crossover. ';
        newSuggestions.push({
          type: 'entry',
          direction: 'long',
          message: 'MACD bullish in CHOP. Quick scalp LONG opportunity.',
          confidence: 'low',
          timestamp: new Date(),
        });
      } else if (macdSignal < 0) {
        analysis += 'MACD bearish crossover. ';
        newSuggestions.push({
          type: 'entry',
          direction: 'short',
          message: 'MACD bearish in CHOP. Quick scalp SHORT opportunity.',
          confidence: 'low',
          timestamp: new Date(),
        });
      }
    }
    
    // EMA proximity analysis
    const emaDistance = Math.abs(currentPrice - ema200);
    const emaDistancePercent = (emaDistance / ema200) * 100;
    
    if (emaDistancePercent < 0.2) {
      analysis += 'Price at EMA - expect increased volatility. ';
      newSuggestions.push({
        type: 'warning',
        direction: 'neutral',
        message: 'Price touching 200 EMA. Breakout or breakdown imminent.',
        confidence: 'medium',
        timestamp: new Date(),
      });
    }
    
    setCurrentAnalysis(analysis);
    
    if (newSuggestions.length > 0) {
      setSuggestions(prev => {
        const combined = [...prev, ...newSuggestions];
        // Keep only unique suggestions (by message) and last 5
        const unique = combined.filter((s, i, arr) => 
          arr.findIndex(x => x.message === s.message) === i
        );
        return unique.slice(-5);
      });
    }
    
    setLastAnalysis(new Date());
  }, [regime, ema200, currentPrice, deviation, tickers, symbol]);

  return {
    suggestions,
    currentAnalysis,
    regimeHistory,
    isLoading,
    lastAnalysis,
  };
}

function generateTransitionSuggestion(from: RegimeType, to: RegimeType): AISuggestion {
  const transitions: Record<string, AISuggestion> = {
    'CHOP_BULL': {
      type: 'entry',
      direction: 'long',
      message: 'Regime transitioning CHOP → BULL. Open LONG positions at next pullback to EMA.',
      confidence: 'high',
      timestamp: new Date(),
    },
    'CHOP_BEAR': {
      type: 'entry',
      direction: 'short',
      message: 'Regime transitioning CHOP → BEAR. Open SHORT positions at next bounce.',
      confidence: 'high',
      timestamp: new Date(),
    },
    'BULL_CHOP': {
      type: 'exit',
      direction: 'long',
      message: 'BULL → CHOP transition. Take profits on LONG positions. Reduce size.',
      confidence: 'medium',
      timestamp: new Date(),
    },
    'BULL_BEAR': {
      type: 'exit',
      direction: 'long',
      message: 'BULL → BEAR reversal! Exit all LONGs. Consider SHORT entries.',
      confidence: 'high',
      timestamp: new Date(),
    },
    'BEAR_CHOP': {
      type: 'exit',
      direction: 'short',
      message: 'BEAR → CHOP transition. Cover SHORT positions. Wait for clarity.',
      confidence: 'medium',
      timestamp: new Date(),
    },
    'BEAR_BULL': {
      type: 'exit',
      direction: 'short',
      message: 'BEAR → BULL reversal! Cover all SHORTs. Consider LONG entries.',
      confidence: 'high',
      timestamp: new Date(),
    },
  };
  
  const key = `${from}_${to}`;
  return transitions[key] || {
    type: 'warning',
    direction: 'neutral',
    message: `Regime changed from ${from} to ${to}.`,
    confidence: 'low',
    timestamp: new Date(),
  };
}
