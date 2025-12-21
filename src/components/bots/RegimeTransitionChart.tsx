import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Scatter,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { useRegimeHistory, RegimeHistoryEntry } from '@/hooks/useRegimeHistory';
import { useTradesHistory } from '@/hooks/useTradesHistory';
import { format } from 'date-fns';

interface RegimeTransitionChartProps {
  symbol?: string;
  timeframeDays?: number;
}

interface ChartDataPoint {
  time: number;
  timeLabel: string;
  price: number;
  ema200: number;
  regime: 'BULL' | 'BEAR' | 'CHOP';
}

interface TradeMarker {
  time: number;
  price: number;
  direction: 'long' | 'short';
  profit: number;
}

export function RegimeTransitionChart({ 
  symbol = 'BTCUSDT', 
  timeframeDays = 7 
}: RegimeTransitionChartProps) {
  const { history, stats, isLoading } = useRegimeHistory(symbol, timeframeDays);
  const { sessions } = useTradesHistory();

  // Process regime history into chart data
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (history.length === 0) return [];

    return history
      .filter(h => h.price && h.ema200)
      .map(h => ({
        time: new Date(h.started_at).getTime(),
        timeLabel: format(new Date(h.started_at), 'MMM dd HH:mm'),
        price: Number(h.price),
        ema200: Number(h.ema200),
        regime: h.regime,
      }))
      .sort((a, b) => a.time - b.time);
  }, [history]);

  // Extract trade markers from sessions
  const tradeMarkers = useMemo<TradeMarker[]>(() => {
    const markers: TradeMarker[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    sessions.forEach(session => {
      session.trades
        .filter(t => new Date(t.created_at) >= startDate)
        .forEach(trade => {
          markers.push({
            time: new Date(trade.created_at).getTime(),
            price: trade.entry_price,
            direction: trade.direction as 'long' | 'short',
            profit: trade.profit_loss || 0,
          });
        });
    });

    return markers.sort((a, b) => a.time - b.time);
  }, [sessions, timeframeDays]);

  // Generate regime bands for reference areas
  const regimeBands = useMemo(() => {
    if (history.length === 0) return [];

    return history
      .filter(h => h.started_at)
      .map(h => ({
        x1: new Date(h.started_at).getTime(),
        x2: h.ended_at ? new Date(h.ended_at).getTime() : Date.now(),
        regime: h.regime,
      }));
  }, [history]);

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'rgba(34, 197, 94, 0.15)';
      case 'BEAR': return 'rgba(239, 68, 68, 0.15)';
      default: return 'rgba(245, 158, 11, 0.15)';
    }
  };

  const getRegimeIcon = (regime: string | null) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-3 w-3 text-emerald-400" />;
      case 'BEAR': return <TrendingDown className="h-3 w-3 text-red-400" />;
      default: return <Minus className="h-3 w-3 text-amber-400" />;
    }
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Regime Transition Chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Regime Transition Chart
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No regime history available. Start trading to see regime transitions.
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
            <Activity className="h-4 w-4 text-primary" />
            Regime Transition Chart
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getRegimeIcon(stats.mostRecentRegime)}
              <span className="ml-1">{stats.mostRecentRegime || 'N/A'}</span>
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {stats.transitionsCount} transitions
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {/* Regime background bands */}
              {regimeBands.map((band, index) => (
                <ReferenceArea
                  key={index}
                  x1={band.x1}
                  x2={band.x2}
                  fill={getRegimeColor(band.regime)}
                  fillOpacity={1}
                />
              ))}
              
              <XAxis 
                dataKey="time" 
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value) => format(new Date(value), 'MMM dd')}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(value) => format(new Date(value), 'MMM dd, HH:mm')}
                formatter={(value: number, name: string) => [
                  `$${value.toLocaleString()}`,
                  name === 'price' ? 'Price' : 'EMA 200'
                ]}
              />
              <Legend 
                wrapperStyle={{ fontSize: '11px' }}
                iconSize={10}
              />
              
              {/* Price line */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                name="Price"
              />
              
              {/* EMA 200 line */}
              <Line
                type="monotone"
                dataKey="ema200"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                name="EMA 200"
              />
              
              {/* Trade markers */}
              <Scatter
                data={tradeMarkers}
                fill="hsl(var(--primary))"
                shape={(props: any) => {
                  const { cx, cy, payload } = props;
                  const isLong = payload.direction === 'long';
                  const isProfit = payload.profit > 0;
                  const color = isProfit ? '#22c55e' : '#ef4444';
                  
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={4} fill={color} opacity={0.8} />
                      <text
                        x={cx}
                        y={cy - 8}
                        textAnchor="middle"
                        fontSize={10}
                        fill={color}
                      >
                        {isLong ? '▲' : '▼'}
                      </text>
                    </g>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Regime summary stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-400 text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              BULL
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(stats.avgBullDuration)} min avg
            </div>
            <div className="text-xs font-medium text-emerald-400">
              ${stats.bullPnL.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-red-400 text-xs mb-1">
              <TrendingDown className="h-3 w-3" />
              BEAR
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(stats.avgBearDuration)} min avg
            </div>
            <div className="text-xs font-medium text-red-400">
              ${stats.bearPnL.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-400 text-xs mb-1">
              <Minus className="h-3 w-3" />
              CHOP
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(stats.avgChopDuration)} min avg
            </div>
            <div className="text-xs font-medium text-amber-400">
              ${stats.chopPnL.toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
