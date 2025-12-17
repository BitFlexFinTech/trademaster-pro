import { useMemo } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Target, Clock, Shield, Zap, ArrowUp, ArrowDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

interface RealTimeProfitDashboardProps {
  className?: string;
}

export function RealTimeProfitDashboard({ className }: RealTimeProfitDashboardProps) {
  const { analytics, loading } = useBotAnalytics('7d', 'all', 'all');
  const { mode } = useTradingMode();

  const winRateColor = useMemo(() => {
    if (analytics.winRate >= 70) return 'text-green-400';
    if (analytics.winRate >= 50) return 'text-yellow-400';
    return 'text-red-400';
  }, [analytics.winRate]);

  const pnlColor = analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400';

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
      <CardHeader className="py-3 px-4 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Real-Time Performance
          </CardTitle>
          <Badge variant={mode === 'demo' ? 'secondary' : 'default'} className="text-[10px]">
            {mode.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <ScrollArea className="h-[280px]">
          <div className="space-y-4">
            {/* Top Stats Row */}
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className={cn("text-lg font-bold", pnlColor)}>
                  {analytics.totalProfit >= 0 ? '+' : ''}${analytics.totalProfit.toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground">Total P&L</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className={cn("text-lg font-bold", winRateColor)}>
                  {analytics.winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">Win Rate</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-green-400">
                  {analytics.longVsShort?.longWinRate?.toFixed(1) || 0}%
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <ArrowUp className="w-3 h-3" /> LONG
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-red-400">
                  {analytics.longVsShort?.shortWinRate?.toFixed(1) || 0}%
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <ArrowDown className="w-3 h-3" /> SHORT
                </div>
              </div>
            </div>

            {/* Win Rate Trend Chart */}
            {analytics.winRateTrend && analytics.winRateTrend.length > 0 && (
              <div className="bg-muted/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Win Rate Trend (Last 50 Trades)
                </div>
                <div className="h-[60px]">
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
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Distribution</div>
                <div className="h-[60px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={15}
                        outerRadius={25}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-3 text-[9px]">
                  <span className="text-green-400">W: {analytics.winCount}</span>
                  <span className="text-red-400">L: {analytics.lossCount}</span>
                </div>
              </div>

              {/* Best/Worst Pairs */}
              <div className="bg-muted/20 rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Top Pairs</div>
                <div className="space-y-1">
                  {analytics.bestPerformingPairs.slice(0, 3).map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px]">
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
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2">
                <div className="text-[10px] text-destructive flex items-center gap-1 mb-1">
                  <Shield className="w-3 h-3" /> Pairs on Cooldown (3+ Consecutive Losses)
                </div>
                <div className="space-y-1">
                  {analytics.cooldownPairs.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px]">
                      <span className="text-muted-foreground">
                        {p.pair} {p.direction.toUpperCase()}
                      </span>
                      <Badge variant="destructive" className="text-[8px] h-4">
                        {p.consecutiveLosses} losses
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streak Info */}
            <div className="flex items-center justify-between text-[10px] bg-muted/20 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Current Streak:</span>
                <Badge 
                  variant={analytics.streaks.currentStreakType === 'win' ? 'default' : 'destructive'}
                  className="text-[9px] h-4"
                >
                  {analytics.streaks.currentStreak} {analytics.streaks.currentStreakType === 'win' ? 'wins' : 'losses'}
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
