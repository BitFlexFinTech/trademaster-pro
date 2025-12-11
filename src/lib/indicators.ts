// Technical Indicator Calculations

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Simple Moving Average
export function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = data.slice(i - period + 1, i + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// Exponential Moving Average
export function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      // First EMA is SMA
      const slice = data.slice(0, period);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      result.push(sma);
    } else {
      const prevEMA = result[i - 1];
      if (prevEMA !== null) {
        const ema = (data[i] - prevEMA) * multiplier + prevEMA;
        result.push(ema);
      } else {
        result.push(null);
      }
    }
  }
  return result;
}

// Relative Strength Index
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      result.push(null);
      continue;
    }
    
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
    
    if (i < period) {
      result.push(null);
      continue;
    }
    
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }
  
  return result;
}

// MACD (Moving Average Convergence Divergence)
export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  const macdLine: (number | null)[] = emaFast.map((fast, i) => {
    const slow = emaSlow[i];
    if (fast === null || slow === null) return null;
    return fast - slow;
  });
  
  // Calculate signal line (EMA of MACD)
  const validMacd = macdLine.filter((v): v is number => v !== null);
  const signalEMA = calculateEMA(validMacd, signalPeriod);
  
  // Align signal with MACD
  const signal: (number | null)[] = [];
  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signal.push(null);
    } else {
      signal.push(signalEMA[signalIdx] ?? null);
      signalIdx++;
    }
  }
  
  // Calculate histogram
  const histogram: (number | null)[] = macdLine.map((m, i) => {
    const s = signal[i];
    if (m === null || s === null) return null;
    return m - s;
  });
  
  return { macd: macdLine, signal, histogram };
}

// Bollinger Bands
export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsResult {
  const sma = calculateSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  
  for (let i = 0; i < closes.length; i++) {
    const middle = sma[i];
    if (middle === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    
    const slice = closes.slice(i - period + 1, i + 1);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    upper.push(middle + stdDevMultiplier * stdDev);
    lower.push(middle - stdDevMultiplier * stdDev);
  }
  
  return { upper, middle: sma, lower };
}

// Format indicator data for lightweight-charts
export function formatLineData(
  times: number[],
  values: (number | null)[]
): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    if (values[i] !== null) {
      result.push({ time: times[i], value: values[i] });
    }
  }
  return result;
}

export function formatHistogramData(
  times: number[],
  values: (number | null)[]
): { time: number; value: number; color: string }[] {
  const result: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < times.length; i++) {
    if (values[i] !== null) {
      result.push({
        time: times[i],
        value: values[i],
        color: values[i] >= 0 ? '#00FF88' : '#FF4444',
      });
    }
  }
  return result;
}
