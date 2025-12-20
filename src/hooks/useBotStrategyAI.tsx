import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { toast } from 'sonner';

export interface StrategyRecommendation {
  currentHitRate: number;
  targetHitRate: number;
  currentTradeSpeed: number;
  recommendedTradeSpeed: number;
  exchangeLimit: number;
  limitingExchange: string;
  recommendations: {
    signalThreshold: number;
    tradeIntervalMs: number;
    profitPerTrade: number;
    stopLoss: number;
    focusPairs: string[];
  };
  summary: string;
  confidence: number;
  analyzedAt: string;
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
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          min_profit_threshold: recommendation.recommendations.signalThreshold / 100,
          trade_interval_ms: recommendation.recommendations.tradeIntervalMs,
          profit_per_trade: recommendation.recommendations.profitPerTrade,
          per_trade_stop_loss: recommendation.recommendations.stopLoss,
          focus_pairs: recommendation.recommendations.focusPairs,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast.success('Strategy applied! Settings synced across dashboard.');
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
