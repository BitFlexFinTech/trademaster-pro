import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PieChart, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { subDays, subWeeks, subMonths, isAfter, format } from 'date-fns';
import { cn } from '@/lib/utils';

type TimeRange = 'daily' | 'weekly' | 'monthly';

interface ProfitData {
  byExchange: { name: string; profit: number }[];
  byPair: { pair: string; profit: number; trades: number }[];
  total: number;
  wins: number;
  trades: number;
}

export function ProfitBreakdownDashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [data, setData] = useState<ProfitData>({
    byExchange: [],
    byPair: [],
    total: 0,
    wins: 0,
    trades: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      
      let startDate: Date;
      switch (timeRange) {
        case 'daily': startDate = subDays(new Date(), 1); break;
        case 'weekly': startDate = subWeeks(new Date(), 1); break;
        case 'monthly': startDate = subMonths(new Date(), 1); break;
      }

      const { data: trades } = await supabase
        .from('trades')
        .select('exchange_name, pair, profit_loss, closed_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', startDate.toISOString());

      if (!trades?.length) {
        setData({ byExchange: [], byPair: [], total: 0, wins: 0, trades: 0 });
        setLoading(false);
        return;
      }

      // Group by exchange
      const exchangeMap = new Map<string, number>();
      const pairMap = new Map<string, { profit: number; trades: number }>();
      let total = 0;
      let wins = 0;

      trades.forEach(trade => {
        const pnl = trade.profit_loss || 0;
        total += pnl;
        if (pnl >= 1) wins++;

        const exchange = trade.exchange_name || 'Unknown';
        exchangeMap.set(exchange, (exchangeMap.get(exchange) || 0) + pnl);

        const pair = trade.pair || 'Unknown';
        const current = pairMap.get(pair) || { profit: 0, trades: 0 };
        pairMap.set(pair, { profit: current.profit + pnl, trades: current.trades + 1 });
      });

      const byExchange = Array.from(exchangeMap.entries())
        .map(([name, profit]) => ({ name, profit }))
        .sort((a, b) => b.profit - a.profit);

      const byPair = Array.from(pairMap.entries())
        .map(([pair, data]) => ({ pair, ...data }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);

      setData({ byExchange, byPair, total, wins, trades: trades.length });
      setLoading(false);
    };

    fetchData();
  }, [user, timeRange]);

  const rangeLabels: Record<TimeRange, string> = {
    daily: '24h',
    weekly: '7d',
    monthly: '30d',
  };

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Profit Breakdown
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {data.wins}/${data.trades} wins
            </Badge>
            <span className={cn(
              "text-sm font-mono font-bold",
              data.total >= 0 ? "text-profit" : "text-loss"
            )}>
              {data.total >= 0 ? '+' : ''}${data.total.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <TabsList className="grid grid-cols-3 h-7 mb-3">
            <TabsTrigger value="daily" className="text-xs">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="text-xs">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="h-32 animate-pulse bg-muted/50 rounded" />
          ) : data.byExchange.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No trades in {rangeLabels[timeRange]}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Exchange Bar Chart */}
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byExchange} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                    />
                    <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                      {data.byExchange.map((entry, index) => (
                        <Cell 
                          key={index} 
                          fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Pairs */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Top Pairs ({rangeLabels[timeRange]})
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {data.byPair.map((item, i) => (
                    <div 
                      key={item.pair}
                      className="p-2 bg-muted/30 rounded text-center"
                    >
                      <p className="text-[10px] text-muted-foreground truncate">{item.pair}</p>
                      <p className={cn(
                        "text-xs font-mono font-bold",
                        item.profit >= 0 ? "text-profit" : "text-loss"
                      )}>
                        ${item.profit.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{item.trades} trades</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
