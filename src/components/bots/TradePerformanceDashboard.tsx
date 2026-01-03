import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target,
  Flame,
  AlertTriangle,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradeAnalytics, PairStats } from '@/hooks/useTradeAnalytics';

interface StreakInfo {
  current: number;
  currentType: 'win' | 'loss' | 'none';
  bestWin: number;
  worstLoss: number;
}

interface HoldTimeDistribution {
  under1min: number;
  oneToFive: number;
  fiveToFifteen: number;
  overFifteen: number;
}

export function TradePerformanceDashboard({ days = 30 }: { days?: number }) {
  const { analytics, isLoading } = useTradeAnalytics(days);

  // Calculate streaks from pair stats win/loss patterns
  const streakInfo = useMemo<StreakInfo>(() => {
    if (!analytics.pairStats.length) {
      return { current: 0, currentType: 'none', bestWin: 0, worstLoss: 0 };
    }

    // Use daily profits to calculate streaks
    let currentStreak = 0;
    let currentType: 'win' | 'loss' | 'none' = 'none';
    let bestWinStreak = 0;
    let worstLossStreak = 0;
    let tempStreak = 0;
    let tempType: 'win' | 'loss' | null = null;

    analytics.dailyProfits.forEach((day, idx) => {
      const isWin = day.profit > 0;
      
      if (idx === 0) {
        tempType = isWin ? 'win' : 'loss';
        tempStreak = 1;
      } else if ((isWin && tempType === 'win') || (!isWin && tempType === 'loss')) {
        tempStreak++;
      } else {
        // Streak broken
        if (tempType === 'win' && tempStreak > bestWinStreak) {
          bestWinStreak = tempStreak;
        } else if (tempType === 'loss' && tempStreak > worstLossStreak) {
          worstLossStreak = tempStreak;
        }
        tempType = isWin ? 'win' : 'loss';
        tempStreak = 1;
      }
    });

    // Check final streak
    if (tempType === 'win' && tempStreak > bestWinStreak) {
      bestWinStreak = tempStreak;
    } else if (tempType === 'loss' && tempStreak > worstLossStreak) {
      worstLossStreak = tempStreak;
    }

    return {
      current: tempStreak,
      currentType: tempType || 'none',
      bestWin: bestWinStreak,
      worstLoss: worstLossStreak,
    };
  }, [analytics]);

  // Calculate hold time distribution
  const holdTimeDistribution = useMemo<HoldTimeDistribution>(() => {
    const pairs = analytics.pairStats;
    const avgTimes = pairs.map(p => p.avgHoldTime);
    
    return {
      under1min: avgTimes.filter(t => t < 1).length,
      oneToFive: avgTimes.filter(t => t >= 1 && t < 5).length,
      fiveToFifteen: avgTimes.filter(t => t >= 5 && t < 15).length,
      overFifteen: avgTimes.filter(t => t >= 15).length,
    };
  }, [analytics]);

  // Top and bottom performers
  const topPerformers = useMemo(() => {
    return analytics.pairStats
      .filter(p => p.totalTrades >= 3)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 5);
  }, [analytics]);

  const bottomPerformers = useMemo(() => {
    return analytics.pairStats
      .filter(p => p.totalTrades >= 3)
      .sort((a, b) => a.totalProfit - b.totalProfit)
      .slice(0, 3);
  }, [analytics]);

  if (isLoading) {
    return (
      <Card className="card-glass animate-pulse">
        <CardContent className="p-4 h-[400px]" />
      </Card>
    );
  }

  return (
    <Card className="card-glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Trade Performance</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Last {days} days
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 space-y-4">
        {/* Streak Section */}
        <div className="grid grid-cols-3 gap-2">
          {/* Current Streak */}
          <div className={cn(
            "p-2.5 rounded-lg border text-center",
            streakInfo.currentType === 'win' ? "bg-primary/10 border-primary/30" : "bg-secondary/50 border-border"
          )}>
            <div className="flex items-center justify-center gap-1 mb-1">
              {streakInfo.currentType === 'win' ? (
                <Flame className="w-4 h-4 text-primary" />
              ) : streakInfo.currentType === 'loss' ? (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              ) : (
                <Target className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">Current</span>
            </div>
            <div className={cn(
              "text-xl font-bold",
              streakInfo.currentType === 'win' ? "text-primary" : 
              streakInfo.currentType === 'loss' ? "text-destructive" : "text-muted-foreground"
            )}>
              {streakInfo.current}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {streakInfo.currentType === 'win' ? 'wins' : streakInfo.currentType === 'loss' ? 'losses' : '-'}
            </div>
          </div>
          
          {/* Best Win Streak */}
          <div className="p-2.5 rounded-lg border bg-primary/5 border-primary/20 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Best</span>
            </div>
            <div className="text-xl font-bold text-primary">{streakInfo.bestWin}</div>
            <div className="text-[10px] text-muted-foreground">win streak</div>
          </div>
          
          {/* Worst Loss Streak */}
          <div className="p-2.5 rounded-lg border bg-destructive/5 border-destructive/20 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Worst</span>
            </div>
            <div className="text-xl font-bold text-destructive">{streakInfo.worstLoss}</div>
            <div className="text-[10px] text-muted-foreground">loss streak</div>
          </div>
        </div>

        {/* Hold Time Section */}
        <div className="p-2.5 rounded-lg border bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Average Hold Time</span>
            <Badge variant="outline" className="ml-auto text-[10px] font-mono">
              {analytics.avgHoldTime.toFixed(1)} min
            </Badge>
          </div>
          
          <div className="grid grid-cols-4 gap-1 text-center">
            {[
              { label: '<1m', value: holdTimeDistribution.under1min, color: 'bg-primary' },
              { label: '1-5m', value: holdTimeDistribution.oneToFive, color: 'bg-primary/70' },
              { label: '5-15m', value: holdTimeDistribution.fiveToFifteen, color: 'bg-primary/50' },
              { label: '>15m', value: holdTimeDistribution.overFifteen, color: 'bg-primary/30' },
            ].map(bucket => {
              const total = Object.values(holdTimeDistribution).reduce((a, b) => a + b, 0) || 1;
              const pct = (bucket.value / total) * 100;
              return (
                <div key={bucket.label} className="space-y-1">
                  <div className="text-[10px] text-muted-foreground">{bucket.label}</div>
                  <Progress value={pct} className="h-2" />
                  <div className="text-[10px] font-medium">{bucket.value}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Performers */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Top Performers</span>
          </div>
          
          <div className="space-y-1.5">
            {topPerformers.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-2">
                No qualifying pairs (min 3 trades)
              </div>
            ) : (
              topPerformers.map((pair, idx) => (
                <div 
                  key={pair.pair}
                  className="flex items-center justify-between p-2 rounded bg-secondary/30 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center font-semibold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-medium">{pair.pair}</span>
                    {idx === 0 && <Badge className="text-[8px] px-1 py-0 h-4">Best</Badge>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {pair.winRate.toFixed(0)}% WR
                    </span>
                    <span className="text-muted-foreground">
                      {pair.totalTrades} trades
                    </span>
                    <span className={cn(
                      "font-mono font-semibold",
                      pair.totalProfit >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {pair.totalProfit >= 0 ? '+' : ''}${pair.totalProfit.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom Performers (Avoid List) */}
        {bottomPerformers.length > 0 && bottomPerformers[0].totalProfit < 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-destructive">Avoid These Pairs</span>
            </div>
            
            <div className="space-y-1">
              {bottomPerformers.filter(p => p.totalProfit < 0).map(pair => (
                <div 
                  key={pair.pair}
                  className="flex items-center justify-between p-2 rounded bg-destructive/10 border border-destructive/20 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{pair.pair}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-destructive/70">
                      {pair.winRate.toFixed(0)}% WR
                    </span>
                    <span className="font-mono font-semibold text-destructive">
                      ${pair.totalProfit.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
