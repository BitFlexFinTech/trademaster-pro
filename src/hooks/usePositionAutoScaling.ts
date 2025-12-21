import { useState, useEffect, useCallback, useMemo } from 'react';
import { profitLockStrategy } from '@/lib/profitLockStrategy';

interface PositionScalingConfig {
  basePositionSize: number;
  minMultiplier: number;  // Minimum position size multiplier (e.g., 0.5 = 50%)
  maxMultiplier: number;  // Maximum position size multiplier (e.g., 1.5 = 150%)
  winsToIncrease: number; // Consecutive wins needed to increase
  lossesToDecrease: number; // Consecutive losses to decrease
  increasePercent: number; // How much to increase per step (e.g., 0.1 = 10%)
  decreasePercent: number; // How much to decrease per step (e.g., 0.2 = 20%)
}

interface PositionScalingResult {
  currentMultiplier: number;
  scaledPositionSize: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  scalingReason: string;
  isAtMinimum: boolean;
  isAtMaximum: boolean;
  recentPerformance: 'winning' | 'losing' | 'neutral';
}

const DEFAULT_CONFIG: PositionScalingConfig = {
  basePositionSize: 100,
  minMultiplier: 0.5,  // 50% minimum
  maxMultiplier: 1.5,  // 150% maximum
  winsToIncrease: 3,   // 3 consecutive wins to scale up
  lossesToDecrease: 2, // 2 consecutive losses to scale down
  increasePercent: 0.1, // 10% increase per step
  decreasePercent: 0.2, // 20% decrease per step
};

export function usePositionAutoScaling(
  config: Partial<PositionScalingConfig> = {}
): PositionScalingResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [multiplier, setMultiplier] = useState(1.0);
  const [lastRecordedWins, setLastRecordedWins] = useState(0);
  const [lastRecordedLosses, setLastRecordedLosses] = useState(0);

  // Get current streak from profitLockStrategy
  const stats = profitLockStrategy.getStats();
  const consecutiveWins = stats.consecutiveWins;
  const consecutiveLosses = stats.consecutiveLosses;

  // Recalculate multiplier when streaks change
  useEffect(() => {
    // Check for win streak increase
    if (consecutiveWins > lastRecordedWins && consecutiveWins >= mergedConfig.winsToIncrease) {
      // Scale up
      setMultiplier(prev => {
        const newMultiplier = Math.min(
          mergedConfig.maxMultiplier,
          prev + mergedConfig.increasePercent
        );
        console.log(`📈 Position scaled UP: ${(prev * 100).toFixed(0)}% → ${(newMultiplier * 100).toFixed(0)}% (${consecutiveWins} consecutive wins)`);
        return newMultiplier;
      });
    }
    setLastRecordedWins(consecutiveWins);
  }, [consecutiveWins, lastRecordedWins, mergedConfig.winsToIncrease, mergedConfig.maxMultiplier, mergedConfig.increasePercent]);

  useEffect(() => {
    // Check for loss streak increase
    if (consecutiveLosses > lastRecordedLosses && consecutiveLosses >= mergedConfig.lossesToDecrease) {
      // Scale down
      setMultiplier(prev => {
        const newMultiplier = Math.max(
          mergedConfig.minMultiplier,
          prev - mergedConfig.decreasePercent
        );
        console.log(`📉 Position scaled DOWN: ${(prev * 100).toFixed(0)}% → ${(newMultiplier * 100).toFixed(0)}% (${consecutiveLosses} consecutive losses)`);
        return newMultiplier;
      });
    }
    setLastRecordedLosses(consecutiveLosses);
  }, [consecutiveLosses, lastRecordedLosses, mergedConfig.lossesToDecrease, mergedConfig.minMultiplier, mergedConfig.decreasePercent]);

  // Reset multiplier when streak breaks
  useEffect(() => {
    if (consecutiveWins === 0 && consecutiveLosses === 0 && multiplier !== 1.0) {
      // Streak broken, gradually return to base
      setMultiplier(prev => {
        if (prev > 1.0) return Math.max(1.0, prev - 0.05);
        if (prev < 1.0) return Math.min(1.0, prev + 0.05);
        return prev;
      });
    }
  }, [consecutiveWins, consecutiveLosses, multiplier]);

  const scalingReason = useMemo(() => {
    if (consecutiveWins >= mergedConfig.winsToIncrease) {
      return `Winning streak (${consecutiveWins} wins) - Position increased`;
    }
    if (consecutiveLosses >= mergedConfig.lossesToDecrease) {
      return `Loss recovery mode (${consecutiveLosses} losses) - Position reduced`;
    }
    if (multiplier > 1.0) {
      return 'Elevated from previous winning streak';
    }
    if (multiplier < 1.0) {
      return 'Reduced from previous losses';
    }
    return 'Base position size';
  }, [consecutiveWins, consecutiveLosses, multiplier, mergedConfig]);

  const recentPerformance = useMemo(() => {
    if (consecutiveWins >= 2) return 'winning';
    if (consecutiveLosses >= 2) return 'losing';
    return 'neutral';
  }, [consecutiveWins, consecutiveLosses]);

  return {
    currentMultiplier: multiplier,
    scaledPositionSize: Math.round(mergedConfig.basePositionSize * multiplier * 100) / 100,
    consecutiveWins,
    consecutiveLosses,
    scalingReason,
    isAtMinimum: multiplier <= mergedConfig.minMultiplier,
    isAtMaximum: multiplier >= mergedConfig.maxMultiplier,
    recentPerformance,
  };
}

// Helper to calculate dynamic position size
export function calculateScaledPositionSize(
  baseSize: number,
  consecutiveWins: number,
  consecutiveLosses: number
): { size: number; multiplier: number; reason: string } {
  let multiplier = 1.0;
  let reason = 'Base position size';

  // Scale up on winning streak
  if (consecutiveWins >= 5) {
    multiplier = 1.5;  // 50% increase
    reason = `Hot streak (${consecutiveWins} wins)`;
  } else if (consecutiveWins >= 3) {
    multiplier = 1.2;  // 20% increase
    reason = `Winning streak (${consecutiveWins} wins)`;
  }

  // Scale down on losing streak
  if (consecutiveLosses >= 3) {
    multiplier = 0.5;  // 50% reduction
    reason = `Loss recovery mode (${consecutiveLosses} losses)`;
  } else if (consecutiveLosses >= 2) {
    multiplier = 0.8;  // 20% reduction
    reason = `Caution mode (${consecutiveLosses} losses)`;
  }

  return {
    size: Math.round(baseSize * multiplier * 100) / 100,
    multiplier,
    reason,
  };
}
