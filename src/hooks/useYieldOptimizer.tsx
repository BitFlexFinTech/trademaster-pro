import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface YieldSuggestion {
  action: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
  currentTarget: number;
  suggestedTarget: number;
  adjustmentPercent: number;
  reason: string;
  yieldPerHour: number;
  avgHoldTimeMs: number;
  avgHoldTimeFormatted: string;
  recentTradeCount: number;
  confidence: 'high' | 'medium' | 'low';
  fastCloseCount: number;
  stallCount: number;
}

export interface UseYieldOptimizerReturn {
  suggestion: YieldSuggestion | null;
  isAnalyzing: boolean;
  lastAnalyzedAt: Date | null;
  error: string | null;
  analyze: () => Promise<void>;
}

interface YieldOptimizerConfig {
  fastCloseThresholdMs?: number;  // Default: 5 minutes
  stallThresholdMs?: number;       // Default: 2 hours
  increasePercent?: number;        // Default: 20%
  decreasePercent?: number;        // Default: 20%
  currentTarget?: number;          // Current profit target
}

const DEFAULT_CONFIG: Required<YieldOptimizerConfig> = {
  fastCloseThresholdMs: 5 * 60 * 1000,      // 5 minutes
  stallThresholdMs: 2 * 60 * 60 * 1000,     // 2 hours
  increasePercent: 20,
  decreasePercent: 20,
  currentTarget: 2.10,
};

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function useYieldOptimizer(config: YieldOptimizerConfig = {}): UseYieldOptimizerReturn {
  const { user } = useAuth();
  const [suggestion, setSuggestion] = useState<YieldSuggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const analyze = useCallback(async () => {
    if (!user) {
      setError('User not authenticated');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      // Fetch closed trades from past 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: trades, error: fetchError } = await supabase
        .from('trades')
        .select('created_at, closed_at, profit_loss, status')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', twentyFourHoursAgo)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false });

      if (fetchError) throw fetchError;

      if (!trades || trades.length === 0) {
        setSuggestion({
          action: 'MAINTAIN',
          currentTarget: mergedConfig.currentTarget,
          suggestedTarget: mergedConfig.currentTarget,
          adjustmentPercent: 0,
          reason: 'No recent closed trades to analyze',
          yieldPerHour: 0,
          avgHoldTimeMs: 0,
          avgHoldTimeFormatted: 'N/A',
          recentTradeCount: 0,
          confidence: 'low',
          fastCloseCount: 0,
          stallCount: 0,
        });
        setLastAnalyzedAt(new Date());
        return;
      }

      // Calculate hold times and categorize trades
      let totalHoldTimeMs = 0;
      let totalProfit = 0;
      let fastCloseCount = 0;
      let stallCount = 0;

      for (const trade of trades) {
        if (!trade.created_at || !trade.closed_at) continue;
        
        const holdTimeMs = new Date(trade.closed_at).getTime() - new Date(trade.created_at).getTime();
        totalHoldTimeMs += holdTimeMs;
        totalProfit += trade.profit_loss || 0;

        if (holdTimeMs < mergedConfig.fastCloseThresholdMs) {
          fastCloseCount++;
        } else if (holdTimeMs > mergedConfig.stallThresholdMs) {
          stallCount++;
        }
      }

      const avgHoldTimeMs = trades.length > 0 ? totalHoldTimeMs / trades.length : 0;
      const yieldPerHour = totalHoldTimeMs > 0 
        ? (totalProfit / (totalHoldTimeMs / 3600000))
        : 0;

      // Determine confidence based on sample size
      let confidence: 'high' | 'medium' | 'low';
      if (trades.length >= 10) confidence = 'high';
      else if (trades.length >= 5) confidence = 'medium';
      else confidence = 'low';

      // Calculate suggestion
      let action: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
      let adjustmentPercent = 0;
      let reason = '';
      let suggestedTarget = mergedConfig.currentTarget;

      const fastCloseRatio = fastCloseCount / trades.length;
      const stallRatio = stallCount / trades.length;

      if (fastCloseRatio > 0.5) {
        // More than 50% close fast → increase target
        action = 'INCREASE';
        adjustmentPercent = mergedConfig.increasePercent;
        suggestedTarget = mergedConfig.currentTarget * (1 + adjustmentPercent / 100);
        reason = `${fastCloseCount}/${trades.length} trades closed in <5min. Market conditions favorable - increase target to capture more profit.`;
      } else if (stallRatio > 0.3) {
        // More than 30% stall → decrease target
        action = 'DECREASE';
        adjustmentPercent = mergedConfig.decreasePercent;
        suggestedTarget = mergedConfig.currentTarget * (1 - adjustmentPercent / 100);
        reason = `${stallCount}/${trades.length} trades took >2hrs. Lower target for faster execution.`;
      } else {
        action = 'MAINTAIN';
        reason = `Balanced trade timing: ${fastCloseCount} fast, ${stallCount} stalled out of ${trades.length} trades. Current target is optimal.`;
      }

      setSuggestion({
        action,
        currentTarget: mergedConfig.currentTarget,
        suggestedTarget: Math.round(suggestedTarget * 100) / 100,
        adjustmentPercent,
        reason,
        yieldPerHour: Math.round(yieldPerHour * 100) / 100,
        avgHoldTimeMs,
        avgHoldTimeFormatted: formatDuration(avgHoldTimeMs),
        recentTradeCount: trades.length,
        confidence,
        fastCloseCount,
        stallCount,
      });

      setLastAnalyzedAt(new Date());
    } catch (err) {
      console.error('Yield optimizer error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze trades');
    } finally {
      setIsAnalyzing(false);
    }
  }, [user, mergedConfig.currentTarget, mergedConfig.fastCloseThresholdMs, mergedConfig.stallThresholdMs, mergedConfig.increasePercent, mergedConfig.decreasePercent]);

  // Auto-analyze on mount
  useEffect(() => {
    if (user) {
      analyze();
    }
  }, [user?.id]);

  return {
    suggestion,
    isAnalyzing,
    lastAnalyzedAt,
    error,
    analyze,
  };
}
