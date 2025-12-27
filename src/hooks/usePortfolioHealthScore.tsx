import { useState, useEffect, useCallback } from 'react';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';

interface MetricBreakdown {
  name: string;
  score: number;
  weight: number;
  description: string;
}

interface HealthScoreResult {
  score: number;
  previousScore: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  trend: 'up' | 'down' | 'stable';
  metrics: MetricBreakdown[];
  loading: boolean;
}

export function usePortfolioHealthScore(): HealthScoreResult {
  const { riskData, loading: riskLoading } = useRiskAnalysis();
  const { regime, deviation } = useJarvisRegime('BTCUSDT');
  const { analytics, loading: analyticsLoading } = useBotAnalytics();
  
  const [score, setScore] = useState(0);
  const [previousScore, setPreviousScore] = useState(0);
  const [metrics, setMetrics] = useState<MetricBreakdown[]>([]);

  const calculateScore = useCallback(() => {
    // Hit Rate Score (25%)
    const hitRate = (analytics as any)?.hitRate || (analytics as any)?.winRate || 75;
    const hitRateScore = Math.min(100, (hitRate / 95) * 100);
    
    // Risk Level Score (25%)
    const riskScore = riskData.overallRisk === 'LOW' ? 100 :
                      riskData.overallRisk === 'MEDIUM' ? 60 : 20;
    
    // Regime Alignment Score (20%)
    const regimeConfidence = Math.min(100, Math.abs(deviation) * 500);
    const regimeAlignmentScore = regime !== 'CHOP' ? 
      Math.min(100, regimeConfidence + 20) : 50;
    
    // Margin Safety Score (20%)
    const marginUsage = riskData.portfolioVaR || 0;
    const marginSafetyScore = Math.max(0, 100 - (marginUsage * 10));
    
    // Profit Factor Score (10%)
    const profitFactor = (analytics as any)?.profitFactor || 1.5;
    const profitFactorScore = Math.min(100, (profitFactor / 2) * 100);
    
    // Weighted total
    const totalScore = Math.round(
      (hitRateScore * 0.25) +
      (riskScore * 0.25) +
      (regimeAlignmentScore * 0.20) +
      (marginSafetyScore * 0.20) +
      (profitFactorScore * 0.10)
    );

    setPreviousScore(score);
    setScore(totalScore);
    
    setMetrics([
      {
        name: 'Hit Rate',
        score: Math.round(hitRateScore),
        weight: 25,
        description: `Current: ${hitRate.toFixed(1)}% (Target: 95%)`,
      },
      {
        name: 'Risk Level',
        score: Math.round(riskScore),
        weight: 25,
        description: `Overall risk: ${riskData.overallRisk}`,
      },
      {
        name: 'Regime Alignment',
        score: Math.round(regimeAlignmentScore),
        weight: 20,
        description: `${regime} regime with ${regimeConfidence.toFixed(0)}% confidence`,
      },
      {
        name: 'Margin Safety',
        score: Math.round(marginSafetyScore),
        weight: 20,
        description: `VaR: ${marginUsage.toFixed(1)}%`,
      },
      {
        name: 'Profit Factor',
        score: Math.round(profitFactorScore),
        weight: 10,
        description: `Current: ${profitFactor.toFixed(2)} (Target: 2.0)`,
      },
    ]);
  }, [analytics, riskData, regime, deviation, score]);

  useEffect(() => {
    calculateScore();
  }, [calculateScore]);

  const getLabel = (s: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' => {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Fair';
    return 'Poor';
  };

  const getTrend = (): 'up' | 'down' | 'stable' => {
    const diff = score - previousScore;
    if (diff > 2) return 'up';
    if (diff < -2) return 'down';
    return 'stable';
  };

  return {
    score,
    previousScore,
    label: getLabel(score),
    trend: getTrend(),
    metrics,
    loading: riskLoading || analyticsLoading,
  };
}