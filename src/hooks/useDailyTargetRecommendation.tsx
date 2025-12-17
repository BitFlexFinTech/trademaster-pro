import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeFloat {
  exchange: string;
  amount: number;
  baseBalance: number;
  availableFloat: number;
}

interface PerExchangeTarget {
  exchange: string;
  dailyTarget: number;
  recommendedProfitPerTrade: number;
  maxTrades: number;
}

interface DailyTargetRecommendation {
  dailyTarget: number;
  profitPerTrade: number;
  estimatedTrades: number;
  confidence: number;
  riskTolerance: string;
  reasoning: string;
  perExchangeTargets: PerExchangeTarget[];
  metrics: {
    totalCapital: number;
    totalAvailable: number;
    effectiveHitRate: number;
    expectedProfitPerTrade: number;
    maxDrawdown: number;
  };
}

interface UseDailyTargetRecommendationReturn {
  recommendation: DailyTargetRecommendation | null;
  loading: boolean;
  error: string | null;
  fetchRecommendation: (params: {
    usdtFloat: ExchangeFloat[];
    historicalHitRate: number;
    averageProfitPerTrade: number;
    tradingHoursPerDay?: number;
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  }) => Promise<void>;
  applyRecommendation: (onApply: (target: number, profit: number) => void) => void;
}

export function useDailyTargetRecommendation(): UseDailyTargetRecommendationReturn {
  const [recommendation, setRecommendation] = useState<DailyTargetRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendation = useCallback(async (params: {
    usdtFloat: ExchangeFloat[];
    historicalHitRate: number;
    averageProfitPerTrade: number;
    tradingHoursPerDay?: number;
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  }) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('recommend-daily-target', {
        body: {
          usdtFloat: params.usdtFloat,
          historicalHitRate: params.historicalHitRate,
          averageProfitPerTrade: params.averageProfitPerTrade,
          tradingHoursPerDay: params.tradingHoursPerDay || 8,
          riskTolerance: params.riskTolerance || 'moderate',
        },
      });

      if (fnError) throw fnError;

      if (data?.success && data.recommendation) {
        setRecommendation(data.recommendation);
        toast.success('AI Recommendation Ready', {
          description: `Suggested target: $${data.recommendation.dailyTarget} (${data.recommendation.confidence}% confidence)`,
        });
      } else {
        throw new Error(data?.error || 'Failed to get recommendation');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch recommendation';
      setError(message);
      toast.error('Recommendation Failed', { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  const applyRecommendation = useCallback((onApply: (target: number, profit: number) => void) => {
    if (!recommendation) {
      toast.error('No recommendation available');
      return;
    }

    onApply(recommendation.dailyTarget, recommendation.profitPerTrade);
    toast.success('Recommendation Applied', {
      description: `Daily target: $${recommendation.dailyTarget}, Profit/trade: $${recommendation.profitPerTrade}`,
    });
  }, [recommendation]);

  return {
    recommendation,
    loading,
    error,
    fetchRecommendation,
    applyRecommendation,
  };
}
