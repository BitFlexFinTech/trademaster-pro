/**
 * AI Advisor Hook - Auto-fill TP/SL/position size/daily target
 * Phase 5: Intelligent trading parameter suggestions based on market conditions
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GREENBACK_CONFIG } from '@/lib/greenbackConfig';

interface MarketConditions {
  volatility: 'low' | 'medium' | 'high';
  trend: 'bullish' | 'bearish' | 'neutral';
  volume: 'low' | 'medium' | 'high';
  spreadHealth: 'good' | 'moderate' | 'poor';
}

interface AdvisorRecommendation {
  dailyTarget: number;
  profitPerTrade: number;
  amountPerTrade: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  leverage: number;
  confidence: number;
  reasoning: string;
  marketConditions: MarketConditions;
  timestamp: Date;
}

interface UseAIAdvisorProps {
  accountBalance: number;
  currentHitRate: number;
  tradingMode: 'demo' | 'live';
  prices: Array<{ symbol: string; price: number; change_24h?: number; volume?: number }>;
  isRunning: boolean;
}

interface UseAIAdvisorReturn {
  recommendation: AdvisorRecommendation | null;
  loading: boolean;
  error: string | null;
  fetchRecommendation: () => Promise<void>;
  applyRecommendation: (onApply: (rec: AdvisorRecommendation) => void) => void;
  marketConditions: MarketConditions | null;
}

export function useAIAdvisor({
  accountBalance,
  currentHitRate,
  tradingMode,
  prices,
  isRunning,
}: UseAIAdvisorProps): UseAIAdvisorReturn {
  const [recommendation, setRecommendation] = useState<AdvisorRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketConditions, setMarketConditions] = useState<MarketConditions | null>(null);

  /**
   * Analyze current market conditions from price data
   */
  const analyzeMarketConditions = useCallback((): MarketConditions => {
    if (!prices || prices.length === 0) {
      return {
        volatility: 'medium',
        trend: 'neutral',
        volume: 'medium',
        spreadHealth: 'moderate',
      };
    }

    // Calculate average volatility from 24h changes
    const changes = prices.slice(0, 10).map(p => Math.abs(p.change_24h || 0));
    const avgVolatility = changes.reduce((a, b) => a + b, 0) / changes.length;

    // Determine volatility level
    let volatility: 'low' | 'medium' | 'high' = 'medium';
    if (avgVolatility < 2) volatility = 'low';
    else if (avgVolatility > 5) volatility = 'high';

    // Calculate trend from majority of price changes
    const positiveChanges = prices.filter(p => (p.change_24h || 0) > 0).length;
    const trendRatio = positiveChanges / prices.length;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (trendRatio > 0.6) trend = 'bullish';
    else if (trendRatio < 0.4) trend = 'bearish';

    // Volume assessment (normalized)
    const volumes = prices.slice(0, 10).map(p => p.volume || 0);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    let volume: 'low' | 'medium' | 'high' = 'medium';
    if (avgVolume < 1000000) volume = 'low';
    else if (avgVolume > 100000000) volume = 'high';

    // Spread health (estimated based on volatility and volume)
    let spreadHealth: 'good' | 'moderate' | 'poor' = 'moderate';
    if (volatility === 'low' && volume === 'high') spreadHealth = 'good';
    else if (volatility === 'high' && volume === 'low') spreadHealth = 'poor';

    return { volatility, trend, volume, spreadHealth };
  }, [prices]);

  /**
   * Calculate optimal parameters based on account and market conditions
   */
  const calculateOptimalParams = useCallback((
    balance: number,
    hitRate: number,
    conditions: MarketConditions
  ): Omit<AdvisorRecommendation, 'timestamp'> => {
    // Base calculations
    const riskPercent = GREENBACK_CONFIG.risk_per_trade_pct;
    const maxDailyLoss = balance * GREENBACK_CONFIG.max_daily_loss_pct;
    
    // Adjust for volatility
    let volatilityMultiplier = 1;
    if (conditions.volatility === 'high') volatilityMultiplier = 0.7; // Reduce size in high volatility
    if (conditions.volatility === 'low') volatilityMultiplier = 1.2; // Can be slightly more aggressive

    // Adjust for hit rate
    let hitRateMultiplier = 1;
    if (hitRate >= 70) hitRateMultiplier = 1.2; // Historical performance is good
    if (hitRate < 50) hitRateMultiplier = 0.6; // Be more conservative

    // Calculate position size
    const basePositionSize = balance * riskPercent * 10; // 10x because typical SL is 0.25%
    const adjustedPositionSize = Math.min(
      basePositionSize * volatilityMultiplier * hitRateMultiplier,
      balance * 0.5, // Max 50% of balance
      GREENBACK_CONFIG.equity_start_usd * 2 // Max $460 per trade
    );
    const amountPerTrade = Math.max(20, Math.round(adjustedPositionSize));

    // Calculate profit targets
    let profitPerTrade: number;
    if (conditions.spreadHealth === 'good') {
      profitPerTrade = GREENBACK_CONFIG.target_pnl_per_trade_usd.max; // $0.50
    } else if (conditions.spreadHealth === 'poor') {
      profitPerTrade = GREENBACK_CONFIG.target_pnl_per_trade_usd.min * 0.8; // $0.20
    } else {
      profitPerTrade = (GREENBACK_CONFIG.target_pnl_per_trade_usd.min + GREENBACK_CONFIG.target_pnl_per_trade_usd.max) / 2; // $0.375
    }

    // Calculate TP/SL percentages
    const takeProfitPercent = (profitPerTrade / amountPerTrade) * 100;
    const stopLossPercent = takeProfitPercent * 0.5; // SL = 50% of TP distance

    // Calculate daily target based on expected trades
    const tradesPerHour = conditions.volatility === 'high' ? 15 : conditions.volatility === 'low' ? 8 : 12;
    const tradingHours = 8;
    const expectedTrades = tradesPerHour * tradingHours;
    const expectedWins = expectedTrades * (hitRate / 100);
    const expectedLosses = expectedTrades - expectedWins;
    const avgLoss = profitPerTrade * 0.4; // SL is 40% of profit
    const dailyTarget = Math.round((expectedWins * profitPerTrade) - (expectedLosses * avgLoss));

    // Calculate leverage (conservative for live mode)
    let leverage = Math.min(GREENBACK_CONFIG.leverage_cap, 3);
    if (tradingMode === 'live') leverage = Math.min(leverage, 2);
    if (conditions.volatility === 'high') leverage = 1;

    // Calculate confidence based on all factors
    let confidence = 70;
    if (conditions.spreadHealth === 'good') confidence += 10;
    if (conditions.spreadHealth === 'poor') confidence -= 15;
    if (hitRate >= 60) confidence += 10;
    if (hitRate < 50) confidence -= 20;
    if (conditions.volume === 'high') confidence += 5;
    if (conditions.volume === 'low') confidence -= 10;
    confidence = Math.max(30, Math.min(95, confidence));

    // Generate reasoning
    const reasoningParts: string[] = [];
    reasoningParts.push(`Based on ${conditions.volatility} volatility market conditions`);
    if (conditions.trend !== 'neutral') {
      reasoningParts.push(`${conditions.trend} trend detected`);
    }
    if (hitRate >= 60) {
      reasoningParts.push(`strong historical hit rate (${hitRate.toFixed(0)}%)`);
    } else if (hitRate < 50) {
      reasoningParts.push(`conservative sizing due to low hit rate (${hitRate.toFixed(0)}%)`);
    }
    reasoningParts.push(`targeting $${profitPerTrade.toFixed(2)} net per trade with ${takeProfitPercent.toFixed(2)}% TP`);

    return {
      dailyTarget: Math.max(10, dailyTarget),
      profitPerTrade: Math.round(profitPerTrade * 100) / 100,
      amountPerTrade,
      takeProfitPercent: Math.round(takeProfitPercent * 100) / 100,
      stopLossPercent: Math.round(stopLossPercent * 100) / 100,
      leverage,
      confidence,
      reasoning: reasoningParts.join('. ') + '.',
      marketConditions: conditions,
    };
  }, [tradingMode]);

  /**
   * Fetch AI recommendation
   */
  const fetchRecommendation = useCallback(async () => {
    if (accountBalance <= 0) {
      setError('Account balance required for AI recommendation');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Analyze current market conditions
      const conditions = analyzeMarketConditions();
      setMarketConditions(conditions);

      // Calculate optimal parameters
      const params = calculateOptimalParams(accountBalance, currentHitRate, conditions);

      const rec: AdvisorRecommendation = {
        ...params,
        timestamp: new Date(),
      };

      setRecommendation(rec);
      
      console.log('[AIAdvisor] Generated recommendation:', rec);
    } catch (err: any) {
      console.error('[AIAdvisor] Error generating recommendation:', err);
      setError(err.message || 'Failed to generate recommendation');
    } finally {
      setLoading(false);
    }
  }, [accountBalance, currentHitRate, analyzeMarketConditions, calculateOptimalParams]);

  /**
   * Apply the current recommendation
   */
  const applyRecommendation = useCallback((onApply: (rec: AdvisorRecommendation) => void) => {
    if (!recommendation) {
      toast.error('No recommendation to apply');
      return;
    }

    onApply(recommendation);
    
    toast.success('AI Recommendation Applied', {
      description: `Daily: $${recommendation.dailyTarget}, Position: $${recommendation.amountPerTrade}, TP: ${recommendation.takeProfitPercent.toFixed(2)}%`,
    });
  }, [recommendation]);

  // Auto-fetch on mount if bot is not running and balance is available
  useEffect(() => {
    if (!isRunning && accountBalance > 0 && prices.length > 0 && !recommendation) {
      fetchRecommendation();
    }
  }, [isRunning, accountBalance, prices.length, recommendation, fetchRecommendation]);

  return {
    recommendation,
    loading,
    error,
    fetchRecommendation,
    applyRecommendation,
    marketConditions,
  };
}
