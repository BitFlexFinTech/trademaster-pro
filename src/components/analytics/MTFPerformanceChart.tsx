import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';
import { Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MTFPerformanceChartProps {
  days?: number;
  className?: string;
}

export function MTFPerformanceChart({ days = 30, className }: MTFPerformanceChartProps) {
  const { analytics, isLoading } = useTradeAnalytics(days);
  
  const chartData = useMemo(() => {
    return [
      {
        name: 'MTF Aligned',
        winRate: analytics.mtfAlignedWinRate,
        color: 'hsl(var(--primary))',
        description: 'All timeframes agree on direction',
      },
      {
        name: 'MTF Mixed',
        winRate: analytics.mtfMixedWinRate,
        color: 'hsl(var(--warning))',
        description: 'Conflicting signals across timeframes',
      },
      {
        name: 'Overall',
        winRate: analytics.overallWinRate,
        color: 'hsl(var(--muted-foreground))',
        description: 'All trades combined',
      },
    ];
  }, [analytics]);

  const improvement = analytics.mtfAlignedWinRate - analytics.mtfMixedWinRate;

  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            MTF Performance Loading...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          MTF Alignment Performance
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Win rate comparison: aligned vs mixed timeframe signals
        </p>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-muted-foreground">Aligned</span>
            </div>
            <span className="text-lg font-bold text-primary">
              {analytics.mtfAlignedWinRate.toFixed(1)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3 text-warning" />
              <span className="text-[10px] text-muted-foreground">Mixed</span>
            </div>
            <span className="text-lg font-bold text-warning">
              {analytics.mtfMixedWinRate.toFixed(1)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-secondary border border-border">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Improvement</span>
            </div>
            <span className={cn(
              "text-lg font-bold",
              improvement > 0 ? "text-primary" : improvement < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {improvement > 0 ? '+' : ''}{improvement.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                type="number" 
                domain={[0, 100]} 
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={80}
                tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg p-2">
                      <p className="text-xs font-medium">{data.name}</p>
                      <p className="text-sm font-bold" style={{ color: data.color }}>
                        {data.winRate.toFixed(1)}% Win Rate
                      </p>
                      <p className="text-[10px] text-muted-foreground">{data.description}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Insight */}
        {improvement > 5 && (
          <div className="mt-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-[10px] text-primary">
              💡 MTF-aligned trades outperform by {improvement.toFixed(1)}%. Consider prioritizing trades when all timeframes agree.
            </p>
          </div>
        )}
        {improvement < 0 && (
          <div className="mt-3 p-2 rounded-lg bg-warning/5 border border-warning/20">
            <p className="text-[10px] text-warning">
              ⚠️ Mixed signals showing better performance. Review MTF strategy parameters.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
