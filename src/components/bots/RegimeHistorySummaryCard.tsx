import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { useRegimeHistory } from '@/hooks/useRegimeHistory';
import { cn } from '@/lib/utils';

export function RegimeHistorySummaryCard() {
  const { stats, isLoading } = useRegimeHistory('BTCUSDT', 30);

  // Helper to format minutes to hours/minutes
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const regimeData = [
    { 
      regime: 'BULL', 
      icon: TrendingUp,
      pnl: stats.bullPnL, 
      trades: stats.bullTrades, 
      avgDuration: stats.avgBullDuration,
      totalTime: stats.totalBullMinutes,
      bgClass: 'bg-green-500/10',
      textClass: 'text-green-400',
      borderClass: 'border-green-500/30',
      iconClass: 'text-green-500',
    },
    { 
      regime: 'BEAR', 
      icon: TrendingDown,
      pnl: stats.bearPnL, 
      trades: stats.bearTrades, 
      avgDuration: stats.avgBearDuration,
      totalTime: stats.totalBearMinutes,
      bgClass: 'bg-red-500/10',
      textClass: 'text-red-400',
      borderClass: 'border-red-500/30',
      iconClass: 'text-red-500',
    },
    { 
      regime: 'CHOP', 
      icon: Minus,
      pnl: stats.chopPnL, 
      trades: stats.chopTrades, 
      avgDuration: stats.avgChopDuration,
      totalTime: stats.totalChopMinutes,
      bgClass: 'bg-amber-500/10',
      textClass: 'text-amber-400',
      borderClass: 'border-amber-500/30',
      iconClass: 'text-amber-500',
    },
  ];

  if (isLoading) {
    return (
      <Card className="card-terminal">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-xs flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-purple-500" />
            Regime Performance (Loading...)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-terminal">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-purple-500" />
          Regime Performance (30d)
          <Badge variant="outline" className="text-[8px] ml-auto">
            {stats.transitionsCount} transitions
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="grid grid-cols-3 gap-2">
          {regimeData.map(({ regime, icon: Icon, pnl, trades, avgDuration, totalTime, bgClass, textClass, borderClass, iconClass }) => (
            <div 
              key={regime}
              className={cn(
                "flex flex-col p-2 rounded-lg border",
                bgClass, borderClass
              )}
            >
              <div className="flex items-center gap-1 mb-1">
                <Icon className={cn("h-3 w-3", iconClass)} />
                <span className={cn("text-[10px] font-bold", textClass)}>{regime}</span>
              </div>
              
              {/* P&L */}
              <div className={cn(
                "text-sm font-mono font-bold",
                pnl >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
              </div>
              
              {/* Stats */}
              <div className="flex flex-col gap-0.5 mt-1">
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Trades</span>
                  <span className="font-mono">{trades}</span>
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Avg Dur</span>
                  <span className="font-mono">{formatDuration(avgDuration)}</span>
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Total</span>
                  <span className="font-mono">{formatDuration(totalTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
