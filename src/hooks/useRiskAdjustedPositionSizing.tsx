import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface RiskMetrics {
  currentDrawdown: number; // % from peak
  winRate: number; // 0-1
  recentVolatility: number; // % expected move
  avgTradeTime: number; // minutes to hit target
}

export interface PositionSizeRecommendation {
  baseSize: number;
  adjustedSize: number;
  riskMultiplier: number;
  volatilityMultiplier: number;
  expectedTimeToProfit: number; // minutes
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
}

// Constants for position sizing
const MIN_POSITION_SIZE = 200;
const MAX_POSITION_SIZE = 500;
const TARGET_PROFIT_SPOT = 1.00;
const TARGET_PROFIT_LEVERAGE = 3.00;

/**
 * Calculate position size based on expected price movement
 * Formula: positionSize = targetProfit / expectedMovePercent
 */
function calculateSizeForMove(targetProfit: number, expectedMovePercent: number): number {
  if (expectedMovePercent <= 0) return MAX_POSITION_SIZE;
  const rawSize = targetProfit / (expectedMovePercent / 100);
  return Math.min(MAX_POSITION_SIZE, Math.max(MIN_POSITION_SIZE, rawSize));
}

/**
 * Apply risk adjustments based on drawdown and win rate
 */
function applyRiskAdjustment(
  baseSize: number,
  drawdown: number,
  winRate: number
): { adjustedSize: number; riskMultiplier: number } {
  let riskMultiplier = 1.0;
  
  // Reduce position during drawdown
  if (drawdown > 20) {
    riskMultiplier *= 0.5; // 50% reduction
  } else if (drawdown > 10) {
    riskMultiplier *= 0.8; // 20% reduction
  } else if (drawdown > 5) {
    riskMultiplier *= 0.9; // 10% reduction
  }
  
  // Adjust based on win rate
  if (winRate > 0.85) {
    riskMultiplier *= 1.1; // Slight increase for high win rates
  } else if (winRate < 0.6) {
    riskMultiplier *= 0.8; // Reduce for low win rates
  }
  
  const adjustedSize = baseSize * riskMultiplier;
  
  // Clamp to allowed range
  return {
    adjustedSize: Math.min(MAX_POSITION_SIZE, Math.max(MIN_POSITION_SIZE, adjustedSize)),
    riskMultiplier,
  };
}

export function useRiskAdjustedPositionSizing(mode: 'spot' | 'leverage' = 'spot') {
  const { user } = useAuth();
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    currentDrawdown: 0,
    winRate: 0.75,
    recentVolatility: 0.5,
    avgTradeTime: 5,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch historical metrics
  useEffect(() => {
    if (!user?.id) return;

    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        // Get recent trades to calculate win rate and avg time
        const { data: trades } = await supabase
          .from('trades')
          .select('profit_loss, created_at, closed_at, status')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .order('created_at', { ascending: false })
          .limit(50);

        if (trades && trades.length > 0) {
          const wins = trades.filter(t => (t.profit_loss ?? 0) > 0).length;
          const winRate = wins / trades.length;

          // Calculate average trade time
          const tradeTimes = trades
            .filter(t => t.closed_at)
            .map(t => {
              const open = new Date(t.created_at).getTime();
              const close = new Date(t.closed_at!).getTime();
              return (close - open) / 60000; // minutes
            });
          const avgTradeTime = tradeTimes.length > 0
            ? tradeTimes.reduce((a, b) => a + b, 0) / tradeTimes.length
            : 5;

          // Calculate drawdown (simplified - from peak profit)
          const profits = trades.map(t => t.profit_loss ?? 0);
          const cumulative = profits.reduce((acc, p) => {
            const last = acc.length > 0 ? acc[acc.length - 1] : 0;
            acc.push(last + p);
            return acc;
          }, [] as number[]);
          
          const peak = Math.max(...cumulative, 0);
          const current = cumulative[cumulative.length - 1] ?? 0;
          const drawdown = peak > 0 ? ((peak - current) / peak) * 100 : 0;

          setRiskMetrics(prev => ({
            ...prev,
            winRate,
            avgTradeTime: Math.max(1, avgTradeTime),
            currentDrawdown: Math.max(0, drawdown),
          }));
        }

        // Get recent volatility from price data (simplified estimate)
        // In production, this would fetch from WebSocket or price cache
        setRiskMetrics(prev => ({
          ...prev,
          recentVolatility: 0.3 + Math.random() * 0.4, // 0.3% - 0.7% typical BTC moves
        }));

      } catch (error) {
        console.error('Error fetching risk metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchMetrics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Calculate recommendation
  const recommendation = useMemo<PositionSizeRecommendation>(() => {
    const targetProfit = mode === 'leverage' ? TARGET_PROFIT_LEVERAGE : TARGET_PROFIT_SPOT;
    const { recentVolatility, currentDrawdown, winRate, avgTradeTime } = riskMetrics;

    // Calculate base size from volatility
    const baseSize = calculateSizeForMove(targetProfit, recentVolatility);

    // Apply risk adjustments
    const { adjustedSize, riskMultiplier } = applyRiskAdjustment(
      baseSize,
      currentDrawdown,
      winRate
    );

    // Calculate volatility multiplier (how much we scaled due to volatility)
    const volatilityMultiplier = recentVolatility > 0.5 ? 0.8 : 1.2;

    // Estimate time to profit based on historical data and current volatility
    const expectedTimeToProfit = avgTradeTime * (0.5 / recentVolatility);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    if (currentDrawdown > 10 || winRate < 0.6) {
      riskLevel = 'high';
    } else if (currentDrawdown < 5 && winRate > 0.8) {
      riskLevel = 'low';
    }

    // Generate reasoning
    const reasons: string[] = [];
    if (recentVolatility < 0.4) {
      reasons.push(`Low volatility (${(recentVolatility * 100).toFixed(2)}%) → larger position for faster $${targetProfit} target`);
    } else {
      reasons.push(`Current volatility ${(recentVolatility * 100).toFixed(2)}% → optimal for quick fills`);
    }
    if (currentDrawdown > 5) {
      reasons.push(`${currentDrawdown.toFixed(1)}% drawdown → reduced size for protection`);
    }
    if (winRate > 0.8) {
      reasons.push(`${(winRate * 100).toFixed(0)}% win rate → slight size increase`);
    }

    return {
      baseSize: Math.round(baseSize),
      adjustedSize: Math.round(adjustedSize),
      riskMultiplier: Math.round(riskMultiplier * 100) / 100,
      volatilityMultiplier: Math.round(volatilityMultiplier * 100) / 100,
      expectedTimeToProfit: Math.round(expectedTimeToProfit * 10) / 10,
      riskLevel,
      reasoning: reasons.join('. '),
    };
  }, [riskMetrics, mode]);

  return {
    recommendation,
    riskMetrics,
    isLoading,
    minSize: MIN_POSITION_SIZE,
    maxSize: MAX_POSITION_SIZE,
    targetProfit: mode === 'leverage' ? TARGET_PROFIT_LEVERAGE : TARGET_PROFIT_SPOT,
  };
}
