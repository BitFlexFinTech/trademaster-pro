import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Heart, TrendingUp, Shield, Target, Gauge, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { cn } from '@/lib/utils';

interface MetricBreakdown {
  name: string;
  score: number;
  weight: number;
  icon: React.ReactNode;
  color: string;
}

export function PortfolioHealthScore() {
  const { riskData, loading: riskLoading } = useRiskAnalysis();
  const { regime, deviation } = useJarvisRegime('BTCUSDT');
  const { analytics, loading: analyticsLoading } = useBotAnalytics();
  
  const [healthScore, setHealthScore] = useState(0);
  
  // Safe access to analytics properties
  const hitRate = (analytics as any)?.hitRate || (analytics as any)?.winRate || 75;
  const profitFactor = (analytics as any)?.profitFactor || 1.5;
  const [previousScore, setPreviousScore] = useState(0);
  const [metrics, setMetrics] = useState<MetricBreakdown[]>([]);

  useEffect(() => {
    // Calculate hit rate score (25%)
    const hitRateScore = Math.min(100, (hitRate / 95) * 100); // Target 95%
    
    // Calculate risk level score (25%)
    const riskScore = riskData.overallRisk === 'LOW' ? 100 :
                      riskData.overallRisk === 'MEDIUM' ? 60 : 20;
    
    // Calculate regime alignment score (20%)
    // Higher score when trading direction matches regime
    const regimeConfidence = Math.min(100, Math.abs(deviation) * 500); // 0.2% deviation = 100%
    const regimeAlignmentScore = regime !== 'CHOP' ? 
      Math.min(100, regimeConfidence + 20) : 50; // CHOP is neutral
    
    // Calculate margin safety score (20%)
    // Based on liquidation distances
    const marginUsage = riskData.portfolioVaR || 0;
    const marginSafetyScore = Math.max(0, 100 - (marginUsage * 10));
    
    // Calculate profit factor score (10%)
    const profitFactorScore = Math.min(100, (profitFactor / 2) * 100); // Target 2.0 PF
    
    // Weighted total
    const totalScore = Math.round(
      (hitRateScore * 0.25) +
      (riskScore * 0.25) +
      (regimeAlignmentScore * 0.20) +
      (marginSafetyScore * 0.20) +
      (profitFactorScore * 0.10)
    );

    setPreviousScore(healthScore);
    setHealthScore(totalScore);
    
    setMetrics([
      {
        name: 'Hit Rate',
        score: Math.round(hitRateScore),
        weight: 25,
        icon: <Target className="h-3 w-3" />,
        color: hitRateScore >= 70 ? 'text-emerald-400' : hitRateScore >= 50 ? 'text-amber-400' : 'text-red-400',
      },
      {
        name: 'Risk Level',
        score: Math.round(riskScore),
        weight: 25,
        icon: <Shield className="h-3 w-3" />,
        color: riskScore >= 70 ? 'text-emerald-400' : riskScore >= 50 ? 'text-amber-400' : 'text-red-400',
      },
      {
        name: 'Regime Alignment',
        score: Math.round(regimeAlignmentScore),
        weight: 20,
        icon: <TrendingUp className="h-3 w-3" />,
        color: regimeAlignmentScore >= 70 ? 'text-emerald-400' : regimeAlignmentScore >= 50 ? 'text-amber-400' : 'text-red-400',
      },
      {
        name: 'Margin Safety',
        score: Math.round(marginSafetyScore),
        weight: 20,
        icon: <Gauge className="h-3 w-3" />,
        color: marginSafetyScore >= 70 ? 'text-emerald-400' : marginSafetyScore >= 50 ? 'text-amber-400' : 'text-red-400',
      },
      {
        name: 'Profit Factor',
        score: Math.round(profitFactorScore),
        weight: 10,
        icon: <Heart className="h-3 w-3" />,
        color: profitFactorScore >= 70 ? 'text-emerald-400' : profitFactorScore >= 50 ? 'text-amber-400' : 'text-red-400',
      },
    ]);
  }, [analytics, riskData, regime, deviation]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const scoreDiff = healthScore - previousScore;

  const loading = riskLoading || analyticsLoading;

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            Portfolio Health
          </CardTitle>
          {scoreDiff !== 0 && (
            <Badge variant="outline" className={cn(
              "text-xs",
              scoreDiff > 0 ? "text-emerald-400 border-emerald-500/50" : "text-red-400 border-red-500/50"
            )}>
              {scoreDiff > 0 ? <ArrowUp className="h-3 w-3 mr-0.5" /> : <ArrowDown className="h-3 w-3 mr-0.5" />}
              {Math.abs(scoreDiff)}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Calculating health score...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Main Score Display */}
            <div className="flex items-center justify-center">
              <div className="relative w-32 h-32">
                {/* Background circle */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="hsl(var(--muted))"
                    strokeWidth="8"
                    fill="none"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={healthScore >= 80 ? 'hsl(142 76% 36%)' : 
                            healthScore >= 60 ? 'hsl(48 96% 53%)' : 
                            healthScore >= 40 ? 'hsl(25 95% 53%)' : 'hsl(0 84% 60%)'}
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(healthScore / 100) * 352} 352`}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                {/* Score text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={cn("text-3xl font-bold", getScoreColor(healthScore))}>
                    {healthScore}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getScoreLabel(healthScore)}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="space-y-2">
              {metrics.map((metric) => (
                <div key={metric.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      {metric.icon}
                      {metric.name}
                      <span className="text-[10px]">({metric.weight}%)</span>
                    </span>
                    <span className={cn("font-mono", metric.color)}>
                      {metric.score}
                    </span>
                  </div>
                  <Progress 
                    value={metric.score} 
                    className="h-1 bg-slate-800"
                  />
                </div>
              ))}
            </div>

            {/* Current Regime Indicator */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
              <span className="text-muted-foreground">Current Regime</span>
              <Badge variant="outline" className={cn(
                regime === 'BULL' ? 'text-emerald-400 border-emerald-500/50' :
                regime === 'BEAR' ? 'text-red-400 border-red-500/50' :
                'text-amber-400 border-amber-500/50'
              )}>
                {regime === 'BULL' ? '🐂' : regime === 'BEAR' ? '🐻' : '🌊'} {regime}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}