import { Zap, TrendingUp, TrendingDown, Minus, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useVolatilityScanner } from '@/hooks/useVolatilityScanner';

interface VolatilityOpportunityIndicatorProps {
  className?: string;
}

export function VolatilityOpportunityIndicator({ className }: VolatilityOpportunityIndicatorProps) {
  const { topPair, loading } = useVolatilityScanner();

  if (loading || !topPair) {
    return null;
  }

  const MomentumIcon = topPair.momentum === 'up' 
    ? TrendingUp 
    : topPair.momentum === 'down' 
      ? TrendingDown 
      : Minus;

  const momentumColor = topPair.momentum === 'up' 
    ? 'text-primary border-primary/30' 
    : topPair.momentum === 'down' 
      ? 'text-destructive border-destructive/30' 
      : 'text-muted-foreground border-border';

  return (
    <div className={cn(
      "p-2 bg-gradient-to-r from-warning/10 to-orange-500/10 rounded-lg border border-warning/30",
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-warning" />
          <span className="text-[10px] font-medium text-warning">Best Opportunity</span>
        </div>
        <Badge 
          variant="outline" 
          className={cn("text-[9px] px-1.5", momentumColor)}
        >
          <MomentumIcon className="w-3 h-3 mr-0.5" />
          {topPair.symbol}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Vol: <span className="text-foreground font-mono">{topPair.volatilityPercent.toFixed(2)}%</span>
          </span>
          <span className="text-muted-foreground">
            Score: <span className="text-foreground font-mono">{topPair.profitPotentialScore}/100</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Timer className="w-3 h-3" />
          <span className="font-mono">{Math.round(topPair.estimatedTimeToProfit)}s</span>
        </div>
      </div>
    </div>
  );
}
