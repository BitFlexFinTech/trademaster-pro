import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface PositionSizeDataPoint {
  date: string;
  size: number;
  avgSize: number;
}

export function PositionSizingHistoryChart() {
  const { user } = useAuth();

  // Fetch recent trades to build position sizing history
  const { data: trades } = useQuery({
    queryKey: ['position-sizing-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('trades')
        .select('amount, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(100);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });

  // Process trades into chart data
  const chartData = useMemo(() => {
    if (!trades?.length) {
      // Generate mock data for demo
      const now = Date.now();
      return Array.from({ length: 20 }, (_, i) => {
        const baseSize = 333;
        const variation = Math.sin(i * 0.5) * 50 + Math.random() * 30;
        return {
          date: format(new Date(now - (19 - i) * 3600000), 'HH:mm'),
          size: Math.round(baseSize + variation),
          avgSize: 333,
        };
      });
    }

    // Group trades by hour and calculate average size
    const grouped = trades.reduce((acc, trade) => {
      const hour = format(new Date(trade.created_at), 'MMM d HH:00');
      if (!acc[hour]) {
        acc[hour] = { sizes: [], total: 0 };
      }
      acc[hour].sizes.push(trade.amount);
      acc[hour].total += trade.amount;
      return acc;
    }, {} as Record<string, { sizes: number[]; total: number }>);

    const avgSize = trades.reduce((sum, t) => sum + t.amount, 0) / trades.length;

    return Object.entries(grouped).map(([date, data]) => ({
      date,
      size: Math.round(data.total / data.sizes.length),
      avgSize: Math.round(avgSize),
    }));
  }, [trades]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 0, avg: 0, current: 0, trend: 'stable' as const };
    
    const sizes = chartData.map(d => d.size);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
    const current = sizes[sizes.length - 1];
    
    // Determine trend from last 5 data points
    const recent = sizes.slice(-5);
    const trend = recent.length >= 2 
      ? recent[recent.length - 1] > recent[0] + 10 
        ? 'up' as const 
        : recent[recent.length - 1] < recent[0] - 10 
          ? 'down' as const 
          : 'stable' as const
      : 'stable' as const;
    
    return { min, max, avg, current, trend };
  }, [chartData]);

  const TrendIcon = stats.trend === 'up' ? TrendingUp : stats.trend === 'down' ? TrendingDown : Minus;
  const trendColor = stats.trend === 'up' ? 'text-emerald-500' : stats.trend === 'down' ? 'text-red-500' : 'text-muted-foreground';

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            📊 Position Sizing History
          </span>
          <div className="flex items-center gap-1 text-xs font-normal">
            <TrendIcon className={`w-3 h-3 ${trendColor}`} />
            <span className={trendColor}>
              {stats.trend === 'up' ? 'Increasing' : stats.trend === 'down' ? 'Decreasing' : 'Stable'}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[150px] mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="sizeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px',
                }}
                formatter={(value: number) => [`$${value}`, 'Position Size']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <ReferenceLine 
                y={stats.avg} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="3 3" 
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="size"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#sizeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-1.5 bg-muted/30 rounded">
            <p className="text-[10px] text-muted-foreground">Min</p>
            <p className="text-xs font-mono font-bold">${stats.min}</p>
          </div>
          <div className="p-1.5 bg-muted/30 rounded">
            <p className="text-[10px] text-muted-foreground">Max</p>
            <p className="text-xs font-mono font-bold">${stats.max}</p>
          </div>
          <div className="p-1.5 bg-muted/30 rounded">
            <p className="text-[10px] text-muted-foreground">Avg</p>
            <p className="text-xs font-mono font-bold">${stats.avg}</p>
          </div>
          <div className="p-1.5 bg-primary/10 rounded border border-primary/30">
            <p className="text-[10px] text-muted-foreground">Current</p>
            <p className="text-xs font-mono font-bold text-primary">${stats.current}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
