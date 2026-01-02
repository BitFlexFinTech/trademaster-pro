import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface WinRateDataPoint {
  date: string;
  winRate: number;
  trades: number;
  wins: number;
  losses: number;
}

interface WinRateOverTimeChartProps {
  data: WinRateDataPoint[];
  targetWinRate?: number;
}

export function WinRateOverTimeChart({ data, targetWinRate = 65 }: WinRateOverTimeChartProps) {
  const stats = useMemo(() => {
    if (data.length === 0) return { current: 0, average: 0, trend: 'neutral' as const };
    
    const current = data[data.length - 1]?.winRate || 0;
    const average = data.reduce((sum, d) => sum + d.winRate, 0) / data.length;
    
    // Calculate trend (compare last 3 days to previous 3 days)
    const recent = data.slice(-3);
    const previous = data.slice(-6, -3);
    
    const recentAvg = recent.reduce((sum, d) => sum + d.winRate, 0) / (recent.length || 1);
    const previousAvg = previous.reduce((sum, d) => sum + d.winRate, 0) / (previous.length || 1);
    
    const trend = recentAvg > previousAvg + 2 ? 'up' : recentAvg < previousAvg - 2 ? 'down' : 'neutral';
    
    return { current, average, trend };
  }, [data]);

  const TrendIcon = stats.trend === 'up' ? TrendingUp : stats.trend === 'down' ? TrendingDown : Minus;
  const trendColor = stats.trend === 'up' ? 'text-green-500' : stats.trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Win Rate Over Time</CardTitle>
            <CardDescription>Rolling 7-day win rate trend</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-2xl font-bold">{stats.current.toFixed(1)}%</div>
              <div className={`text-xs flex items-center gap-1 ${trendColor}`}>
                <TrendIcon className="h-3 w-3" />
                {stats.trend === 'up' ? 'Improving' : stats.trend === 'down' ? 'Declining' : 'Stable'}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <ReferenceLine 
                y={targetWinRate} 
                stroke="hsl(var(--primary))" 
                strokeDasharray="5 5" 
                label={{ value: 'Target', position: 'right', fontSize: 10, fill: 'hsl(var(--primary))' }}
              />
              <ReferenceLine 
                y={stats.average} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="3 3" 
                opacity={0.5}
              />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
          <span>Average: {stats.average.toFixed(1)}%</span>
          <span>Target: {targetWinRate}%</span>
          <span>Total Trades: {data.reduce((sum, d) => sum + d.trades, 0)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
