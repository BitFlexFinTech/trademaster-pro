import { useMemo } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Target, Clock, Shield, Zap, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

interface RealTimeProfitDashboardProps {
  className?: string;
  dailyTarget?: number;
  currentPnL?: number;
  avgTradeProfit?: number;
  tradesPerHour?: number;
}

export function RealTimeProfitDashboard({ 
  className,
  dailyTarget: propDailyTarget,
  currentPnL: propCurrentPnL,
  avgTradeProfit = 0.50,
  tradesPerHour = 60
}: RealTimeProfitDashboardProps) {
  const { analytics, loading } = useBotAnalytics('7d', 'all', 'all');
  const { mode } = useTradingMode();

  // Use props or fall back to analytics data
  const dailyTarget = propDailyTarget ?? 100;
  const currentPnL = propCurrentPnL ?? analytics.totalProfit;

  const winRateColor = useMemo(() => {
    if (analytics.winRate >= 70) return 'text-green-400';
    if (analytics.winRate >= 50) return 'text-yellow-400';
    return 'text-red-400';
  }, [analytics.winRate]);

  const pnlColor = currentPnL >= 0 ? 'text-green-400' : 'text-red-400';

  // Calculate time to target
  const timeToTarget = useMemo(() => {
    const remaining = Math.max(0, dailyTarget - currentPnL);
    if (remaining === 0) return { hours: 0, minutes: 0, tradesNeeded: 0, remaining: 0, isComplete: true };
    
    const effectiveAvgProfit = avgTradeProfit > 0 ? avgTradeProfit : 0.50;
    const tradesNeeded = Math.ceil(remaining / effectiveAvgProfit);
    const hoursNeeded = tradesPerHour > 0 ? tradesNeeded / tradesPerHour : 0;
    
    return {
      hours: Math.floor(hoursNeeded),
      minutes: Math.round((hoursNeeded % 1) * 60),
      tradesNeeded,
      remaining,
      isComplete: false,
    };
  }, [dailyTarget, currentPnL, avgTradeProfit, tradesPerHour]);

  // Pie chart data for win/loss
  const pieData = [
    { name: 'Wins', value: analytics.winCount, color: 'hsl(var(--chart-2))' },
    { name: 'Losses', value: analytics.lossCount, color: 'hsl(var(--destructive))' },
  ];

  if (loading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardContent className="p-4 flex items-center justify-center h-[300px]">
          <div className="animate-pulse text-muted-foreground">Loading analytics...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader className="py-2 px-3 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold flex items-center gap-2">
            <Zap className="w-3 h-3 text-primary" />
            Real-Time Performance
          </CardTitle>
          <Badge variant={mode === 'demo' ? 'secondary' : 'default'} className="text-[9px]">
            {mode.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="h-[260px]">
          <div className="space-y-3">
            {/* Time to Target Widget - NEW */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] text-primary flex items-center gap-1">
                  <Target className="w-3 h-3" /> Daily Target Progress
                </div>
                <Badge variant={timeToTarget.isComplete ? 'default' : 'outline'} className="text-[8px]">
                  ${currentPnL.toFixed(2)} / ${dailyTarget}
                </Badge>
              </div>
              <Progress value={Math.min(100, (currentPnL / dailyTarget) * 100)} className="h-1.5 mb-2" />
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-background/50 rounded p-1">
                  <div className="text-sm font-bold text-primary">
                    {timeToTarget.tradesNeeded}
                  </div>
                  <div className="text-[8px] text-muted-foreground">Trades Left</div>
                </div>
                <div className="bg-background/50 rounded p-1">
                  <div className="text-sm font-bold text-foreground flex items-center justify-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {timeToTarget.hours}h {timeToTarget.minutes}m
                  </div>
                  <div className="text-[8px] text-muted-foreground">Est. Time</div>
                </div>
                <div className="bg-background/50 rounded p-1">
                  <div className="text-sm font-bold text-green-400">
                    ${timeToTarget.remaining.toFixed(2)}
                  </div>
                  <div className="text-[8px] text-muted-foreground">Remaining</div>
                </div>
              </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                <div className={cn("text-sm font-bold", pnlColor)}>
                  {currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}
                </div>
                <div className="text-[8px] text-muted-foreground">Total P&L</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                <div className={cn("text-sm font-bold", winRateColor)}>
                  {analytics.winRate.toFixed(1)}%
                </div>
                <div className="text-[8px] text-muted-foreground">Win Rate</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                <div className="text-sm font-bold text-green-400">
                  {analytics.longVsShort?.longWinRate?.toFixed(1) || 0}%
                </div>
                <div className="text-[8px] text-muted-foreground flex items-center justify-center gap-0.5">
                  <ArrowUp className="w-2 h-2" /> LONG
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                <div className="text-sm font-bold text-red-400">
                  {analytics.longVsShort?.shortWinRate?.toFixed(1) || 0}%
                </div>
                <div className="text-[8px] text-muted-foreground flex items-center justify-center gap-0.5">
                  <ArrowDown className="w-2 h-2" /> SHORT
                </div>
              </div>
            </div>

            {/* Win Rate Trend Chart */}
            {analytics.winRateTrend && analytics.winRateTrend.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-1.5">
                <div className="text-[9px] text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Win Rate Trend
                </div>
                <div className="h-[50px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.winRateTrend}>
                      <Line 
                        type="monotone" 
                        dataKey="winRate" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '10px'
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Win/Loss Distribution */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="bg-muted/20 rounded-lg p-1.5">
                <div className="text-[9px] text-muted-foreground mb-1">Distribution</div>
                <div className="h-[50px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={12}
                        outerRadius={20}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-2 text-[8px]">
                  <span className="text-green-400">W: {analytics.winCount}</span>
                  <span className="text-red-400">L: {analytics.lossCount}</span>
                </div>
              </div>

              {/* Best/Worst Pairs */}
              <div className="bg-muted/20 rounded-lg p-1.5">
                <div className="text-[9px] text-muted-foreground mb-1">Top Pairs</div>
                <div className="space-y-0.5">
                  {analytics.bestPerformingPairs.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[8px]">
                      <span className="text-muted-foreground">{p.pair}</span>
                      <span className={p.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cooldown Pairs */}
            {analytics.cooldownPairs && analytics.cooldownPairs.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-1.5">
                <div className="text-[9px] text-destructive flex items-center gap-1 mb-1">
                  <Shield className="w-3 h-3" /> Pairs on Cooldown
                </div>
                <div className="space-y-0.5">
                  {analytics.cooldownPairs.slice(0, 2).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[8px]">
                      <span className="text-muted-foreground">
                        {p.pair} {p.direction.toUpperCase()}
                      </span>
                      <Badge variant="destructive" className="text-[7px] h-3">
                        {p.consecutiveLosses} losses
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streak Info */}
            <div className="flex items-center justify-between text-[9px] bg-muted/20 rounded-lg p-1.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Streak:</span>
                <Badge 
                  variant={analytics.streaks.currentStreakType === 'win' ? 'default' : 'destructive'}
                  className="text-[8px] h-3"
                >
                  {analytics.streaks.currentStreak} {analytics.streaks.currentStreakType === 'win' ? 'W' : 'L'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">Best: {analytics.streaks.longestWinStreak}W</span>
                <span className="text-red-400">Worst: {analytics.streaks.longestLossStreak}L</span>
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}