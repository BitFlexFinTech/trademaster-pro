import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Activity, Calendar } from 'lucide-react';
import { useRegimeHistory, RegimeHistoryEntry } from '@/hooks/useRegimeHistory';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';

interface RegimePerformanceChartProps {
  symbol?: string;
}

export function RegimePerformanceChart({ symbol = 'BTCUSDT' }: RegimePerformanceChartProps) {
  const [timeframe, setTimeframe] = useState<7 | 14 | 30>(30);
  const { history, stats, isLoading, error } = useRegimeHistory(symbol, timeframe);

  // Build chart data with cumulative P&L and regime bands
  const chartData = useMemo(() => {
    if (history.length === 0) return [];

    // Sort by start time ascending
    const sorted = [...history].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );

    let cumulativePnL = 0;
    let bullPnL = 0;
    let bearPnL = 0;
    let chopPnL = 0;

    return sorted.map((entry, index) => {
      const pnl = entry.pnl_during_regime || 0;
      cumulativePnL += pnl;

      if (entry.regime === 'BULL') bullPnL += pnl;
      else if (entry.regime === 'BEAR') bearPnL += pnl;
      else chopPnL += pnl;

      return {
        index,
        date: format(new Date(entry.started_at), 'MMM d'),
        time: format(new Date(entry.started_at), 'HH:mm'),
        regime: entry.regime,
        pnl,
        cumulativePnL,
        bullPnL,
        bearPnL,
        chopPnL,
        trades: entry.trades_during_regime,
        duration: entry.duration_minutes,
      };
    });
  }, [history]);

  // Build regime bands for background overlay
  const regimeBands = useMemo(() => {
    if (chartData.length === 0) return [];

    const bands: Array<{
      start: number;
      end: number;
      regime: 'BULL' | 'BEAR' | 'CHOP';
    }> = [];

    let currentRegime = chartData[0]?.regime;
    let bandStart = 0;

    chartData.forEach((point, index) => {
      if (point.regime !== currentRegime || index === chartData.length - 1) {
        bands.push({
          start: bandStart,
          end: index === chartData.length - 1 ? index : index - 1,
          regime: currentRegime as 'BULL' | 'BEAR' | 'CHOP',
        });
        currentRegime = point.regime;
        bandStart = index;
      }
    });

    return bands;
  }, [chartData]);

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'rgba(34, 197, 94, 0.15)';
      case 'BEAR': return 'rgba(239, 68, 68, 0.15)';
      case 'CHOP': return 'rgba(245, 158, 11, 0.15)';
      default: return 'transparent';
    }
  };

  const getRegimeStroke = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'hsl(142, 76%, 36%)';
      case 'BEAR': return 'hsl(0, 84%, 60%)';
      case 'CHOP': return 'hsl(38, 92%, 50%)';
      default: return 'hsl(var(--muted-foreground))';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardContent className="py-8 text-center text-muted-foreground">
          Failed to load regime data
        </CardContent>
      </Card>
    );
  }

  const totalPnL = stats.bullPnL + stats.bearPnL + stats.chopPnL;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Regime P&L Trends
          </CardTitle>
          <div className="flex items-center gap-1">
            {([7, 14, 30] as const).map((days) => (
              <Button
                key={days}
                variant={timeframe === days ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTimeframe(days)}
              >
                {days}D
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500/30" />
            <span className="text-xs text-muted-foreground">BULL</span>
            <Badge variant={stats.bullPnL >= 0 ? 'default' : 'destructive'} className="text-xs ml-1">
              ${stats.bullPnL.toFixed(2)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500/30" />
            <span className="text-xs text-muted-foreground">BEAR</span>
            <Badge variant={stats.bearPnL >= 0 ? 'default' : 'destructive'} className="text-xs ml-1">
              ${stats.bearPnL.toFixed(2)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-amber-500/30" />
            <span className="text-xs text-muted-foreground">CHOP</span>
            <Badge variant={stats.chopPnL >= 0 ? 'default' : 'destructive'} className="text-xs ml-1">
              ${stats.chopPnL.toFixed(2)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No regime data for the last {timeframe} days</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="bullGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="bearGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="chopGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />

              {/* Regime background bands */}
              {regimeBands.map((band, i) => (
                <ReferenceArea
                  key={i}
                  x1={band.start}
                  x2={band.end}
                  fill={getRegimeColor(band.regime)}
                  fillOpacity={1}
                />
              ))}

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(val) => `$${val}`}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    cumulativePnL: 'Cumulative P&L',
                    pnl: 'Regime P&L',
                    trades: 'Trades',
                  };
                  if (name === 'trades') return [value, labels[name]];
                  return [`$${value.toFixed(2)}`, labels[name] || name];
                }}
                labelFormatter={(label, payload) => {
                  if (payload && payload[0]) {
                    const data = payload[0].payload;
                    const icon = data.regime === 'BULL' ? '🐂' : data.regime === 'BEAR' ? '🐻' : '🌊';
                    return `${label} ${data.time} ${icon} ${data.regime}`;
                  }
                  return label;
                }}
              />

              <Legend
                verticalAlign="top"
                height={30}
                formatter={(value) => (
                  <span className="text-xs text-muted-foreground">{value}</span>
                )}
              />

              {/* Cumulative P&L line */}
              <Line
                type="monotone"
                dataKey="cumulativePnL"
                name="Cumulative P&L"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />

              {/* Per-regime P&L as small dots */}
              <Line
                type="monotone"
                dataKey="pnl"
                name="Regime P&L"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={{
                  r: 3,
                  fill: 'hsl(var(--background))',
                  stroke: 'hsl(var(--muted-foreground))',
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* Summary footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {stats.transitionsCount} transitions
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span className={totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </span>
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
