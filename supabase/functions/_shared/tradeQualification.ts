/**
 * Trade Qualification Filter - Edge Function Version
 * 6-Factor Analysis for Fast Trade Selection
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TradeSignal {
  symbol: string;
  pair: string;
  exchange: string;
  direction: 'long' | 'short';
  entryPrice: number;
  profitTargetPercent: number;
  patternType?: string;
  timeframe: string;
}

export interface MarketData {
  momentum: number;
  volatility: number;
  volumeSurge: number;
  spread: number;
  currentPrice: number;
}

export interface QualificationResult {
  enter: boolean;
  reason: string;
  expectedDuration: number | null;
  confidence: number;
}

// Thresholds for fast trade qualification
const THRESHOLDS = {
  MAX_EXPECTED_DURATION_SECONDS: 300, // 5 minutes
  MIN_MOMENTUM_PERCENT: 0.002, // 0.2% minimum momentum
  MIN_VOLATILITY_MULTIPLIER: 2, // Volatility must be 2x profit target
  MIN_VOLUME_SURGE: 1.5, // 1.5x average volume
  MAX_SPREAD_PERCENT: 0.001, // 0.1% max spread
  MIN_TIME_OF_DAY_SCORE: 0.6, // 60% historical win rate at this hour
};

// Allowed trading timeframes
const ALLOWED_TIMEFRAMES = ['1m', '3m', '5m'];

export function validateTimeframe(tf: string): boolean {
  return ALLOWED_TIMEFRAMES.includes(tf);
}

interface SpeedAnalyticsRow {
  avg_duration_seconds: number | null;
  sample_size: number | null;
}

interface RejectedTradeInsert {
  user_id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  rejection_reason: string;
  pattern_type: string | null;
  momentum: number;
  volatility: number;
  volume_surge: number;
  spread_percent: number;
  expected_duration: number | null;
  price_at_rejection: number;
}

/**
 * Get historical speed data for symbol
 */
export async function getHistoricalSpeedData(
  supabaseClient: any,
  userId: string,
  symbol: string,
  timeframe: string
): Promise<{ avgDuration: number; sampleSize: number }> {
  try {
    const { data } = await supabaseClient
      .from('trade_speed_analytics')
      .select('avg_duration_seconds, sample_size')
      .eq('user_id', userId)
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .maybeSingle() as { data: SpeedAnalyticsRow | null };

    if (data && (data.sample_size || 0) >= 5) {
      return {
        avgDuration: data.avg_duration_seconds || 180,
        sampleSize: data.sample_size || 0,
      };
    }
  } catch (e) {
    console.warn('Failed to fetch speed analytics:', e);
  }

  return { avgDuration: 180, sampleSize: 0 };
}

/**
 * Predict trade duration based on current conditions
 */
export function predictDuration(factors: {
  historical: number;
  momentum: number;
  volatility: number;
  volume: number;
  spread: number;
}): number {
  let prediction = factors.historical;

  // Strong momentum cuts time
  if (factors.momentum > 0.004) prediction *= 0.7;
  else if (factors.momentum > 0.003) prediction *= 0.8;
  else if (factors.momentum > 0.002) prediction *= 0.9;

  // High volatility cuts time
  if (factors.volatility > 0.008) prediction *= 0.75;
  else if (factors.volatility > 0.005) prediction *= 0.85;
  else if (factors.volatility > 0.003) prediction *= 0.9;

  // Volume surge cuts time
  if (factors.volume > 3.0) prediction *= 0.8;
  else if (factors.volume > 2.0) prediction *= 0.85;
  else if (factors.volume > 1.5) prediction *= 0.9;

  // Tight spread improves time
  if (factors.spread < 0.0005) prediction *= 0.9;
  else if (factors.spread < 0.001) prediction *= 0.95;

  return Math.round(prediction);
}

/**
 * Calculate confidence score
 */
export function calculateConfidence(factors: {
  momentumPassed: boolean;
  momentumValue: number;
  volatilityPassed: boolean;
  volatilityValue: number;
  volumePassed: boolean;
  volumeValue: number;
  spreadPassed: boolean;
  spreadValue: number;
}): number {
  let score = 0;
  const weights = { momentum: 0.30, volatility: 0.25, volume: 0.25, spread: 0.20 };

  if (factors.momentumPassed) score += weights.momentum * (0.7 + Math.min(factors.momentumValue / 0.01, 0.3));
  if (factors.volatilityPassed) score += weights.volatility * (0.7 + Math.min(factors.volatilityValue / 0.02, 0.3));
  if (factors.volumePassed) score += weights.volume * (0.7 + Math.min((factors.volumeValue - 1.5) / 3, 0.3));
  if (factors.spreadPassed) score += weights.spread * (1 - factors.spreadValue / 0.002);

  return Math.round(score * 100) / 100;
}

/**
 * Main qualification check
 */
export async function shouldEnterTrade(
  supabaseClient: any,
  userId: string,
  signal: TradeSignal,
  marketData: MarketData
): Promise<QualificationResult> {
  // Validate timeframe
  if (!validateTimeframe(signal.timeframe)) {
    return {
      enter: false,
      reason: `Invalid timeframe: ${signal.timeframe}. Only 1m, 3m, 5m allowed.`,
      expectedDuration: null,
      confidence: 0,
    };
  }

  // Factor 1: Historical Speed
  const historical = await getHistoricalSpeedData(supabaseClient, userId, signal.symbol, signal.timeframe);

  if (historical.avgDuration > THRESHOLDS.MAX_EXPECTED_DURATION_SECONDS && historical.sampleSize >= 10) {
    return {
      enter: false,
      reason: `Historical avg duration: ${historical.avgDuration}s exceeds 300s`,
      expectedDuration: historical.avgDuration,
      confidence: 0,
    };
  }

  // Factor 2: Momentum
  const momentumStrength = Math.abs(marketData.momentum);
  if (momentumStrength < THRESHOLDS.MIN_MOMENTUM_PERCENT) {
    return {
      enter: false,
      reason: `Momentum ${(momentumStrength * 100).toFixed(3)}% too weak`,
      expectedDuration: null,
      confidence: 0,
    };
  }

  // Factor 3: Volatility
  const requiredVolatility = signal.profitTargetPercent * THRESHOLDS.MIN_VOLATILITY_MULTIPLIER;
  if (marketData.volatility < requiredVolatility) {
    return {
      enter: false,
      reason: `Volatility ${(marketData.volatility * 100).toFixed(2)}% insufficient`,
      expectedDuration: null,
      confidence: 0,
    };
  }

  // Factor 4: Volume
  if (marketData.volumeSurge < THRESHOLDS.MIN_VOLUME_SURGE) {
    return {
      enter: false,
      reason: `Volume surge ${marketData.volumeSurge.toFixed(2)}x too low`,
      expectedDuration: null,
      confidence: 0,
    };
  }

  // Factor 5: Spread
  if (marketData.spread > THRESHOLDS.MAX_SPREAD_PERCENT) {
    return {
      enter: false,
      reason: `Spread ${(marketData.spread * 100).toFixed(3)}% too wide`,
      expectedDuration: null,
      confidence: 0,
    };
  }

  // Calculate predicted duration
  const predictedDuration = predictDuration({
    historical: historical.avgDuration,
    momentum: momentumStrength,
    volatility: marketData.volatility,
    volume: marketData.volumeSurge,
    spread: marketData.spread,
  });

  if (predictedDuration > THRESHOLDS.MAX_EXPECTED_DURATION_SECONDS) {
    return {
      enter: false,
      reason: `Predicted duration ${predictedDuration}s exceeds 300s`,
      expectedDuration: predictedDuration,
      confidence: 0,
    };
  }

  // Calculate confidence
  const confidence = calculateConfidence({
    momentumPassed: true,
    momentumValue: momentumStrength,
    volatilityPassed: true,
    volatilityValue: marketData.volatility,
    volumePassed: true,
    volumeValue: marketData.volumeSurge,
    spreadPassed: true,
    spreadValue: marketData.spread,
  });

  return {
    enter: true,
    reason: `All checks passed - predicted ${predictedDuration}s to profit`,
    expectedDuration: predictedDuration,
    confidence,
  };
}

/**
 * Log rejected trade
 */
export async function logRejection(
  supabaseClient: any,
  userId: string,
  signal: TradeSignal,
  marketData: MarketData,
  reason: string,
  expectedDuration: number | null
): Promise<void> {
  try {
    const insertData: RejectedTradeInsert = {
      user_id: userId,
      symbol: signal.symbol,
      exchange: signal.exchange,
      timeframe: signal.timeframe,
      rejection_reason: reason,
      pattern_type: signal.patternType || null,
      momentum: marketData.momentum,
      volatility: marketData.volatility,
      volume_surge: marketData.volumeSurge,
      spread_percent: marketData.spread,
      expected_duration: expectedDuration,
      price_at_rejection: signal.entryPrice,
    };
    await supabaseClient.from('rejected_trades').insert(insertData);
  } catch (e) {
    console.warn('Failed to log rejected trade:', e);
  }
}
