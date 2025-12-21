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

  // Calculate regime confidence based on deviation from EMA (1% = 100%)
  const regimeConfidence = useMemo(() => {
    if (!regime || !mergedConfig.enableRegimeScaling) return 0;
    return Math.min(1, Math.abs(deviation) / 1.0);
  }, [deviation, regime, mergedConfig.enableRegimeScaling]);

  // Calculate regime multiplier with PROGRESSIVE CONFIDENCE-BASED SCALING
  // Instead of binary threshold, the multiplier scales proportionally with confidence
  const regimeMultiplier = useMemo(() => {
    if (!regime || !mergedConfig.enableRegimeScaling) return 1.0;
    
    // Minimum threshold - below 30% confidence, no scaling
    const minConfidenceThreshold = 0.3;
    if (regimeConfidence < minConfidenceThreshold) return 1.0;

    // Get base target multiplier for this regime
    let baseMultiplier: number;
    switch (regime) {
      case 'BULL': 
        baseMultiplier = mergedConfig.bullMultiplier ?? 1.2; // Larger in bullish trends
        break;
      case 'BEAR': 
        baseMultiplier = mergedConfig.bearMultiplier ?? 1.0; // Neutral in bearish
        break;
      case 'CHOP': 
        baseMultiplier = mergedConfig.chopMultiplier ?? 0.8; // Smaller in choppy markets
        break;
      default: 
        return 1.0;
    }

    // PROGRESSIVE SCALING: Scale multiplier proportionally with confidence
    // At 30% confidence → minimal scaling (50% of the way to base)
    // At 70% confidence → strong scaling (90% of the way to base)
    // At 100% confidence → full base multiplier
    const confidenceScale = (regimeConfidence - minConfidenceThreshold) / (1 - minConfidenceThreshold);
    
    // Smooth interpolation from 1.0 to baseMultiplier based on confidence
    const progressiveMultiplier = 1.0 + (baseMultiplier - 1.0) * confidenceScale;
    
    console.log(`📊 Progressive scaling: ${regime} @ ${(regimeConfidence * 100).toFixed(0)}% confidence → ${progressiveMultiplier.toFixed(3)}x multiplier`);
    
    return progressiveMultiplier;
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

  // Regime-based adjustment with progressive scaling
  if (regime && deviation !== undefined) {
    const regimeConfidence = Math.min(1, Math.abs(deviation) / 1.0);
    const minConfidenceThreshold = 0.3;
    
    if (regimeConfidence >= minConfidenceThreshold) {
      // Get base multiplier for regime
      const baseRegimeMult = regime === 'BULL' ? 1.2 : regime === 'CHOP' ? 0.8 : 1.0;
      
      // Progressive scaling based on confidence
      const confidenceScale = (regimeConfidence - minConfidenceThreshold) / (1 - minConfidenceThreshold);
      const progressiveRegimeMult = 1.0 + (baseRegimeMult - 1.0) * confidenceScale;
      
      multiplier *= progressiveRegimeMult;
      reason += ` × ${regime} (${(regimeConfidence * 100).toFixed(0)}% conf)`;
    }
  }

  return {
    size: Math.round(baseSize * multiplier * 100) / 100,
    multiplier,
    reason,
  };
}
