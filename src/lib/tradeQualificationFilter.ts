/**
 * Trade Qualification Filter - 6-Factor Analysis for Fast Trade Selection
 * Only enter trades predicted to close within 5 minutes
 */

import { supabase } from '@/integrations/supabase/client';

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

export interface QualificationResult {
  enter: boolean;
  reason: string;
  expectedDuration: number | null;
  confidence: number;
  factors: {
    historicalSpeed: { passed: boolean; value: number; threshold: number };
    momentum: { passed: boolean; value: number; threshold: number };
    volatility: { passed: boolean; value: number; threshold: number };
    volumeSurge: { passed: boolean; value: number; threshold: number };
    spread: { passed: boolean; value: number; threshold: number };
    timeOfDay: { passed: boolean; value: number; threshold: number };
  };
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
const ALLOWED_TIMEFRAMES = ['1m', '3m', '5m'] as const;

export function validateTradingTimeframe(tf: string): void {
  if (!ALLOWED_TIMEFRAMES.includes(tf as any)) {
    throw new Error(
      `❌ INVALID TIMEFRAME: "${tf}" - HFT bot ONLY supports 1m, 3m, 5m. ` +
      `Using slow timeframes results in trades taking >5 minutes.`
    );
  }
}

class TradeQualificationFilter {
  private speedCache: Map<string, { avgDuration: number; sampleSize: number; lastUpdated: number }> = new Map();
  private readonly CACHE_TTL_MS = 300000; // 5 minute cache

  /**
   * Main qualification check - returns whether to enter the trade
   */
  async shouldEnterTrade(
    signal: TradeSignal,
    marketData: {
      momentum: number;
      volatility: number;
      volumeSurge: number;
      spread: number;
      currentPrice: number;
    },
    userId?: string
  ): Promise<QualificationResult> {
    const factors: QualificationResult['factors'] = {
      historicalSpeed: { passed: false, value: 0, threshold: THRESHOLDS.MAX_EXPECTED_DURATION_SECONDS },
      momentum: { passed: false, value: 0, threshold: THRESHOLDS.MIN_MOMENTUM_PERCENT },
      volatility: { passed: false, value: 0, threshold: signal.profitTargetPercent * THRESHOLDS.MIN_VOLATILITY_MULTIPLIER },
      volumeSurge: { passed: false, value: 0, threshold: THRESHOLDS.MIN_VOLUME_SURGE },
      spread: { passed: false, value: 0, threshold: THRESHOLDS.MAX_SPREAD_PERCENT },
      timeOfDay: { passed: false, value: 0, threshold: THRESHOLDS.MIN_TIME_OF_DAY_SCORE },
    };

    // Validate timeframe
    try {
      validateTradingTimeframe(signal.timeframe);
    } catch (e) {
      return {
        enter: false,
        reason: (e as Error).message,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // Factor 1: Historical Speed Analysis
    const historicalData = await this.getHistoricalSpeedData(signal, userId);
    factors.historicalSpeed.value = historicalData.avgDuration;
    factors.historicalSpeed.passed = historicalData.avgDuration <= THRESHOLDS.MAX_EXPECTED_DURATION_SECONDS;

    if (!factors.historicalSpeed.passed && historicalData.sampleSize >= 10) {
      return {
        enter: false,
        reason: `Historical avg duration: ${historicalData.avgDuration}s exceeds 300s threshold`,
        expectedDuration: historicalData.avgDuration,
        confidence: 0,
        factors,
      };
    }

    // Factor 2: Momentum Check
    const momentumStrength = Math.abs(marketData.momentum);
    factors.momentum.value = momentumStrength;
    factors.momentum.passed = momentumStrength >= THRESHOLDS.MIN_MOMENTUM_PERCENT;

    if (!factors.momentum.passed) {
      return {
        enter: false,
        reason: `Momentum ${(momentumStrength * 100).toFixed(3)}% below ${(THRESHOLDS.MIN_MOMENTUM_PERCENT * 100).toFixed(2)}% threshold`,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // Factor 3: Volatility Check
    const requiredVolatility = signal.profitTargetPercent * THRESHOLDS.MIN_VOLATILITY_MULTIPLIER;
    factors.volatility.value = marketData.volatility;
    factors.volatility.threshold = requiredVolatility;
    factors.volatility.passed = marketData.volatility >= requiredVolatility;

    if (!factors.volatility.passed) {
      return {
        enter: false,
        reason: `Volatility ${(marketData.volatility * 100).toFixed(2)}% insufficient for ${(signal.profitTargetPercent * 100).toFixed(2)}% target`,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // Factor 4: Volume Surge Check
    factors.volumeSurge.value = marketData.volumeSurge;
    factors.volumeSurge.passed = marketData.volumeSurge >= THRESHOLDS.MIN_VOLUME_SURGE;

    if (!factors.volumeSurge.passed) {
      return {
        enter: false,
        reason: `Volume surge ${marketData.volumeSurge.toFixed(2)}x below ${THRESHOLDS.MIN_VOLUME_SURGE}x threshold`,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // Factor 5: Spread Check
    const spreadPercent = marketData.spread;
    factors.spread.value = spreadPercent;
    factors.spread.passed = spreadPercent <= THRESHOLDS.MAX_SPREAD_PERCENT;

    if (!factors.spread.passed) {
      return {
        enter: false,
        reason: `Spread ${(spreadPercent * 100).toFixed(3)}% exceeds ${(THRESHOLDS.MAX_SPREAD_PERCENT * 100).toFixed(2)}% threshold`,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // Factor 6: Time of Day Analysis
    const hourOfDay = new Date().getUTCHours();
    const timeScore = await this.getTimeOfDayScore(signal.symbol, hourOfDay, userId);
    factors.timeOfDay.value = timeScore;
    factors.timeOfDay.passed = timeScore >= THRESHOLDS.MIN_TIME_OF_DAY_SCORE;

    if (!factors.timeOfDay.passed) {
      return {
        enter: false,
        reason: `Time of day score ${(timeScore * 100).toFixed(0)}% below ${(THRESHOLDS.MIN_TIME_OF_DAY_SCORE * 100).toFixed(0)}% threshold`,
        expectedDuration: null,
        confidence: 0,
        factors,
      };
    }

    // All checks passed - Calculate predicted duration
    const predictedDuration = this.predictDuration({
      historical: historicalData.avgDuration || 180, // Default 3 min if no data
      momentum: momentumStrength,
      volatility: marketData.volatility,
      volume: marketData.volumeSurge,
      spread: spreadPercent,
    });

    if (predictedDuration > THRESHOLDS.MAX_EXPECTED_DURATION_SECONDS) {
      return {
        enter: false,
        reason: `Predicted duration ${predictedDuration}s exceeds 300s threshold`,
        expectedDuration: predictedDuration,
        confidence: 0,
        factors,
      };
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(factors);

    return {
      enter: true,
      reason: `All checks passed - predicted ${predictedDuration}s to profit`,
      expectedDuration: predictedDuration,
      confidence,
      factors,
    };
  }

  /**
   * Get historical speed data for symbol + pattern
   */
  private async getHistoricalSpeedData(
    signal: TradeSignal,
    userId?: string
  ): Promise<{ avgDuration: number; sampleSize: number }> {
    const cacheKey = `${signal.symbol}:${signal.timeframe}:${signal.patternType || 'default'}`;
    const cached = this.speedCache.get(cacheKey);

    if (cached && Date.now() - cached.lastUpdated < this.CACHE_TTL_MS) {
      return { avgDuration: cached.avgDuration, sampleSize: cached.sampleSize };
    }

    // Query from speed analytics table
    if (userId) {
      try {
        const { data } = await supabase
          .from('trade_speed_analytics')
          .select('avg_duration_seconds, sample_size')
          .eq('user_id', userId)
          .eq('symbol', signal.symbol)
          .eq('timeframe', signal.timeframe)
          .maybeSingle();

        if (data && data.sample_size >= 5) {
          const result = {
            avgDuration: data.avg_duration_seconds || 180,
            sampleSize: data.sample_size,
          };
          this.speedCache.set(cacheKey, { ...result, lastUpdated: Date.now() });
          return result;
        }
      } catch (e) {
        console.warn('Failed to fetch speed analytics:', e);
      }
    }

    // Default conservative estimate
    return { avgDuration: 180, sampleSize: 0 };
  }

  /**
   * Get time of day performance score
   */
  private async getTimeOfDayScore(
    symbol: string,
    hourOfDay: number,
    userId?: string
  ): Promise<number> {
    if (userId) {
      try {
        const { data } = await supabase
          .from('trade_speed_analytics')
          .select('win_rate')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('hour_of_day', hourOfDay)
          .maybeSingle();

        if (data?.win_rate) {
          return data.win_rate / 100;
        }
      } catch (e) {
        console.warn('Failed to fetch time of day score:', e);
      }
    }

    // Default score based on known good trading hours (UTC)
    // Higher activity hours generally have faster trades
    const goodHours = [1, 2, 3, 4, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // US + Asia overlap
    return goodHours.includes(hourOfDay) ? 0.75 : 0.65;
  }

  /**
   * Predict trade duration based on current conditions
   */
  private predictDuration(factors: {
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
   * Calculate overall confidence score
   */
  private calculateConfidence(factors: QualificationResult['factors']): number {
    const weights = {
      historicalSpeed: 0.25,
      momentum: 0.20,
      volatility: 0.20,
      volumeSurge: 0.15,
      spread: 0.10,
      timeOfDay: 0.10,
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const factor = factors[key as keyof typeof factors];
      if (factor.passed) {
        // Calculate how much better than threshold
        const excess = key === 'spread' 
          ? (factor.threshold - factor.value) / factor.threshold
          : (factor.value - factor.threshold) / factor.threshold;
        score += weight * Math.min(1, 0.7 + excess * 0.3);
      }
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Log rejected trade for analysis
   */
  async logRejection(
    signal: TradeSignal,
    result: QualificationResult,
    userId: string
  ): Promise<void> {
    try {
      await supabase.from('rejected_trades').insert({
        user_id: userId,
        symbol: signal.symbol,
        exchange: signal.exchange,
        timeframe: signal.timeframe,
        rejection_reason: result.reason,
        pattern_type: signal.patternType || null,
        momentum: result.factors.momentum.value,
        volatility: result.factors.volatility.value,
        volume_surge: result.factors.volumeSurge.value,
        spread_percent: result.factors.spread.value,
        expected_duration: result.expectedDuration,
        price_at_rejection: signal.entryPrice,
      });
    } catch (e) {
      console.warn('Failed to log rejected trade:', e);
    }
  }
}

export const tradeQualificationFilter = new TradeQualificationFilter();
