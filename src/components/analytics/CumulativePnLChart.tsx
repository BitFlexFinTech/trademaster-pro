import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';

interface PnLDataPoint {
  date: string;
  pnl: number;
  cumulative: number;
  trades: number;
}

interface CumulativePnLChartProps {
  data: PnLDataPoint[];
  milestones?: number[];
}

export function CumulativePnLChart({ 
  data, 
  milestones = [50, 100, 250, 500, 1000] 
}: CumulativePnLChartProps) {
  const stats = useMemo(() => {
    if (data.length === 0) return { 
      total: 0, 
      best: 0, 
      worst: 0, 
      avgDaily: 0,
      reachedMilestones: [] as number[],
      nextMilestone: milestones[0] || 100,
      progressToNext: 0,
    };
    
    const total = data[data.length - 1]?.cumulative || 0;
    const dailyPnLs = data.map(d => d.pnl);
    const best = Math.max(...dailyPnLs);
    const worst = Math.min(...dailyPnLs);
    const avgDaily = dailyPnLs.reduce((sum, p) => sum + p, 0) / dailyPnLs.length;
    
    const reachedMilestones = milestones.filter(m => total >= m);
    const nextMilestone = milestones.find(m => total < m) || milestones[milestones.length - 1] * 2;
    const previousMilestone = reachedMilestones[reachedMilestones.length - 1] || 0;
    const progressToNext = ((total - previousMilestone) / (nextMilestone - previousMilestone)) * 100;
    
    return { total, best, worst, avgDaily, reachedMilestones, nextMilestone, progressToNext };
  }, [data, milestones]);

  const isPositive = stats.total >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Cumulative P&L</CardTitle>
            <CardDescription>Total profit accumulation over time</CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold font-mono flex items-center gap-1 ${isPositive ? 'text-green-500' : 'text-destructive'}`}>
              {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              ${Math.abs(stats.total).toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">
              Avg: ${stats.avgDaily.toFixed(2)}/day
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(2)}`, 
                  name === 'cumulative' ? 'Total P&L' : 'Daily P&L'
                ]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              {/* Show milestone lines */}
              {stats.reachedMilestones.map(milestone => (
                <ReferenceLine 
                  key={milestone}
                  y={milestone} 
                  stroke="hsl(var(--primary))" 
                  strokeDasharray="5 5" 
                  opacity={0.5}
                />
              ))}
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#pnlGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Milestones Progress */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Next Milestone: ${stats.nextMilestone}
            </span>
            <span className="font-medium">{stats.progressToNext.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats.progressToNext)}%` }}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {milestones.slice(0, 5).map(milestone => (
              <Badge 
                key={milestone}
                variant={stats.total >= milestone ? 'default' : 'outline'}
                className="text-xs"
              >
                <DollarSign className="h-3 w-3 mr-0.5" />
                {milestone}
              </Badge>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
          <span className="text-green-500">Best: +${stats.best.toFixed(2)}</span>
          <span className="text-destructive">Worst: ${stats.worst.toFixed(2)}</span>
          <span>Trades: {data.reduce((sum, d) => sum + d.trades, 0)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
