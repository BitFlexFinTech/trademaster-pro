import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { toast } from 'sonner';

export interface HitRateHistoryPoint {
  hour: string;
  hitRate: number;
  totalTrades: number;
}

export interface StrategyRecommendation {
  currentHitRate: number;
  targetHitRate: number;
  currentTradeSpeed: number;
  recommendedTradeSpeed: number;
  exchangeLimit: number;
  limitingExchange: string;
  recommendations: {
    // All 9 fields for complete sync
    tradingStrategy: 'profit' | 'signal';
    dailyTarget: number;
    profitPerTrade: number;
    amountPerTrade: number;
    tradeIntervalMs: number;
    dailyStopLoss: number;
    stopLoss: number;
    signalThreshold: number;
    minEdge: number;
    focusPairs: string[];
  };
  summary: string;
  confidence: number;
  analyzedAt: string;
  hitRateHistory?: HitRateHistoryPoint[];
  metrics?: {
    totalCapital: number;
    estimatedDailyTrades: number;
    tradesPerHour: number;
  };
}

export function useBotStrategyAI() {
  const { user } = useAuth();
  const { connectedExchanges } = useConnectedExchanges();
  const [recommendation, setRecommendation] = useState<StrategyRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const connectedExchangeNames = connectedExchanges
    ?.filter(e => e.isConnected)
    .map(e => e.name) || [];

  const fetchRecommendation = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-strategy', {
        body: { 
          userId: user.id,
          connectedExchanges: connectedExchangeNames
        }
      });

      if (error) throw error;

      if (data) {
        setRecommendation(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch strategy recommendation:', error);
    } finally {
      setLoading(false);
    }
  }, [user, connectedExchangeNames.join(',')]);

  const applyRecommendation = useCallback(async () => {
    if (!user || !recommendation) return;

    setApplying(true);
    try {
      const rec = recommendation.recommendations;
      
      // COMPLETE UPSERT WITH ALL 9 FIELDS
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          // Field 1: Daily Target (from recommendation or targetHitRate)
          daily_target: rec.dailyTarget ?? recommendation.targetHitRate,
          // Field 2: Profit Per Trade
          profit_per_trade: rec.profitPerTrade,
          // Field 3: Amount Per Trade (Position Size)
          amount_per_trade: rec.amountPerTrade,
          // Field 4: Trade Speed (Interval)
          trade_interval_ms: rec.tradeIntervalMs,
          // Field 5: Daily Stop Loss
          daily_stop_loss: rec.dailyStopLoss,
          // Field 6: Stop Loss Per Trade
          per_trade_stop_loss: rec.stopLoss,
          // Field 7: Min Edge (Min Profit Threshold)
          min_profit_threshold: rec.minEdge / 100, // Convert % to decimal
          // Field 8: Focus Pairs
          focus_pairs: rec.focusPairs,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Broadcast update for immediate sync across all components
      await supabase.channel('bot-config-sync').send({
        type: 'broadcast',
        event: 'config_changed',
        payload: {
          // ALL 9 FIELDS for complete sync
          tradingStrategy: rec.tradingStrategy,
          dailyTarget: rec.dailyTarget ?? recommendation.targetHitRate,
          profitPerTrade: rec.profitPerTrade,
          amountPerTrade: rec.amountPerTrade,
          tradeIntervalMs: rec.tradeIntervalMs,
          dailyStopLoss: rec.dailyStopLoss,
          perTradeStopLoss: rec.stopLoss,
          minProfitThreshold: rec.minEdge / 100,
          focusPairs: rec.focusPairs,
        },
      });

      toast.success('🎯 All 9 settings synced across dashboard!', {
        description: `Daily: $${rec.dailyTarget}, Profit: $${rec.profitPerTrade}, Amount: $${rec.amountPerTrade}`,
      });
    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      toast.error('Failed to apply recommendation');
    } finally {
      setApplying(false);
    }
  }, [user, recommendation]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!user) return;

    fetchRecommendation();
    const interval = setInterval(fetchRecommendation, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchRecommendation]);

  const minutesAgo = lastUpdated 
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 60000)
    : null;

  return {
    recommendation,
    loading,
    applying,
    lastUpdated,
    minutesAgo,
    fetchRecommendation,
    applyRecommendation
  };
}
