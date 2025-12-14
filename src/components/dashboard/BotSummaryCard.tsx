import { useBotRuns } from '@/hooks/useBotRuns';
import { Zap, TrendingUp, Target, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function BotSummaryCard() {
  const { bots, stats, loading, getSpotBot, getLeverageBot } = useBotRuns();

  if (loading) {
    return (
      <div className="card-terminal p-3 h-full flex flex-col">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  // Find BOTH running bots
  const spotBot = getSpotBot();
  const leverageBot = getLeverageBot();
  const runningCount = (spotBot ? 1 : 0) + (leverageBot ? 1 : 0);
  
  // Combined metrics
  const combinedPnL = (spotBot?.currentPnl || 0) + (leverageBot?.currentPnl || 0);
  const combinedTrades = (spotBot?.tradesExecuted || 0) + (leverageBot?.tradesExecuted || 0);
  const combinedHitRate = combinedTrades > 0 
    ? ((spotBot?.tradesExecuted || 0) * (spotBot?.hitRate || 0) + (leverageBot?.tradesExecuted || 0) * (leverageBot?.hitRate || 0)) / combinedTrades
    : stats.totalTrades > 0 ? bots.reduce((sum, b) => sum + b.hitRate, 0) / Math.max(bots.length, 1) : 0;

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-muted-foreground">GreenBack Bots</h3>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap flex items-center gap-1',
          runningCount > 0 ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
        )}>
          {runningCount > 0 && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
          {runningCount === 0 ? 'Stopped' : runningCount === 1 ? '1 Running' : '2 Running'}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="w-2.5 h-2.5" /> Today
          </span>
          <p className={cn(
            'text-lg font-bold font-mono',
            combinedPnL >= 0 ? 'text-primary' : 'text-destructive'
          )}>
            ${combinedPnL.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-2.5 h-2.5" /> Trades
          </span>
          <p className="text-lg font-bold text-foreground font-mono">
            {combinedTrades || stats.totalTrades}
          </p>
        </div>
      </div>

      {/* Bot Breakdown when both running */}
      {runningCount === 2 && (
        <div className="text-[9px] text-muted-foreground mb-2 flex gap-2">
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary" />
            Spot: <span className="text-primary font-mono">${spotBot?.currentPnl?.toFixed(2)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-warning" />
            Lev: <span className="text-warning font-mono">${leverageBot?.currentPnl?.toFixed(2)}</span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-auto text-[10px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Target className="w-2.5 h-2.5" />
          Hit Rate: <span className="text-primary font-mono">{combinedHitRate.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Zap className="w-2.5 h-2.5" />
          Total: <span className="text-primary font-mono">${stats.totalPnl.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
