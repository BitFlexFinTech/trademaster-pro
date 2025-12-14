import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioMetrics {
  totalBalance: number;
  availableBalance: number;
  lockedInTrades: number;
  dailyPnL: number;
  drawdownPercent: number;
  maxDrawdown: number;
}

interface PositionSizing {
  recommendedSize: number;
  maxSize: number;
  riskPercent: number;
  adjustedForDrawdown: boolean;
}

interface UseAdaptiveTradingEngineProps {
  currentHitRate: number;
  dailyTarget: number;
  currentPnL: number;
  isRunning: boolean;
}

const AGGRESSIVE_CONFIG = {
  baseRiskPercent: 1.5,    // 1.5% risk per trade normally
  minRiskPercent: 0.5,     // 0.5% when in drawdown
  maxRiskPercent: 2.5,     // 2.5% when performing well
  maxDrawdownPercent: 15,  // Stop trading at 15% drawdown
  hitRateThreshold: 95,    // Target hit rate
  maxPositionPercent: 10,  // Max 10% of portfolio per trade
};

export function useAdaptiveTradingEngine({
  currentHitRate,
  dailyTarget,
  currentPnL,
  isRunning,
}: UseAdaptiveTradingEngineProps) {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance } = useTradingMode();
  
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics>({
    totalBalance: 0,
    availableBalance: 0,
    lockedInTrades: 0,
    dailyPnL: 0,
    drawdownPercent: 0,
    maxDrawdown: 0,
  });

  /**
   * Fetch real portfolio data in live mode
   */
  useEffect(() => {
    if (!user || !isRunning) return;

    const fetchPortfolio = async () => {
      if (tradingMode === 'demo') {
        // Use virtual balance for demo mode
        setPortfolioMetrics({
          totalBalance: virtualBalance,
          availableBalance: virtualBalance * 0.9, // Reserve 10% buffer
          lockedInTrades: 0,
          dailyPnL: currentPnL,
          drawdownPercent: currentPnL < 0 ? Math.abs(currentPnL / virtualBalance) * 100 : 0,
          maxDrawdown: currentPnL < 0 ? currentPnL : 0,
        });
        return;
      }

      // Fetch real holdings for live mode
      const { data: holdings } = await supabase
        .from('portfolio_holdings')
        .select('quantity, asset_symbol, average_buy_price')
        .eq('user_id', user.id);

      if (holdings) {
        // Sum up USDT/USDC balances
        const stableBalance = holdings
          .filter(h => ['USDT', 'USDC', 'USD'].includes(h.asset_symbol))
          .reduce((sum, h) => sum + h.quantity, 0);

        setPortfolioMetrics({
          totalBalance: stableBalance,
          availableBalance: stableBalance * 0.9,
          lockedInTrades: 0,
          dailyPnL: currentPnL,
          drawdownPercent: currentPnL < 0 ? Math.abs(currentPnL / stableBalance) * 100 : 0,
          maxDrawdown: currentPnL < 0 ? currentPnL : 0,
        });
      }
    };

    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [user, tradingMode, virtualBalance, currentPnL, isRunning]);

  /**
   * Calculate dynamic position sizing based on performance
   */
  const positionSizing = useMemo((): PositionSizing => {
    let riskPercent = AGGRESSIVE_CONFIG.baseRiskPercent;
    let adjustedForDrawdown = false;

    // Reduce risk if hit rate is below target
    if (currentHitRate < 90) {
      riskPercent = AGGRESSIVE_CONFIG.minRiskPercent;
      adjustedForDrawdown = true;
    } else if (currentHitRate < AGGRESSIVE_CONFIG.hitRateThreshold) {
      // Proportionally reduce risk as hit rate drops
      const hitRateDeficit = (AGGRESSIVE_CONFIG.hitRateThreshold - currentHitRate) / 10;
      riskPercent = Math.max(
        AGGRESSIVE_CONFIG.minRiskPercent,
        AGGRESSIVE_CONFIG.baseRiskPercent - (hitRateDeficit * 0.5)
      );
    } else if (currentHitRate >= 98) {
      // Elite performance - can increase risk slightly
      riskPercent = AGGRESSIVE_CONFIG.maxRiskPercent;
    }

    // Further reduce if in drawdown
    if (portfolioMetrics.drawdownPercent > 5) {
      riskPercent = Math.max(AGGRESSIVE_CONFIG.minRiskPercent, riskPercent * 0.7);
      adjustedForDrawdown = true;
    }

    const recommendedSize = portfolioMetrics.availableBalance * (riskPercent / 100);
    const maxSize = portfolioMetrics.availableBalance * (AGGRESSIVE_CONFIG.maxPositionPercent / 100);

    return {
      recommendedSize: Math.min(recommendedSize, maxSize),
      maxSize,
      riskPercent,
      adjustedForDrawdown,
    };
  }, [currentHitRate, portfolioMetrics]);

  /**
   * Check if trading should continue based on risk limits
   */
  const shouldContinueTrading = useCallback((): boolean => {
    // Stop if max drawdown reached
    if (portfolioMetrics.drawdownPercent >= AGGRESSIVE_CONFIG.maxDrawdownPercent) {
      return false;
    }

    // Stop if no available balance
    if (portfolioMetrics.availableBalance <= 0) {
      return false;
    }

    // Continue if within limits
    return true;
  }, [portfolioMetrics]);

  /**
   * Get risk-adjusted profit target
   */
  const getAdjustedProfitTarget = useCallback((): number => {
    // If hit rate is low, reduce profit target to increase win probability
    if (currentHitRate < 90) {
      return 0.50; // $0.50 for high-probability trades
    }
    if (currentHitRate < 95) {
      return 0.75; // $0.75 as we approach target
    }
    // Normal or above-target hit rate
    return 1.00;
  }, [currentHitRate]);

  /**
   * Get progress toward daily target
   */
  const progressMetrics = useMemo(() => {
    const progressPercent = dailyTarget > 0 ? (currentPnL / dailyTarget) * 100 : 0;
    const remaining = Math.max(0, dailyTarget - currentPnL);
    const estimatedTrades = remaining / getAdjustedProfitTarget();

    return {
      progressPercent: Math.min(100, Math.max(0, progressPercent)),
      remaining,
      estimatedTrades: Math.ceil(estimatedTrades),
      isComplete: currentPnL >= dailyTarget,
    };
  }, [currentPnL, dailyTarget, getAdjustedProfitTarget]);

  return {
    portfolioMetrics,
    positionSizing,
    shouldContinueTrading,
    getAdjustedProfitTarget,
    progressMetrics,
  };
}
