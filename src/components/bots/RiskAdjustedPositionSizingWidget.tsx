import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, AlertTriangle, Zap, Target, Clock } from 'lucide-react';
import { useRiskAdjustedPositionSizing } from '@/hooks/useRiskAdjustedPositionSizing';
import { cn } from '@/lib/utils';

interface RiskAdjustedPositionSizingWidgetProps {
  mode?: 'spot' | 'leverage';
  compact?: boolean;
}

export function RiskAdjustedPositionSizingWidget({ 
  mode = 'spot',
  compact = false 
}: RiskAdjustedPositionSizingWidgetProps) {
  const { recommendation, riskMetrics, isLoading, minSize, maxSize, targetProfit } = 
    useRiskAdjustedPositionSizing(mode);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const { adjustedSize, riskLevel, expectedTimeToProfit, reasoning, riskMultiplier } = recommendation;
  const { currentDrawdown, winRate, recentVolatility } = riskMetrics;

  const riskColor = {
    low: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    medium: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
    high: 'text-red-500 bg-red-500/10 border-red-500/30',
  }[riskLevel];

  const sizeProgress = ((adjustedSize - minSize) / (maxSize - minSize)) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">${adjustedSize}</span>
        </div>
        <Badge variant="outline" className={cn("text-xs", riskColor)}>
          {riskLevel}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          ~{expectedTimeToProfit}m
        </div>
      </div>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Smart Position Sizing
          </span>
          <Badge variant="outline" className={cn("text-xs", riskColor)}>
            {riskLevel} risk
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main recommendation */}
        <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="text-3xl font-bold text-primary">${adjustedSize}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Recommended for ${targetProfit.toFixed(2)} profit target
          </div>
        </div>

        {/* Size gauge */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${minSize}</span>
            <span>${maxSize}</span>
          </div>
          <Progress value={sizeProgress} className="h-2" />
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground">Volatility</div>
            <div className="font-mono font-bold text-sm">
              {(recentVolatility * 100).toFixed(2)}%
            </div>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="font-mono font-bold text-sm text-emerald-500">
              {(winRate * 100).toFixed(0)}%
            </div>
          </div>
          <div className="p-2 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground">Est. Time</div>
            <div className="font-mono font-bold text-sm">
              ~{expectedTimeToProfit}m
            </div>
          </div>
        </div>

        {/* Risk adjustments */}
        <div className="space-y-2">
          {currentDrawdown > 5 && (
            <div className="flex items-center gap-2 text-xs text-amber-500">
              <TrendingDown className="h-3 w-3" />
              <span>{currentDrawdown.toFixed(1)}% drawdown → {((1 - riskMultiplier) * 100).toFixed(0)}% size reduction</span>
            </div>
          )}
          {winRate > 0.8 && (
            <div className="flex items-center gap-2 text-xs text-emerald-500">
              <TrendingUp className="h-3 w-3" />
              <span>High win rate → optimized for speed</span>
            </div>
          )}
          {recentVolatility < 0.3 && (
            <div className="flex items-center gap-2 text-xs text-blue-500">
              <AlertTriangle className="h-3 w-3" />
              <span>Low volatility → larger size needed</span>
            </div>
          )}
        </div>

        {/* Reasoning */}
        <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
          {reasoning}
        </div>
      </CardContent>
    </Card>
  );
}
