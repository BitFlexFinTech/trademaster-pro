// ============================================
// AI Pair Analyzer with Technical Indicators
// Replaces random pair selection with real analysis
// Uses RSI, momentum, and volume scoring
// ============================================

import type { ScannerOpportunity } from '@/stores/types';

/**
 * Detailed pair analysis score
 */
export interface PairScore {
  symbol: string;
  score: number;           // 0-100 composite score
  direction: 'long' | 'short';
  confidence: number;      // 0-1
  indicators: {
    rsi: number | null;
    momentum: number;      // 24h price change %
    volumeScore: number;   // Volume relative to threshold
    volatility: number;    // High/Low range %
    spread: number;        // Bid/ask spread estimate %
  };
  reasoning: string;
  timestamp: number;
}

/**
 * Calculate RSI from price changes
 * Simplified RSI calculation without historical data
 * Uses momentum as a proxy for RSI direction
 */
function estimateRSI(momentum: number): number {
  // Convert momentum (-10 to +10%) to RSI-like scale (0-100)
  // Strong positive momentum = high RSI (overbought territory)
  // Strong negative momentum = low RSI (oversold territory)
  const normalized = 50 + (momentum * 5);
  return Math.max(0, Math.min(100, normalized));
}

/**
 * Calculate momentum score (40% weight)
 * Based on 24h price change percentage
 */
function calculateMomentumScore(momentum: number): { score: number; direction: 'long' | 'short' } {
  const absMomentum = Math.abs(momentum);
  
  // Need at least 0.5% movement to consider trading
  if (absMomentum < 0.5) {
    return { score: 0, direction: 'long' };
  }
  
  // Score increases with momentum strength, capped at 100
  // 0.5% = 20 points, 1% = 40 points, 2% = 80 points, 2.5%+ = 100 points
  const score = Math.min(100, absMomentum * 40);
  
  // Determine direction based on momentum sign
  const direction: 'long' | 'short' = momentum > 0 ? 'long' : 'short';
  
  return { score, direction };
}

/**
 * Calculate volume score (30% weight)
 * Higher volume = better liquidity for fast execution
 */
function calculateVolumeScore(volume24h: number): number {
  const MIN_VOLUME = 1_000_000;      // $1M minimum
  const IDEAL_VOLUME = 100_000_000;  // $100M ideal
  
  if (volume24h < MIN_VOLUME) {
    return 0; // Too low liquidity
  }
  
  // Log scale to handle wide range of volumes
  const logVolume = Math.log10(volume24h);
  const logMin = Math.log10(MIN_VOLUME);
  const logIdeal = Math.log10(IDEAL_VOLUME);
  
  const score = ((logVolume - logMin) / (logIdeal - logMin)) * 100;
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate volatility score (20% weight)
 * Higher volatility = faster profit target achievement
 */
function calculateVolatilityScore(momentum: number): number {
  const volatility = Math.abs(momentum);
  
  // Too low volatility = slow profit
  if (volatility < 0.3) return 20;
  
  // Ideal volatility range: 0.5% - 3%
  if (volatility >= 0.5 && volatility <= 3) {
    return 80 + (volatility * 5);
  }
  
  // Too high volatility = risky
  if (volatility > 5) return 50;
  
  return Math.min(100, volatility * 30);
}

/**
 * Estimate spread score (10% weight)
 * Lower spread = lower trading costs
 * High volume pairs typically have lower spreads
 */
function calculateSpreadScore(volume24h: number): number {
  // Estimate spread based on volume (inverse relationship)
  const estimatedSpread = volume24h > 50_000_000 ? 0.02 :
                          volume24h > 10_000_000 ? 0.05 :
                          volume24h > 1_000_000 ? 0.1 : 0.2;
  
  // Lower spread = higher score
  const score = Math.max(0, 100 - (estimatedSpread * 500));
  return score;
}

/**
 * Analyze a single trading pair
 */
export function analyzePair(
  symbol: string,
  price: number,
  change24h: number,
  volume24h: number
): PairScore {
  const rsi = estimateRSI(change24h);
  const { score: momentumScore, direction } = calculateMomentumScore(change24h);
  const volumeScore = calculateVolumeScore(volume24h);
  const volatilityScore = calculateVolatilityScore(change24h);
  const spreadScore = calculateSpreadScore(volume24h);
  
  // Composite score with weights
  const compositeScore = 
    (momentumScore * 0.40) +
    (volumeScore * 0.30) +
    (volatilityScore * 0.20) +
    (spreadScore * 0.10);
  
  // RSI-based direction refinement
  // Override direction if RSI suggests reversal opportunity
  let finalDirection = direction;
  let reasoning = '';
  
  if (rsi < 30 && change24h < 0) {
    // Oversold bounce opportunity
    finalDirection = 'long';
    reasoning = `Oversold (RSI ${rsi.toFixed(0)}) - bounce expected`;
  } else if (rsi > 70 && change24h > 0) {
    // Overbought reversal opportunity
    finalDirection = 'short';
    reasoning = `Overbought (RSI ${rsi.toFixed(0)}) - reversal expected`;
  } else if (change24h > 1) {
    reasoning = `Strong uptrend +${change24h.toFixed(2)}%`;
  } else if (change24h < -1) {
    reasoning = `Strong downtrend ${change24h.toFixed(2)}%`;
  } else {
    reasoning = `Weak signal (${change24h.toFixed(2)}%)`;
  }
  
  // Confidence based on score and volume
  const confidence = Math.min(0.95, compositeScore / 100);
  
  return {
    symbol,
    score: compositeScore,
    direction: finalDirection,
    confidence,
    indicators: {
      rsi,
      momentum: change24h,
      volumeScore,
      volatility: Math.abs(change24h),
      spread: volume24h > 50_000_000 ? 0.02 : 0.05,
    },
    reasoning,
    timestamp: Date.now(),
  };
}

/**
 * Analyze and rank all trading pairs
 */
export function rankPairs(
  prices: Record<string, number>,
  changes24h: Record<string, number>,
  volumes: Record<string, number>,
  excludePairs: string[] = []
): PairScore[] {
  const scores: PairScore[] = [];
  
  for (const symbol of Object.keys(prices)) {
    // Skip excluded pairs
    if (excludePairs.includes(symbol)) continue;
    
    // Skip pairs without required data
    if (!changes24h[symbol] || !volumes[symbol]) continue;
    
    // Only analyze USDT pairs for now
    if (!symbol.endsWith('USDT')) continue;
    
    const score = analyzePair(
      symbol,
      prices[symbol],
      changes24h[symbol],
      volumes[symbol]
    );
    
    // Only include pairs with minimum score threshold
    if (score.score >= 30) {
      scores.push(score);
    }
  }
  
  // Sort by score descending
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Find the best trading opportunity from market data
 */
export function findBestOpportunity(
  prices: Record<string, number>,
  changes24h: Record<string, number>,
  volumes: Record<string, number>,
  options: {
    minConfidence?: number;
    excludePairs?: string[];
    preferredExchanges?: string[];
  } = {}
): ScannerOpportunity | null {
  const {
    minConfidence = 0.70,
    excludePairs = [],
  } = options;
  
  const ranked = rankPairs(prices, changes24h, volumes, excludePairs);
  
  // Get top opportunity that meets confidence threshold
  const best = ranked.find(p => p.confidence >= minConfidence);
  
  if (!best) {
    return null;
  }
  
  return {
    symbol: best.symbol,
    exchange: 'Binance',
    timeframe: '1m',
    direction: best.direction,
    confidence: best.confidence,
    volatility: best.indicators.volatility / 100,
    expectedDurationMs: calculateExpectedDuration(best),
    priority: best.score,
    timestamp: Date.now(),
  };
}

/**
 * Calculate expected trade duration based on volatility
 * Higher volatility = faster profit target achievement
 */
function calculateExpectedDuration(score: PairScore): number {
  const baseMs = 60000; // 1 minute base
  const volatilityFactor = Math.max(0.1, score.indicators.volatility);
  
  // Higher volatility = shorter expected duration
  return Math.min(300000, baseMs / volatilityFactor);
}

/**
 * Get top N trading opportunities
 */
export function getTopOpportunities(
  prices: Record<string, number>,
  changes24h: Record<string, number>,
  volumes: Record<string, number>,
  count: number = 5,
  excludePairs: string[] = []
): ScannerOpportunity[] {
  const ranked = rankPairs(prices, changes24h, volumes, excludePairs);
  
  return ranked.slice(0, count).map(score => ({
    symbol: score.symbol,
    exchange: 'Binance',
    timeframe: '1m',
    direction: score.direction,
    confidence: score.confidence,
    volatility: score.indicators.volatility / 100,
    expectedDurationMs: calculateExpectedDuration(score),
    priority: score.score,
    timestamp: Date.now(),
  }));
}
