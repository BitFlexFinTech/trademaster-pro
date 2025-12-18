/**
 * Micro-Scalping Signal Generator
 * Multi-confirmed entry signals: Order Book Imbalance + VWAP + RSI(7)
 * Requires 2+ confirmations for entry
 */

import { GREENBACK_CONFIG } from './greenbackConfig';

export interface OrderBookData {
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp: number;
}

export interface PriceVolumeData {
  price: number;
  volume: number;
  timestamp: number;
}

export interface OrderBookImbalanceResult {
  delta: number;           // Positive = bid pressure, Negative = ask pressure
  side: 'bid' | 'ask' | 'neutral';
  strength: number;        // 0-1 signal strength
  largeWallDetected: boolean;
  absorptionActive: boolean;
}

export interface VWAPDeviationResult {
  vwap: number;
  currentPrice: number;
  deviation: number;       // As percentage
  revertIntent: boolean;   // True if price likely to revert to VWAP
  direction: 'above' | 'below' | 'at';
}

export interface RSI7Result {
  value: number;
  zone: 'oversold' | 'overbought' | 'neutral';
  strength: number;        // 0-1 signal strength
}

export interface MicroScalpSignal {
  direction: 'long' | 'short' | null;
  confidence: number;      // 0-100
  signals: {
    orderBookImbalance: OrderBookImbalanceResult;
    vwapDeviation: VWAPDeviationResult;
    rsi7: RSI7Result;
  };
  confluence: number;      // 0-3 number of aligned signals
  canTrade: boolean;
  reason: string;
  timestamp: number;
}

// Thresholds for signal generation
const THRESHOLDS = {
  orderBook: {
    minDelta: 0.15,        // 15% imbalance minimum
    strongDelta: 0.30,     // 30% for strong signal
    wallThreshold: 2.0,    // 2x average size = wall
  },
  vwap: {
    minDeviation: 0.10,    // 0.1% minimum deviation
    strongDeviation: 0.25, // 0.25% for strong signal
  },
  rsi: {
    oversoldThreshold: 30,
    overboughtThreshold: 70,
    extremeOversold: 20,
    extremeOverbought: 80,
  },
  confluence: {
    minForTrade: 2,        // Minimum 2 signals aligned
  },
};

/**
 * Calculate Order Book Imbalance
 */
export function calculateOrderBookImbalance(
  orderBook: OrderBookData,
  depth: number = 10
): OrderBookImbalanceResult {
  if (!orderBook.bids.length || !orderBook.asks.length) {
    return {
      delta: 0,
      side: 'neutral',
      strength: 0,
      largeWallDetected: false,
      absorptionActive: false,
    };
  }

  // Sum bid and ask volumes at top N levels
  const topBids = orderBook.bids.slice(0, depth);
  const topAsks = orderBook.asks.slice(0, depth);
  
  const bidVolume = topBids.reduce((sum, b) => sum + b.quantity, 0);
  const askVolume = topAsks.reduce((sum, a) => sum + a.quantity, 0);
  
  const totalVolume = bidVolume + askVolume;
  if (totalVolume === 0) {
    return { delta: 0, side: 'neutral', strength: 0, largeWallDetected: false, absorptionActive: false };
  }
  
  // Delta: positive = more bids (buying pressure), negative = more asks (selling pressure)
  const delta = (bidVolume - askVolume) / totalVolume;
  
  // Detect large walls
  const avgBidSize = bidVolume / topBids.length;
  const avgAskSize = askVolume / topAsks.length;
  const maxBidSize = Math.max(...topBids.map(b => b.quantity));
  const maxAskSize = Math.max(...topAsks.map(a => a.quantity));
  
  const bidWall = maxBidSize > avgBidSize * THRESHOLDS.orderBook.wallThreshold;
  const askWall = maxAskSize > avgAskSize * THRESHOLDS.orderBook.wallThreshold;
  
  // Determine side and strength
  let side: 'bid' | 'ask' | 'neutral' = 'neutral';
  let strength = 0;
  
  if (Math.abs(delta) >= THRESHOLDS.orderBook.strongDelta) {
    side = delta > 0 ? 'bid' : 'ask';
    strength = Math.min(1, Math.abs(delta) / 0.5); // Max out at 50% imbalance
  } else if (Math.abs(delta) >= THRESHOLDS.orderBook.minDelta) {
    side = delta > 0 ? 'bid' : 'ask';
    strength = Math.abs(delta) / THRESHOLDS.orderBook.strongDelta;
  }
  
  return {
    delta,
    side,
    strength,
    largeWallDetected: bidWall || askWall,
    absorptionActive: (bidWall && delta < 0) || (askWall && delta > 0),
  };
}

/**
 * Calculate VWAP and deviation
 */
export function calculateVWAPDeviation(
  priceVolumeData: PriceVolumeData[],
  currentPrice: number
): VWAPDeviationResult {
  if (priceVolumeData.length === 0) {
    return {
      vwap: currentPrice,
      currentPrice,
      deviation: 0,
      revertIntent: false,
      direction: 'at',
    };
  }
  
  // Calculate VWAP: Sum(Price * Volume) / Sum(Volume)
  let sumPV = 0;
  let sumV = 0;
  
  for (const data of priceVolumeData) {
    sumPV += data.price * data.volume;
    sumV += data.volume;
  }
  
  const vwap = sumV > 0 ? sumPV / sumV : currentPrice;
  const deviation = ((currentPrice - vwap) / vwap) * 100;
  
  // Determine direction
  let direction: 'above' | 'below' | 'at' = 'at';
  if (Math.abs(deviation) >= THRESHOLDS.vwap.minDeviation) {
    direction = deviation > 0 ? 'above' : 'below';
  }
  
  // Revert intent: price far from VWAP and likely to return
  const revertIntent = Math.abs(deviation) >= THRESHOLDS.vwap.strongDeviation;
  
  return {
    vwap,
    currentPrice,
    deviation,
    revertIntent,
    direction,
  };
}

/**
 * Calculate RSI with 7-period (micro timeframe)
 */
export function calculateRSI7(closes: number[]): RSI7Result {
  const period = 7;
  
  if (closes.length < period + 1) {
    return { value: 50, zone: 'neutral', strength: 0 };
  }
  
  const recentCloses = closes.slice(-period - 1);
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < recentCloses.length; i++) {
    const change = recentCloses[i] - recentCloses[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  let rsi: number;
  if (avgLoss === 0) {
    rsi = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
  }
  
  // Determine zone and strength
  let zone: 'oversold' | 'overbought' | 'neutral' = 'neutral';
  let strength = 0;
  
  if (rsi <= THRESHOLDS.rsi.extremeOversold) {
    zone = 'oversold';
    strength = 1;
  } else if (rsi <= THRESHOLDS.rsi.oversoldThreshold) {
    zone = 'oversold';
    strength = (THRESHOLDS.rsi.oversoldThreshold - rsi) / 
               (THRESHOLDS.rsi.oversoldThreshold - THRESHOLDS.rsi.extremeOversold);
  } else if (rsi >= THRESHOLDS.rsi.extremeOverbought) {
    zone = 'overbought';
    strength = 1;
  } else if (rsi >= THRESHOLDS.rsi.overboughtThreshold) {
    zone = 'overbought';
    strength = (rsi - THRESHOLDS.rsi.overboughtThreshold) / 
               (THRESHOLDS.rsi.extremeOverbought - THRESHOLDS.rsi.overboughtThreshold);
  }
  
  return { value: rsi, zone, strength };
}

/**
 * Generate micro-scalp signal with multi-confirmation
 */
export function generateMicroScalpSignal(
  orderBook: OrderBookData,
  priceVolumeData: PriceVolumeData[],
  closes: number[],
  currentPrice: number,
  spreadBps: number
): MicroScalpSignal {
  const timestamp = Date.now();
  
  // Check spread threshold first
  if (spreadBps > GREENBACK_CONFIG.spread_threshold_bps) {
    return {
      direction: null,
      confidence: 0,
      signals: {
        orderBookImbalance: { delta: 0, side: 'neutral', strength: 0, largeWallDetected: false, absorptionActive: false },
        vwapDeviation: { vwap: currentPrice, currentPrice, deviation: 0, revertIntent: false, direction: 'at' },
        rsi7: { value: 50, zone: 'neutral', strength: 0 },
      },
      confluence: 0,
      canTrade: false,
      reason: `Spread ${spreadBps.toFixed(2)}bps exceeds threshold ${GREENBACK_CONFIG.spread_threshold_bps}bps`,
      timestamp,
    };
  }
  
  // Calculate all signals
  const obSignal = calculateOrderBookImbalance(orderBook);
  const vwapSignal = calculateVWAPDeviation(priceVolumeData, currentPrice);
  const rsiSignal = calculateRSI7(closes);
  
  // Count signals for each direction
  let longCount = 0;
  let shortCount = 0;
  let totalStrength = 0;
  
  // Order book imbalance
  if (obSignal.side === 'bid' && obSignal.strength >= 0.5) {
    longCount++;
    totalStrength += obSignal.strength;
  } else if (obSignal.side === 'ask' && obSignal.strength >= 0.5) {
    shortCount++;
    totalStrength += obSignal.strength;
  }
  
  // VWAP deviation with reversion intent
  if (vwapSignal.revertIntent) {
    if (vwapSignal.direction === 'below') {
      longCount++; // Price below VWAP, expect to revert up
      totalStrength += 0.7;
    } else if (vwapSignal.direction === 'above') {
      shortCount++; // Price above VWAP, expect to revert down
      totalStrength += 0.7;
    }
  }
  
  // RSI(7) extreme zones
  if (rsiSignal.zone === 'oversold') {
    longCount++;
    totalStrength += rsiSignal.strength;
  } else if (rsiSignal.zone === 'overbought') {
    shortCount++;
    totalStrength += rsiSignal.strength;
  }
  
  // Determine direction based on confluence
  let direction: 'long' | 'short' | null = null;
  let confluence = 0;
  
  if (longCount >= THRESHOLDS.confluence.minForTrade && longCount > shortCount) {
    direction = 'long';
    confluence = longCount;
  } else if (shortCount >= THRESHOLDS.confluence.minForTrade && shortCount > longCount) {
    direction = 'short';
    confluence = shortCount;
  }
  
  // Calculate confidence (0-100)
  const avgStrength = confluence > 0 ? totalStrength / confluence : 0;
  const confidence = Math.min(100, Math.round(confluence * 30 + avgStrength * 20));
  
  // Determine if we can trade
  const canTrade = direction !== null && confluence >= THRESHOLDS.confluence.minForTrade;
  
  // Build reason string
  let reason = '';
  if (!canTrade) {
    if (confluence < THRESHOLDS.confluence.minForTrade) {
      reason = `Insufficient confluence: ${confluence}/${THRESHOLDS.confluence.minForTrade} signals`;
    } else {
      reason = 'No clear directional bias';
    }
  } else {
    reason = `${direction?.toUpperCase()} signal: ${confluence} confirmations (OB: ${obSignal.side}, VWAP: ${vwapSignal.direction}, RSI: ${rsiSignal.zone})`;
  }
  
  return {
    direction,
    confidence,
    signals: {
      orderBookImbalance: obSignal,
      vwapDeviation: vwapSignal,
      rsi7: rsiSignal,
    },
    confluence,
    canTrade,
    reason,
    timestamp,
  };
}

/**
 * Check if signal meets minimum quality threshold
 */
export function meetsSignalQuality(signal: MicroScalpSignal): boolean {
  return (
    signal.canTrade &&
    signal.confluence >= THRESHOLDS.confluence.minForTrade &&
    signal.confidence >= 50
  );
}
