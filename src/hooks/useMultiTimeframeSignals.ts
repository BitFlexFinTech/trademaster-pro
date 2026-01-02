import { useState, useEffect, useCallback, useRef } from 'react';

export interface MTFSignal {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  momentum: number; // percentage change
}

export interface MTFAnalysis {
  m1: MTFSignal;
  m3: MTFSignal;
  m5: MTFSignal;
  alignment: 'aligned_long' | 'aligned_short' | 'mixed';
  confidence: number; // 0-100
}

const REFRESH_INTERVAL = 10000; // 10 seconds

// Fetch kline data from Binance
async function fetchKlineData(symbol: string, interval: '1m' | '3m' | '5m', limit: number = 5): Promise<{
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[]> {
  try {
    const normalizedSymbol = symbol.replace('/', '');
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${normalizedSymbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((k: any[]) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.error(`Failed to fetch ${interval} klines for ${symbol}:`, e);
    return [];
  }
}

// Calculate momentum for a timeframe
function calculateMomentum(candles: { open: number; close: number }[]): number {
  if (candles.length < 2) return 0;
  const recentClose = candles[candles.length - 1].close;
  const olderClose = candles[0].close;
  return ((recentClose - olderClose) / olderClose) * 100;
}

// Convert momentum to signal
function momentumToSignal(momentum: number, threshold: number): MTFSignal {
  const absStrength = Math.min(100, Math.abs(momentum) * 20); // Scale momentum to 0-100
  
  if (momentum > threshold) {
    return { direction: 'bullish', strength: absStrength, momentum };
  } else if (momentum < -threshold) {
    return { direction: 'bearish', strength: absStrength, momentum };
  }
  return { direction: 'neutral', strength: absStrength, momentum };
}

// Analyze all timeframes
async function analyzeSymbol(symbol: string): Promise<MTFAnalysis | null> {
  try {
    const [m1Data, m3Data, m5Data] = await Promise.all([
      fetchKlineData(symbol, '1m', 5),
      fetchKlineData(symbol, '3m', 5),
      fetchKlineData(symbol, '5m', 5),
    ]);

    if (m1Data.length === 0 || m3Data.length === 0 || m5Data.length === 0) {
      return null;
    }

    const m1Momentum = calculateMomentum(m1Data);
    const m3Momentum = calculateMomentum(m3Data);
    const m5Momentum = calculateMomentum(m5Data);

    // Different thresholds per timeframe (faster TFs need smaller moves)
    const m1 = momentumToSignal(m1Momentum, 0.02); // 0.02%
    const m3 = momentumToSignal(m3Momentum, 0.03); // 0.03%
    const m5 = momentumToSignal(m5Momentum, 0.05); // 0.05%

    // Determine alignment
    const bullishCount = [m1, m3, m5].filter(s => s.direction === 'bullish').length;
    const bearishCount = [m1, m3, m5].filter(s => s.direction === 'bearish').length;

    let alignment: MTFAnalysis['alignment'] = 'mixed';
    let confidence = 0;

    if (bullishCount >= 2) {
      alignment = 'aligned_long';
      // Weight: 1m = 50%, 3m = 30%, 5m = 20%
      confidence = 
        (m1.direction === 'bullish' ? 50 : 0) +
        (m3.direction === 'bullish' ? 30 : 0) +
        (m5.direction === 'bullish' ? 20 : 0);
    } else if (bearishCount >= 2) {
      alignment = 'aligned_short';
      confidence = 
        (m1.direction === 'bearish' ? 50 : 0) +
        (m3.direction === 'bearish' ? 30 : 0) +
        (m5.direction === 'bearish' ? 20 : 0);
    } else {
      confidence = 33; // Mixed signals
    }

    return { m1, m3, m5, alignment, confidence };
  } catch (e) {
    console.error(`MTF analysis failed for ${symbol}:`, e);
    return null;
  }
}

export function useMultiTimeframeSignals(symbols: string[]) {
  const [signals, setSignals] = useState<Record<string, MTFAnalysis>>({});
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSignals = useCallback(async () => {
    if (symbols.length === 0) {
      setSignals({});
      setIsLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          const analysis = await analyzeSymbol(symbol);
          return { symbol, analysis };
        })
      );

      const newSignals: Record<string, MTFAnalysis> = {};
      results.forEach(({ symbol, analysis }) => {
        if (analysis) {
          newSignals[symbol] = analysis;
        }
      });

      setSignals(newSignals);
    } catch (e) {
      console.error('Failed to fetch MTF signals:', e);
    } finally {
      setIsLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    fetchSignals();
    intervalRef.current = setInterval(fetchSignals, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchSignals]);

  return { signals, isLoading, refresh: fetchSignals };
}
