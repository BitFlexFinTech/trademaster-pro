import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { format, startOfDay, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface DailyProfit {
  date: string;
  profit: number;
  cumulative: number;
  wins: number;
}

export function CumulativeProfitChart() {
  const { user } = useAuth();
  const [data, setData] = useState<DailyProfit[]>([]);
  const [totalWins, setTotalWins] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      const { data: trades } = await supabase
        .from('trades')
        .select('profit_loss, closed_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', thirtyDaysAgo)
        .order('closed_at', { ascending: true });

      if (!trades?.length) {
        setLoading(false);
        return;
      }

      // Group by day
      const dailyMap = new Map<string, { profit: number; wins: number }>();
      
      trades.forEach(trade => {
        if (!trade.closed_at) return;
        const day = format(new Date(trade.closed_at), 'yyyy-MM-dd');
        const current = dailyMap.get(day) || { profit: 0, wins: 0 };
        const pnl = trade.profit_loss || 0;
        current.profit += pnl;
        if (pnl >= 1) current.wins++;
        dailyMap.set(day, current);
      });

      // Build cumulative data
      let cumulative = 0;
      let totalW = 0;
      const chartData: DailyProfit[] = [];

      // Fill in missing days
      for (let i = 30; i >= 0; i--) {
        const day = format(subDays(new Date(), i), 'yyyy-MM-dd');
        const dayData = dailyMap.get(day) || { profit: 0, wins: 0 };
        cumulative += dayData.profit;
        totalW += dayData.wins;
        chartData.push({
          date: format(new Date(day), 'MMM dd'),
          profit: dayData.profit,
          cumulative,
          wins: dayData.wins,
        });
      }

      setData(chartData);
      setTotalWins(totalW);
      setTotalProfit(cumulative);
      setLoading(false);
    };

    fetchData();

    const channel = supabase
      .channel('cumulative-profit')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (loading) {
    return (
      <Card className="card-terminal">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Cumulative Profit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse bg-muted/50 rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Cumulative Profit
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              <DollarSign className="h-3 w-3 mr-0.5" />
              {totalWins} wins
            </Badge>
            <span className={cn(
              "text-sm font-mono font-bold",
              totalProfit >= 0 ? "text-profit" : "text-loss"
            )}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No profit data yet
          </p>
        ) : (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number, name: string) => [
                    `$${value.toFixed(2)}`,
                    name === 'cumulative' ? 'Total' : 'Daily'
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#profitGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
