import { useRealTimePnL } from '@/hooks/useRealTimePnL';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PnLTicker } from '@/components/bots/PnLTicker';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Activity,
  Zap,
  Trophy,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { formatDistanceToNow } from 'date-fns';

interface LivePnLDashboardProps {
  className?: string;
}

export function LivePnLDashboard({ className }: LivePnLDashboardProps) {
  const {
    currentPnL,
    dailyTarget,
    progressPercent,
    tradesCount,
    winsCount,
    lossesCount,
    winRate,
    bestTrade,
    worstTrade,
    avgTradeProfit,
    sessionStart,
    lastUpdate,
    recentPnLHistory,
    recentTrades,
    isLoading,
  } = useRealTimePnL();

  if (isLoading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isProfitable = currentPnL >= 0;
  const targetReached = currentPnL >= dailyTarget;

  return (
    <Card className={cn("bg-card border-border overflow-hidden flex flex-col", className)}>
      {/* Animated gradient border for target reached */}
      {targetReached && (
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 via-emerald-500/20 to-green-500/20 animate-pulse pointer-events-none" />
      )}
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary animate-pulse" />
            Live P&L Dashboard
          </CardTitle>
          <Badge variant={targetReached ? "default" : "secondary"} className="text-xs">
            {targetReached ? "🎯 Target Reached!" : "Trading Active"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        {/* Main P&L Display with Animated Ticker */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current P&L</p>
            <div className="flex items-center gap-2">
              <PnLTicker value={currentPnL} size="lg" showChange />
              <span className="text-xl text-muted-foreground">USDT</span>
            </div>
          </div>

          {/* Sparkline */}
          {recentPnLHistory.length > 1 && (
            <div className="h-16 w-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recentPnLHistory}>
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={isProfitable ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Progress to Target */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="h-4 w-4" />
              Daily Target Progress
            </span>
            <span className="font-medium">
              ${currentPnL.toFixed(2)} / ${dailyTarget.toFixed(2)}
            </span>
          </div>
          <Progress 
            value={progressPercent} 
            className="h-3"
          />
          <p className="text-xs text-muted-foreground text-right">
            {progressPercent.toFixed(1)}% complete
            {!targetReached && ` • $${(dailyTarget - currentPnL).toFixed(2)} remaining`}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Zap className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xl font-bold">{tradesCount}</p>
            <p className="text-xs text-muted-foreground">Trades</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <Trophy className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
            <p className="text-xl font-bold">{winRate.toFixed(0)}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <ArrowUpRight className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <p className="text-xl font-bold text-green-500">+${bestTrade.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Best Trade</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-center">
            <ArrowDownRight className="h-4 w-4 mx-auto mb-1 text-red-500" />
            <p className="text-xl font-bold text-red-500">${worstTrade.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Worst Trade</p>
          </div>
        </div>

        {/* Win/Loss Breakdown */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span>{winsCount} Wins</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span>{lossesCount} Losses</span>
          </div>
          <div className="flex items-center gap-2 ml-auto text-muted-foreground">
            <span>Avg: ${avgTradeProfit.toFixed(3)}/trade</span>
          </div>
        </div>

        {/* Recent Trades Feed */}
        {recentTrades.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Trades
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentTrades.slice(0, 5).map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1",
                        trade.direction === 'long' ? "text-green-500 border-green-500/50" : "text-red-500 border-red-500/50"
                      )}
                    >
                      {trade.direction.toUpperCase()}
                    </Badge>
                    <span className="font-medium">{trade.pair}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-mono",
                      trade.profit >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(4)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(trade.time, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session Info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
          <span>Session: {formatDistanceToNow(sessionStart, { addSuffix: false })}</span>
          <span>Last update: {formatDistanceToNow(lastUpdate, { addSuffix: true })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
