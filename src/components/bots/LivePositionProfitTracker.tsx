import { useWebSocketPositionMonitor, OpenPosition } from '@/hooks/useWebSocketPositionMonitor';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LivePositionProfitTrackerProps {
  positions: OpenPosition[];
  profitTarget?: number;
  onProfitTargetHit: (position: OpenPosition, currentPrice: number, profit: number) => void;
  className?: string;
}

export function LivePositionProfitTracker({
  positions,
  profitTarget = 1.00,
  onProfitTargetHit,
  className,
}: LivePositionProfitTrackerProps) {
  const { isMonitoring, isConnected, getPositionProfits, checksPerSecond } = useWebSocketPositionMonitor({
    openPositions: positions,
    profitTarget,
    onProfitTargetHit,
    enabled: positions.length > 0,
  });

  const positionProfits = getPositionProfits();

  if (positions.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Target className="h-3 w-3" />
          Live Position Monitor
        </span>
        <Badge variant={isMonitoring ? "default" : "secondary"} className="text-xs gap-1">
          <Zap className={cn("h-3 w-3", isMonitoring && "animate-pulse text-yellow-500")} />
          {isMonitoring ? `${checksPerSecond} chk/s` : 'Offline'}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {positionProfits.map((pos) => {
          const isProfit = pos.netProfit >= 0;
          const isClose = pos.progressToTarget >= 80;
          
          return (
            <div
              key={pos.id}
              className={cn(
                "p-2 rounded-md border text-xs",
                isClose && "border-green-500/50 bg-green-500/5 animate-pulse"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  {pos.direction === 'long' ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className="font-mono font-medium">
                    {pos.symbol || pos.pair}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    ${pos.currentPrice?.toFixed(4) || '---'}
                  </span>
                  <span className={cn(
                    "font-mono font-bold",
                    isProfit ? "text-green-500" : "text-red-500"
                  )}>
                    {isProfit ? '+' : ''}{pos.netProfit?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Progress 
                  value={Math.max(0, pos.progressToTarget || 0)} 
                  className="h-1.5 flex-1"
                />
                <span className="text-muted-foreground w-12 text-right">
                  {(pos.progressToTarget || 0).toFixed(0)}%
                </span>
              </div>
              
              {isClose && (
                <div className="mt-1 text-green-500 font-medium text-center">
                  🎯 Near target - preparing to close!
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
