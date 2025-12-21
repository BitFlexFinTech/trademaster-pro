import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Brain, Target, Clock, Zap } from 'lucide-react';
import { useRegimeHistory } from '@/hooks/useRegimeHistory';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { cn } from '@/lib/utils';

interface JarvisPerformanceAnalyticsProps {
  symbol?: string;
  timeframeDays?: number;
}

interface RegimePerformance {
  regime: 'BULL' | 'BEAR' | 'CHOP';
  winRate: number;
  totalTrades: number;
  avgDuration: number;
  totalPnL: number;
  avgPnL: number;
  efficiencyScore: number;
}

export function JarvisPerformanceAnalytics({ 
  symbol = 'BTCUSDT',
  timeframeDays = 30 
}: JarvisPerformanceAnalyticsProps) {
  const { stats, isLoading: regimeLoading } = useRegimeHistory(symbol, timeframeDays);
  const { analytics, loading: analyticsLoading } = useBotAnalytics('30d', 'all', 'all');

  const isLoading = regimeLoading || analyticsLoading;

  // Calculate regime performance metrics
  const regimePerformance = useMemo<RegimePerformance[]>(() => {
    const regimes: RegimePerformance[] = [
      {
        regime: 'BULL',
        winRate: 0,
        totalTrades: stats.bullTrades,
        avgDuration: stats.avgBullDuration,
        totalPnL: stats.bullPnL,
        avgPnL: stats.bullTrades > 0 ? stats.bullPnL / stats.bullTrades : 0,
        efficiencyScore: 0,
      },
      {
        regime: 'BEAR',
        winRate: 0,
        totalTrades: stats.bearTrades,
        avgDuration: stats.avgBearDuration,
        totalPnL: stats.bearPnL,
        avgPnL: stats.bearTrades > 0 ? stats.bearPnL / stats.bearTrades : 0,
        efficiencyScore: 0,
      },
      {
        regime: 'CHOP',
        winRate: 0,
        totalTrades: stats.chopTrades,
        avgDuration: stats.avgChopDuration,
        totalPnL: stats.chopPnL,
        avgPnL: stats.chopTrades > 0 ? stats.chopPnL / stats.chopTrades : 0,
        efficiencyScore: 0,
      },
    ];

    // Calculate efficiency scores
    regimes.forEach(r => {
      // Efficiency = PnL per minute of regime
      const totalMinutes = r.regime === 'BULL' ? stats.totalBullMinutes :
                          r.regime === 'BEAR' ? stats.totalBearMinutes : stats.totalChopMinutes;
      r.efficiencyScore = totalMinutes > 0 ? (r.totalPnL / totalMinutes) * 60 : 0; // PnL per hour
    });

    return regimes;
  }, [stats]);

  // Best and worst performing regime
  const bestRegime = useMemo(() => {
    return regimePerformance.reduce((best, current) => 
      current.totalPnL > best.totalPnL ? current : best
    , regimePerformance[0]);
  }, [regimePerformance]);

  const worstRegime = useMemo(() => {
    return regimePerformance.reduce((worst, current) => 
      current.totalPnL < worst.totalPnL ? current : worst
    , regimePerformance[0]);
  }, [regimePerformance]);

  // Chart data for regime comparison
  const regimeChartData = regimePerformance.map(r => ({
    name: r.regime,
    pnl: r.totalPnL,
    trades: r.totalTrades,
    efficiency: r.efficiencyScore,
  }));

  // Duration distribution for pie chart
  const durationData = [
    { name: 'BULL', value: stats.totalBullMinutes, color: '#22c55e' },
    { name: 'BEAR', value: stats.totalBearMinutes, color: '#ef4444' },
    { name: 'CHOP', value: stats.totalChopMinutes, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case 'BEAR': return <TrendingDown className="h-4 w-4 text-red-400" />;
      default: return <Minus className="h-4 w-4 text-amber-400" />;
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return '#22c55e';
      case 'BEAR': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-400" />
            JARVIS Performance Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-400" />
            JARVIS Performance Analytics
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Last {timeframeDays} days
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          {regimePerformance.map(r => (
            <div 
              key={r.regime}
              className={cn(
                "p-3 rounded-lg border",
                r.regime === 'BULL' && "bg-emerald-500/10 border-emerald-500/30",
                r.regime === 'BEAR' && "bg-red-500/10 border-red-500/30",
                r.regime === 'CHOP' && "bg-amber-500/10 border-amber-500/30"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {getRegimeIcon(r.regime)}
                <span className="font-semibold text-sm">{r.regime}</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">P&L</span>
                  <span className={cn(
                    "font-medium",
                    r.totalPnL >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {r.totalPnL >= 0 ? '+' : ''}${r.totalPnL.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Trades</span>
                  <span>{r.totalTrades}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Avg Duration</span>
                  <span>{Math.round(r.avgDuration)} min</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* P&L by Regime Chart */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Target className="h-3 w-3" />
            P&L by Regime
          </h4>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regimeChartData} layout="vertical">
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={50}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                />
                <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                  {regimeChartData.map((entry, index) => (
                    <Cell key={index} fill={getRegimeColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Efficiency Scores */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Regime Efficiency ($/hour)
          </h4>
          <div className="space-y-2">
            {regimePerformance.map(r => {
              const maxEfficiency = Math.max(...regimePerformance.map(x => Math.abs(x.efficiencyScore)));
              const progress = maxEfficiency > 0 ? (Math.abs(r.efficiencyScore) / maxEfficiency) * 100 : 0;
              
              return (
                <div key={r.regime} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="flex items-center gap-1">
                      {getRegimeIcon(r.regime)}
                      {r.regime}
                    </span>
                    <span className={cn(
                      "font-medium",
                      r.efficiencyScore >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {r.efficiencyScore >= 0 ? '+' : ''}${r.efficiencyScore.toFixed(2)}/hr
                    </span>
                  </div>
                  <Progress 
                    value={progress} 
                    className="h-1.5"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Time Distribution */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Time in Regime
            </h4>
            <div className="h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={durationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={40}
                    dataKey="value"
                    labelLine={false}
                  >
                    {durationData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${Math.round(value / 60)} hrs`, 'Duration']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              Best/Worst Regime
            </h4>
            <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-1 text-xs text-emerald-400 mb-1">
                {getRegimeIcon(bestRegime.regime)}
                Best: {bestRegime.regime}
              </div>
              <div className="text-sm font-bold text-emerald-400">
                +${bestRegime.totalPnL.toFixed(2)}
              </div>
            </div>
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-1 text-xs text-red-400 mb-1">
                {getRegimeIcon(worstRegime.regime)}
                Worst: {worstRegime.regime}
              </div>
              <div className="text-sm font-bold text-red-400">
                ${worstRegime.totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Overall Stats */}
        <div className="pt-3 border-t border-border/50">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-primary">
                {analytics.totalTrades}
              </div>
              <div className="text-xs text-muted-foreground">Total Trades</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">
                {analytics.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div>
              <div className={cn(
                "text-lg font-bold",
                analytics.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                ${analytics.totalProfit.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">Total P&L</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary">
                {stats.transitionsCount}
              </div>
              <div className="text-xs text-muted-foreground">Transitions</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
