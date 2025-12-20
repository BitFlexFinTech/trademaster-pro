import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

interface TradeSpeedRecommendation {
  recommendedIntervalMs: number;
  limitingExchange: string;
  speedReasoning: string;
}

interface DailyTargetRecommendation {
  dailyTarget: number;
  profitPerTrade: number;
  estimatedTrades: number;
  confidence: number;
  riskTolerance: string;
  reasoning: string;
  perExchangeTargets: PerExchangeTarget[];
  tradeSpeed?: TradeSpeedRecommendation;
  metrics: {
    totalCapital: number;
    totalAvailable: number;
    effectiveHitRate: number;
    expectedProfitPerTrade: number;
    maxDrawdown: number;
    tradesPerHour?: number;
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
    connectedExchanges?: string[];
  }) => Promise<void>;
  applyRecommendation: (onApply?: (target: number, profit: number) => void) => Promise<void>;
}

export function useDailyTargetRecommendation(): UseDailyTargetRecommendationReturn {
  const { user } = useAuth();
  const [recommendation, setRecommendation] = useState<DailyTargetRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for real-time config changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('bot-config-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_config',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[BOT CONFIG] Realtime update:', payload);
          // Config changed - could trigger UI update if needed
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchRecommendation = useCallback(async (params: {
    usdtFloat: ExchangeFloat[];
    historicalHitRate: number;
    averageProfitPerTrade: number;
    tradingHoursPerDay?: number;
    riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
    connectedExchanges?: string[];
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
          connectedExchanges: params.connectedExchanges || params.usdtFloat.map(f => f.exchange),
        },
      });

      if (fnError) throw fnError;

      if (data?.success && data.recommendation) {
        setRecommendation(data.recommendation);
        const speedInfo = data.recommendation.tradeSpeed 
          ? `, Speed: ${data.recommendation.tradeSpeed.recommendedIntervalMs}ms` 
          : '';
        toast.success('AI Recommendation Ready', {
          description: `Target: $${data.recommendation.dailyTarget} (${data.recommendation.confidence}% confidence)${speedInfo}`,
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

  // CRITICAL: Apply recommendation AND persist to database for system-wide sync
  const applyRecommendation = useCallback(async (onApply?: (target: number, profit: number) => void) => {
    if (!recommendation) {
      toast.error('No recommendation available');
      return;
    }

    if (!user) {
      toast.error('Please log in to apply recommendations');
      return;
    }

    try {
      // Calculate optimal values
      const suggestedPosition = recommendation.metrics?.totalAvailable 
        ? Math.max(10, Math.min(recommendation.metrics.totalAvailable * 0.1, 5000)) // 10% of available, min $10, max $5000
        : 100;
      
      // Use rate limit-aware trade speed from recommendation if available
      const intervalMs = recommendation.tradeSpeed?.recommendedIntervalMs || (() => {
        const tradesPerDay = recommendation.estimatedTrades || 50;
        const tradingHoursPerDay = 8;
        const tradesPerHour = tradesPerDay / tradingHoursPerDay;
        return Math.max(3000, Math.floor((3600 * 1000) / tradesPerHour)); // At least 3s between trades
      })();

      // 1. PERSIST TO DATABASE - This triggers Realtime sync to ALL components
      const { error: upsertError } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          daily_target: recommendation.dailyTarget,
          profit_per_trade: Math.max(0.01, recommendation.profitPerTrade), // Min $0.01
          amount_per_trade: suggestedPosition,
          trade_interval_ms: intervalMs,
          per_trade_stop_loss: recommendation.profitPerTrade * 0.2, // 80/20 rule
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'user_id',
        });

      if (upsertError) throw upsertError;

      // 2. Broadcast via Realtime channel for immediate sync - MUST use same channel name as Bots.tsx listener
      await supabase.channel('bot-config-sync').send({
        type: 'broadcast',
        event: 'config_changed',
        payload: {
          dailyTarget: recommendation.dailyTarget,
          profitPerTrade: recommendation.profitPerTrade,
          amountPerTrade: suggestedPosition,
          tradeIntervalMs: intervalMs,
          perTradeStopLoss: recommendation.profitPerTrade * 0.2,
        },
      });

      // 3. Apply locally via callback (optional)
      onApply?.(recommendation.dailyTarget, recommendation.profitPerTrade);

      toast.success('🎯 AI Settings Applied & Synced', {
        description: `Daily: $${recommendation.dailyTarget}, Profit: $${recommendation.profitPerTrade.toFixed(2)}, Position: $${suggestedPosition.toFixed(0)}, Speed: ${intervalMs}ms`,
        duration: 5000,
      });
    } catch (err) {
      console.error('Failed to apply recommendation:', err);
      toast.error('Failed to apply recommendation', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [recommendation, user]);

  return {
    recommendation,
    loading,
    error,
    fetchRecommendation,
    applyRecommendation,
  };
}
