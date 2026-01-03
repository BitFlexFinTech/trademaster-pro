import { useExecutionSpeedLeaderboard } from '@/hooks/useExecutionSpeedLeaderboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Medal, TrendingUp, TrendingDown, Minus, Zap, Clock, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ExecutionSpeedLeaderboard() {
  const { 
    pairRankings, 
    exchangeRankings, 
    fastestPair,
    fastestExchange,
    isLoading,
    totalTrades,
    avgOverallMs,
  } = useExecutionSpeedLeaderboard();

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-gray-400" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="w-4 h-4 text-xs text-muted-foreground flex items-center justify-center">#{rank}</span>;
  };

  const getTrendIcon = (trend: 'faster' | 'stable' | 'slower') => {
    switch (trend) {
      case 'faster':
        return <TrendingDown className="w-3 h-3 text-profit" />;
      case 'slower':
        return <TrendingUp className="w-3 h-3 text-loss" />;
      default:
        return <Minus className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getSpeedColor = (avgMs: number) => {
    if (avgMs < 500) return 'text-profit';
    if (avgMs < 1000) return 'text-warning';
    return 'text-loss';
  };

  const RankingRow = ({ item, maxAvg }: { item: any; maxAvg: number }) => {
    const widthPercent = maxAvg > 0 ? (item.avgMs / maxAvg) * 100 : 0;
    
    return (
      <div className="flex items-center gap-2 py-2 border-b border-border/30 last:border-0">
        <div className="w-6 flex-shrink-0">{getRankIcon(item.rank)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium truncate">{item.name}</span>
            <div className="flex items-center gap-2">
              {getTrendIcon(item.trend)}
              <span className={cn("text-sm font-mono", getSpeedColor(item.avgMs))}>
                {item.avgMs}ms
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all",
                  item.avgMs < 500 ? "bg-profit" : item.avgMs < 1000 ? "bg-warning" : "bg-loss"
                )}
                style={{ width: `${Math.min(100, widthPercent)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{item.tradeCount} trades</span>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="card-terminal">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Speed Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxPairAvg = Math.max(...pairRankings.map(p => p.avgMs), 1);
  const maxExchangeAvg = Math.max(...exchangeRankings.map(e => e.avgMs), 1);

  return (
    <Card className="card-terminal">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Speed Leaderboard
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {avgOverallMs}ms avg
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              {totalTrades} trades
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {fastestPair && (
            <div className="bg-profit/10 border border-profit/20 rounded-lg p-2">
              <div className="text-xs text-muted-foreground mb-1">Fastest Pair</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{fastestPair.pair}</span>
                <span className="text-xs text-profit">{fastestPair.avgMs}ms</span>
              </div>
            </div>
          )}
          {fastestExchange && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-2">
              <div className="text-xs text-muted-foreground mb-1">Fastest Exchange</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{fastestExchange.exchange}</span>
                <span className="text-xs text-primary">{fastestExchange.avgMs}ms</span>
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="pairs" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-3">
            <TabsTrigger value="pairs" className="text-xs">
              <Zap className="w-3 h-3 mr-1" />
              Trading Pairs
            </TabsTrigger>
            <TabsTrigger value="exchanges" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              Exchanges
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pairs" className="mt-0 max-h-[300px] overflow-y-auto">
            {pairRankings.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No telemetry data available yet
              </div>
            ) : (
              pairRankings.map(item => (
                <RankingRow key={item.name} item={item} maxAvg={maxPairAvg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="exchanges" className="mt-0 max-h-[300px] overflow-y-auto">
            {exchangeRankings.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No telemetry data available yet
              </div>
            ) : (
              exchangeRankings.map(item => (
                <RankingRow key={item.name} item={item} maxAvg={maxExchangeAvg} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
