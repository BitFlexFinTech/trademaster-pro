import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { TrendingUp, Wallet, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WithdrawalData {
  date: string;
  withdrawal: number;
  cumulative: number;
  tradesCount: number;
}

type DateRange = '7d' | '30d' | '90d' | 'all';

export function ProfitWithdrawalChart({ className }: { className?: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<WithdrawalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');

  useEffect(() => {
    async function fetchWithdrawalHistory() {
      if (!user?.id) return;

      setIsLoading(true);

      // Calculate date range
      const endDate = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case '7d':
          startDate = subDays(endDate, 7);
          break;
        case '30d':
          startDate = subDays(endDate, 30);
          break;
        case '90d':
          startDate = subDays(endDate, 90);
          break;
        case 'all':
          startDate = subDays(endDate, 365);
          break;
      }

      // Fetch profit audit logs for withdrawals
      const { data: auditLogs } = await supabase
        .from('profit_audit_log')
        .select('*')
        .eq('user_id', user.id)
        .eq('action', 'auto_withdraw')
        .eq('success', true)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      // Fetch closed trades for daily profits
      const { data: trades } = await supabase
        .from('trades')
        .select('profit_loss, closed_at, created_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      // Build daily data
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      const dailyMap = new Map<string, { withdrawal: number; profit: number; trades: number }>();

      // Initialize all days
      days.forEach(day => {
        dailyMap.set(format(day, 'yyyy-MM-dd'), { withdrawal: 0, profit: 0, trades: 0 });
      });

      // Aggregate withdrawals
      auditLogs?.forEach(log => {
        const day = format(new Date(log.created_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(day);
        if (existing) {
          existing.withdrawal += log.net_pnl || 0;
        }
      });

      // Aggregate trades
      trades?.forEach(trade => {
        const day = format(new Date(trade.closed_at || trade.created_at), 'yyyy-MM-dd');
        const existing = dailyMap.get(day);
        if (existing) {
          existing.profit += trade.profit_loss || 0;
          existing.trades += 1;
        }
      });

      // Calculate cumulative
      let cumulative = 0;
      const chartData: WithdrawalData[] = [];

      dailyMap.forEach((value, date) => {
        cumulative += value.profit;
        chartData.push({
          date,
          withdrawal: value.withdrawal,
          cumulative,
          tradesCount: value.trades,
        });
      });

      setData(chartData);
      setIsLoading(false);
    }

    fetchWithdrawalHistory();
  }, [user?.id, dateRange]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('withdrawal-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profit_audit_log',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refresh data on new withdrawal
          setDateRange(prev => prev); // Trigger re-fetch
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const stats = useMemo(() => {
    const totalWithdrawals = data.reduce((sum, d) => sum + d.withdrawal, 0);
    const totalProfit = data.length > 0 ? data[data.length - 1]?.cumulative || 0 : 0;
    const withdrawalDays = data.filter(d => d.withdrawal > 0).length;
    const avgDaily = data.length > 0 ? totalProfit / data.length : 0;
    
    return { totalWithdrawals, totalProfit, withdrawalDays, avgDaily };
  }, [data]);

  // Milestones
  const milestones = [100, 500, 1000, 5000, 10000];
  const reachedMilestones = milestones.filter(m => stats.totalProfit >= m);
  const nextMilestone = milestones.find(m => stats.totalProfit < m);

  if (isLoading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Profit & Withdrawal History
          </CardTitle>
          <div className="flex items-center gap-1">
            {(['7d', '30d', '90d', 'all'] as DateRange[]).map((range) => (
              <Button
                key={range}
                variant={dateRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => setDateRange(range)}
                className="text-xs px-2"
              >
                {range === 'all' ? 'All' : range}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              Cumulative Profit
            </div>
            <p className="text-xl font-bold text-green-500">
              +${stats.totalProfit.toFixed(2)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="h-3 w-3" />
              Total Withdrawn
            </div>
            <p className="text-xl font-bold text-primary">
              ${stats.totalWithdrawals.toFixed(2)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Calendar className="h-3 w-3" />
              Withdrawal Days
            </div>
            <p className="text-xl font-bold">{stats.withdrawalDays}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3 w-3" />
              Avg Daily
            </div>
            <p className="text-xl font-bold">${stats.avgDaily.toFixed(2)}</p>
          </div>
        </div>

        {/* Milestones */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Milestones:</span>
          {milestones.map(m => (
            <Badge
              key={m}
              variant={stats.totalProfit >= m ? "default" : "outline"}
              className={cn(
                "text-xs",
                stats.totalProfit >= m && "bg-green-500/20 text-green-500 border-green-500"
              )}
            >
              ${m.toLocaleString()}
            </Badge>
          ))}
          {nextMilestone && (
            <span className="text-xs text-muted-foreground ml-auto">
              ${(nextMilestone - stats.totalProfit).toFixed(2)} to next milestone
            </span>
          )}
        </div>

        {/* Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => format(new Date(value), 'MMM d')}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `$${value}`}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `$${value}`}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelFormatter={(label) => format(new Date(label), 'MMMM d, yyyy')}
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(2)}`,
                  name === 'cumulative' ? 'Cumulative Profit' : name === 'withdrawal' ? 'Withdrawn' : name,
                ]}
              />
              
              {/* Milestone reference lines */}
              {reachedMilestones.map(m => (
                <ReferenceLine
                  key={m}
                  yAxisId="left"
                  y={m}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="5 5"
                  strokeOpacity={0.3}
                />
              ))}

              {/* Cumulative profit area */}
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--chart-2))"
                fill="hsl(var(--chart-2))"
                fillOpacity={0.2}
                strokeWidth={2}
                name="cumulative"
              />

              {/* Withdrawal bars */}
              <Bar
                yAxisId="right"
                dataKey="withdrawal"
                fill="hsl(var(--primary))"
                opacity={0.8}
                radius={[4, 4, 0, 0]}
                name="withdrawal"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-[hsl(var(--chart-2))]" />
            <span className="text-muted-foreground">Cumulative Profit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-primary" />
            <span className="text-muted-foreground">Withdrawals</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
