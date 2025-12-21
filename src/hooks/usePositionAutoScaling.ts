import { useState, useEffect, useMemo } from 'react';
import { profitLockStrategy } from '@/lib/profitLockStrategy';
import type { RegimeType } from '@/hooks/useJarvisRegime';

interface PositionScalingConfig {
  basePositionSize: number;
  minMultiplier: number;
  maxMultiplier: number;
  winsToIncrease: number;
  lossesToDecrease: number;
  increasePercent: number;
  decreasePercent: number;
  // Regime-based scaling
  enableRegimeScaling?: boolean;
  bullMultiplier?: number;
  bearMultiplier?: number;
  chopMultiplier?: number;
  regimeConfidenceThreshold?: number;
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
  // Regime-specific returns
  regimeMultiplier: number;
  regimeConfidence: number;
  combinedScalingReason: string;
}

const DEFAULT_CONFIG: PositionScalingConfig = {
  basePositionSize: 100,
  minMultiplier: 0.5,
  maxMultiplier: 1.5,
  winsToIncrease: 3,
  lossesToDecrease: 2,
  increasePercent: 0.1,
  decreasePercent: 0.2,
  // Regime defaults
  enableRegimeScaling: true,
  bullMultiplier: 1.2,
  bearMultiplier: 1.0,
  chopMultiplier: 0.8,
  regimeConfidenceThreshold: 0.5,
};

interface UsePositionAutoScalingProps {
  config?: Partial<PositionScalingConfig>;
  regime?: RegimeType;
  deviation?: number;
}

export function usePositionAutoScaling({
  config = {},
  regime,
  deviation = 0,
}: UsePositionAutoScalingProps = {}): PositionScalingResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [streakMultiplier, setStreakMultiplier] = useState(1.0);
  const [lastRecordedWins, setLastRecordedWins] = useState(0);
  const [lastRecordedLosses, setLastRecordedLosses] = useState(0);

  const stats = profitLockStrategy.getStats();
  const consecutiveWins = stats.consecutiveWins;
  const consecutiveLosses = stats.consecutiveLosses;

  // Calculate regime confidence based on deviation from EMA
  const regimeConfidence = useMemo(() => {
    if (!regime || !mergedConfig.enableRegimeScaling) return 0;
    // 1% deviation = 100% confidence, 0.5% = 50%
    return Math.min(1, Math.abs(deviation) / 1.0);
  }, [deviation, regime, mergedConfig.enableRegimeScaling]);

  // Calculate regime multiplier
  const regimeMultiplier = useMemo(() => {
    if (!regime || !mergedConfig.enableRegimeScaling) return 1.0;
    if (regimeConfidence < (mergedConfig.regimeConfidenceThreshold ?? 0.5)) return 1.0;

    switch (regime) {
      case 'BULL': return mergedConfig.bullMultiplier ?? 1.2;
      case 'BEAR': return mergedConfig.bearMultiplier ?? 1.0;
      case 'CHOP': return mergedConfig.chopMultiplier ?? 0.8;
      default: return 1.0;
    }
  }, [regime, regimeConfidence, mergedConfig]);

  // Recalculate streak multiplier when streaks change
  useEffect(() => {
    if (consecutiveWins > lastRecordedWins && consecutiveWins >= mergedConfig.winsToIncrease) {
      setStreakMultiplier(prev => {
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
    if (consecutiveLosses > lastRecordedLosses && consecutiveLosses >= mergedConfig.lossesToDecrease) {
      setStreakMultiplier(prev => {
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

  useEffect(() => {
    if (consecutiveWins === 0 && consecutiveLosses === 0 && streakMultiplier !== 1.0) {
      setStreakMultiplier(prev => {
        if (prev > 1.0) return Math.max(1.0, prev - 0.05);
        if (prev < 1.0) return Math.min(1.0, prev + 0.05);
        return prev;
      });
    }
  }, [consecutiveWins, consecutiveLosses, streakMultiplier]);

  // Combined multiplier
  const combinedMultiplier = useMemo(() => {
    const combined = streakMultiplier * regimeMultiplier;
    return Math.max(mergedConfig.minMultiplier, Math.min(mergedConfig.maxMultiplier, combined));
  }, [streakMultiplier, regimeMultiplier, mergedConfig.minMultiplier, mergedConfig.maxMultiplier]);

  const scalingReason = useMemo(() => {
    if (consecutiveWins >= mergedConfig.winsToIncrease) {
      return `Winning streak (${consecutiveWins} wins) - Position increased`;
    }
    if (consecutiveLosses >= mergedConfig.lossesToDecrease) {
      return `Loss recovery mode (${consecutiveLosses} losses) - Position reduced`;
    }
    if (streakMultiplier > 1.0) {
      return 'Elevated from previous winning streak';
    }
    if (streakMultiplier < 1.0) {
      return 'Reduced from previous losses';
    }
    return 'Base position size';
  }, [consecutiveWins, consecutiveLosses, streakMultiplier, mergedConfig]);

  const combinedScalingReason = useMemo(() => {
    const parts: string[] = [];
    
    if (scalingReason !== 'Base position size') {
      parts.push(scalingReason);
    }
    
    if (regime && mergedConfig.enableRegimeScaling && regimeConfidence >= (mergedConfig.regimeConfidenceThreshold ?? 0.5)) {
      const regimeEffect = regimeMultiplier > 1 ? 'boost' : regimeMultiplier < 1 ? 'reduction' : 'neutral';
      parts.push(`${regime} regime ${regimeEffect} (${(regimeConfidence * 100).toFixed(0)}% confidence)`);
    }
    
    return parts.length > 0 ? parts.join(' + ') : 'Base position size';
  }, [scalingReason, regime, regimeMultiplier, regimeConfidence, mergedConfig]);

  const recentPerformance = useMemo(() => {
    if (consecutiveWins >= 2) return 'winning';
    if (consecutiveLosses >= 2) return 'losing';
    return 'neutral';
  }, [consecutiveWins, consecutiveLosses]);

  return {
    currentMultiplier: combinedMultiplier,
    scaledPositionSize: Math.round(mergedConfig.basePositionSize * combinedMultiplier * 100) / 100,
    consecutiveWins,
    consecutiveLosses,
    scalingReason,
    isAtMinimum: combinedMultiplier <= mergedConfig.minMultiplier,
    isAtMaximum: combinedMultiplier >= mergedConfig.maxMultiplier,
    recentPerformance,
    regimeMultiplier,
    regimeConfidence,
    combinedScalingReason,
  };
}

// Helper to calculate dynamic position size
export function calculateScaledPositionSize(
  baseSize: number,
  consecutiveWins: number,
  consecutiveLosses: number,
  regime?: RegimeType,
  deviation?: number
): { size: number; multiplier: number; reason: string } {
  let multiplier = 1.0;
  let reason = 'Base position size';

  // Streak-based scaling
  if (consecutiveWins >= 5) {
    multiplier = 1.5;
    reason = `Hot streak (${consecutiveWins} wins)`;
  } else if (consecutiveWins >= 3) {
    multiplier = 1.2;
    reason = `Winning streak (${consecutiveWins} wins)`;
  }

  if (consecutiveLosses >= 3) {
    multiplier = 0.5;
    reason = `Loss recovery mode (${consecutiveLosses} losses)`;
  } else if (consecutiveLosses >= 2) {
    multiplier = 0.8;
    reason = `Caution mode (${consecutiveLosses} losses)`;
  }

  // Regime-based adjustment
  if (regime && deviation !== undefined) {
    const regimeConfidence = Math.min(1, Math.abs(deviation) / 1.0);
    if (regimeConfidence >= 0.5) {
      const regimeMult = regime === 'BULL' ? 1.2 : regime === 'CHOP' ? 0.8 : 1.0;
      multiplier *= regimeMult;
      reason += ` × ${regime} regime`;
    }
  }

  return {
    size: Math.round(baseSize * multiplier * 100) / 100,
    multiplier,
    reason,
  };
}
