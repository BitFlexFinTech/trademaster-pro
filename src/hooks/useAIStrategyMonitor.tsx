import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface AIRecommendation {
  id: string;
  type: 'hit_rate' | 'signal_threshold' | 'profit_per_trade' | 'trade_frequency' | 'stop_loss';
  title: string;
  description: string;
  currentValue: number | string;
  suggestedValue: number | string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

interface StrategyMetrics {
  currentHitRate: number;
  targetHitRate: number;
  requiredHitRate: number;
  signalThreshold: number;
  currentPnL: number;
  dailyTarget: number;
  tradesExecuted: number;
  avgProfitPerWin: number;
  avgLossPerLoss: number;
  projectedDailyPnL: number;
  isOnTrack: boolean;
}

interface UseAIStrategyMonitorProps {
  isRunning: boolean;
  dailyTarget: number;
  profitPerTrade: number;
  lossPerTrade: number;
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  onRecommendation?: (recommendation: AIRecommendation) => void;
}

const AGGRESSIVE_SCALP_CONFIG = {
  dailyTarget: 100,
  minProfitPerTrade: 1.00,
  lossPerTrade: 0.60,
  tradeIntervalMs: 500,
  maxTradesPerHour: 120,
  targetHitRate: 0.95,
  minSignalScore: 0.90,
  maxDrawdownPercent: 15,
};

export function useAIStrategyMonitor({
  isRunning,
  dailyTarget,
  profitPerTrade,
  lossPerTrade,
  currentPnL,
  tradesExecuted,
  hitRate,
  onRecommendation,
}: UseAIStrategyMonitorProps) {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [strategyMetrics, setStrategyMetrics] = useState<StrategyMetrics | null>(null);
  const [signalThreshold, setSignalThreshold] = useState(0.90);
  const lastAnalysisRef = useRef<number>(0);

  /**
   * Calculate the required hit rate to achieve daily target
   * Formula: RequiredHitRate = (DailyTarget / ExpectedTrades + AvgLoss) / (AvgProfit + AvgLoss)
   */
  const calculateRequiredHitRate = useCallback((
    target: number,
    profit: number,
    loss: number,
    expectedTrades: number
  ): number => {
    if (expectedTrades <= 0 || (profit + loss) === 0) return 95;
    
    const profitNeededPerTrade = target / expectedTrades;
    const requiredHitRate = (profitNeededPerTrade + loss) / (profit + loss);
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, requiredHitRate)) * 100;
  }, []);

  /**
   * Calculate expected trades per day based on interval
   */
  const calculateExpectedTrades = useCallback((intervalMs: number): number => {
    const hoursPerDay = 24;
    const secondsPerHour = 3600;
    const tradesPerSecond = 1000 / intervalMs;
    return tradesPerSecond * secondsPerHour * hoursPerDay;
  }, []);

  /**
   * Generate AI recommendation based on current metrics
   */
  const generateRecommendation = useCallback((
    type: AIRecommendation['type'],
    currentValue: number | string,
    suggestedValue: number | string,
    reason: string,
    priority: AIRecommendation['priority'] = 'medium'
  ): AIRecommendation => {
    const titles: Record<AIRecommendation['type'], string> = {
      hit_rate: 'Adjust Hit Rate Target',
      signal_threshold: 'Modify Signal Threshold',
      profit_per_trade: 'Optimize Profit Target',
      trade_frequency: 'Adjust Trade Frequency',
      stop_loss: 'Revise Stop Loss',
    };

    return {
      id: `${type}-${Date.now()}`,
      type,
      title: titles[type],
      description: reason,
      currentValue,
      suggestedValue,
      impact: priority === 'high' ? 'Significant improvement expected' :
              priority === 'medium' ? 'Moderate improvement expected' :
              'Minor optimization',
      priority,
      createdAt: new Date(),
    };
  }, []);

  /**
   * Run AI analysis every 30 seconds while bot is running
   */
  useEffect(() => {
    if (!isRunning || !user) return;

    const analyzeStrategy = async () => {
      const now = Date.now();
      // Only analyze every 30 seconds
      if (now - lastAnalysisRef.current < 30000) return;
      lastAnalysisRef.current = now;

      // Calculate expected trades (assuming 500ms interval = 2 trades/second)
      const expectedTradesPerDay = calculateExpectedTrades(AGGRESSIVE_SCALP_CONFIG.tradeIntervalMs);
      
      // Calculate required hit rate for daily target
      const requiredHitRate = calculateRequiredHitRate(
        dailyTarget,
        profitPerTrade,
        lossPerTrade,
        expectedTradesPerDay
      );

      // Project daily P&L based on current performance
      const remainingTarget = dailyTarget - currentPnL;
      const avgPnlPerTrade = tradesExecuted > 0 ? currentPnL / tradesExecuted : 0;
      const tradesNeeded = avgPnlPerTrade > 0 ? Math.ceil(remainingTarget / avgPnlPerTrade) : Infinity;
      const projectedDailyPnL = tradesExecuted > 0 
        ? (currentPnL / tradesExecuted) * expectedTradesPerDay 
        : 0;

      const metrics: StrategyMetrics = {
        currentHitRate: hitRate,
        targetHitRate: AGGRESSIVE_SCALP_CONFIG.targetHitRate * 100,
        requiredHitRate,
        signalThreshold,
        currentPnL,
        dailyTarget,
        tradesExecuted,
        avgProfitPerWin: profitPerTrade,
        avgLossPerLoss: lossPerTrade,
        projectedDailyPnL,
        isOnTrack: hitRate >= requiredHitRate,
      };

      setStrategyMetrics(metrics);

      const newRecommendations: AIRecommendation[] = [];

      // Check if hit rate is below target and generate recommendations
      if (hitRate < 90) {
        // Critical - increase signal threshold significantly
        const newThreshold = Math.min(signalThreshold + 0.03, 0.98);
        newRecommendations.push(generateRecommendation(
          'signal_threshold',
          `${(signalThreshold * 100).toFixed(0)}%`,
          `${(newThreshold * 100).toFixed(0)}%`,
          `Hit rate at ${hitRate.toFixed(1)}% is critically low. Increasing signal threshold to ${(newThreshold * 100).toFixed(0)}% will filter out low-quality trades.`,
          'high'
        ));
        setSignalThreshold(newThreshold);
      } else if (hitRate < 95 && hitRate >= 90) {
        // Warning - minor adjustment
        const newThreshold = Math.min(signalThreshold + 0.01, 0.95);
        newRecommendations.push(generateRecommendation(
          'signal_threshold',
          `${(signalThreshold * 100).toFixed(0)}%`,
          `${(newThreshold * 100).toFixed(0)}%`,
          `Hit rate at ${hitRate.toFixed(1)}% is below 95% target. Small threshold increase recommended.`,
          'medium'
        ));
      } else if (hitRate >= 98) {
        // Elite - can relax slightly for more trades
        const newThreshold = Math.max(signalThreshold - 0.02, 0.88);
        newRecommendations.push(generateRecommendation(
          'trade_frequency',
          'Current',
          'Can increase',
          `Excellent ${hitRate.toFixed(1)}% hit rate allows for more aggressive trading. Consider reducing signal threshold to capture more opportunities.`,
          'low'
        ));
      }

      // Check if required hit rate is achievable
      if (requiredHitRate > 99) {
        newRecommendations.push(generateRecommendation(
          'profit_per_trade',
          `$${profitPerTrade.toFixed(2)}`,
          `$${(profitPerTrade * 1.5).toFixed(2)}`,
          `Required hit rate of ${requiredHitRate.toFixed(1)}% is unachievable. Increase profit per trade to lower the requirement.`,
          'high'
        ));
      } else if (requiredHitRate > hitRate) {
        const hitRateGap = requiredHitRate - hitRate;
        newRecommendations.push(generateRecommendation(
          'hit_rate',
          `${hitRate.toFixed(1)}%`,
          `${requiredHitRate.toFixed(1)}%`,
          `Need ${hitRateGap.toFixed(1)}% improvement to reach daily target. ${hitRateGap > 10 ? 'Consider reducing daily target or increasing profit per trade.' : 'Tightening signal filters.'}`,
          hitRateGap > 10 ? 'high' : 'medium'
        ));
      }

      // Save recommendations
      if (newRecommendations.length > 0) {
        setRecommendations(prev => [...newRecommendations, ...prev].slice(0, 10));
        
        // Notify parent of high-priority recommendations
        const highPriority = newRecommendations.find(r => r.priority === 'high');
        if (highPriority && onRecommendation) {
          onRecommendation(highPriority);
        }

        // Save to database as alerts
        for (const rec of newRecommendations) {
          await supabase.from('alerts').insert({
            user_id: user.id,
            alert_type: 'bot',
            title: `AI Suggestion: ${rec.title}`,
            message: rec.description,
            data: {
              type: rec.type,
              currentValue: rec.currentValue,
              suggestedValue: rec.suggestedValue,
              priority: rec.priority,
            },
          });
        }
      }
    };

    // Run immediately and then every 30 seconds
    analyzeStrategy();
    const interval = setInterval(analyzeStrategy, 30000);

    return () => clearInterval(interval);
  }, [
    isRunning,
    user,
    dailyTarget,
    profitPerTrade,
    lossPerTrade,
    currentPnL,
    tradesExecuted,
    hitRate,
    signalThreshold,
    calculateRequiredHitRate,
    calculateExpectedTrades,
    generateRecommendation,
    onRecommendation,
  ]);

  /**
   * Apply a recommendation
   */
  const applyRecommendation = useCallback(async (recommendation: AIRecommendation) => {
    // Remove from list
    setRecommendations(prev => prev.filter(r => r.id !== recommendation.id));

    // Apply the change based on type
    switch (recommendation.type) {
      case 'signal_threshold':
        const newThreshold = parseFloat(String(recommendation.suggestedValue).replace('%', '')) / 100;
        setSignalThreshold(newThreshold);
        break;
      // Other types would be handled by the parent component
    }

    return recommendation.suggestedValue;
  }, []);

  /**
   * Dismiss a recommendation
   */
  const dismissRecommendation = useCallback((id: string) => {
    setRecommendations(prev => prev.filter(r => r.id !== id));
  }, []);

  return {
    recommendations,
    strategyMetrics,
    signalThreshold,
    applyRecommendation,
    dismissRecommendation,
    requiredHitRate: strategyMetrics?.requiredHitRate || 95,
  };
}
