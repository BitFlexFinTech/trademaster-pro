import { useWebSocketPositionMonitor, OpenPosition } from '@/hooks/useWebSocketPositionMonitor';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LivePositionProfitTrackerProps {
  positions: OpenPosition[];
  profitTarget?: number;
  onProfitTargetHit: (position: OpenPosition, currentPrice: number, profit: number) => void;
  className?: string;
}

// Dynamic color based on progress percentage
const getProgressColor = (progress: number): string => {
  if (progress >= 80) return 'bg-green-500';
  if (progress >= 50) return 'bg-yellow-500';
  if (progress >= 25) return 'bg-orange-500';
  return 'bg-red-500';
};

// Get progress bar background gradient
const getProgressBg = (progress: number): string => {
  if (progress >= 80) return 'bg-green-500/20';
  if (progress >= 50) return 'bg-yellow-500/10';
  return 'bg-secondary';
};

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
    <div className={cn("space-y-2 p-2 rounded-lg border bg-card/50", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <Target className="h-3 w-3 text-primary" />
          <span className="font-medium">Live Position Monitor</span>
        </span>
        <Badge variant={isMonitoring ? "default" : "secondary"} className="text-[9px] h-4 px-1.5 gap-1">
          <Zap className={cn("h-2.5 w-2.5", isMonitoring && "animate-pulse text-yellow-500")} />
          {isMonitoring ? `${checksPerSecond}/s` : 'Offline'}
        </Badge>
      </div>

      <div className="space-y-2">
        {positionProfits.map((pos) => {
          const isProfit = pos.netProfit >= 0;
          const progress = pos.progressToTarget || 0;
          const isClose = progress >= 80;
          const distanceToTarget = Math.max(0, profitTarget - (pos.netProfit || 0));
          
          // Calculate hold time if openedAt exists
          const holdTimeMs = pos.openedAt ? Date.now() - pos.openedAt : 0;
          const holdTimeSec = holdTimeMs / 1000;
          
          return (
            <div
              key={pos.id}
              className={cn(
                "p-2 rounded-md border text-xs transition-all duration-300",
                isClose && "border-green-500/50 bg-green-500/5",
                isClose && "animate-pulse"
              )}
            >
              {/* Header: Symbol, Direction, Price, P&L */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {pos.direction === 'long' ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className="font-mono font-medium">
                    {pos.symbol || pos.pair}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[7px] h-3 px-1",
                      pos.direction === 'long' ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"
                    )}
                  >
                    {pos.direction?.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-[10px]">
                    ${pos.currentPrice?.toFixed(2) || '---'}
                  </span>
                  <span className={cn(
                    "font-mono font-bold",
                    isProfit ? "text-green-500" : "text-red-500"
                  )}>
                    {isProfit ? '+' : ''}${(pos.netProfit || 0).toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Progress Bar with Gradient */}
              <div className="mb-1.5">
                <div className={cn("h-2 rounded-full overflow-hidden", getProgressBg(progress))}>
                  <div 
                    className={cn(
                      "h-full transition-all duration-150 rounded-full",
                      getProgressColor(progress),
                      isClose && "shadow-lg shadow-green-500/30"
                    )}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              </div>
              
              {/* Stats Row: Progress %, Distance to Target, Hold Time */}
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span className={cn(
                  "font-mono font-medium",
                  progress >= 50 && "text-yellow-500",
                  progress >= 80 && "text-green-500"
                )}>
                  {progress.toFixed(0)}%
                </span>
                
                <span>
                  ${distanceToTarget.toFixed(2)} to target
                </span>
                
                {holdTimeSec > 0 && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {holdTimeSec.toFixed(1)}s
                  </span>
                )}
              </div>
              
              {/* Near Target Alert */}
              {isClose && (
                <div className="mt-1.5 py-1 px-2 rounded bg-green-500/10 border border-green-500/30 text-green-500 font-medium text-center text-[10px]">
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
