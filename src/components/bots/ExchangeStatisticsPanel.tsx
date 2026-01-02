import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart3, TrendingUp, Clock, DollarSign, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface ExchangeStats {
  exchange: string;
  hitRate: number;
  avgTradeTimeMs: number;
  totalProfit: number;
  tradeCount: number;
  wins: number;
  losses: number;
  bestPair: string;
  bestPairProfit: number;
}

export function ExchangeStatisticsPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ExchangeStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      setLoading(true);
      const { data: trades } = await supabase
        .from('trades')
        .select('exchange_name, profit_loss, created_at, closed_at, pair, status')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!trades?.length) {
        setLoading(false);
        return;
      }

      // Group by exchange
      const exchangeMap = new Map<string, {
        profits: number[];
        durations: number[];
        pairs: Map<string, number>;
        wins: number;
        losses: number;
      }>();

      trades.forEach(trade => {
        const exchange = trade.exchange_name || 'Unknown';
        if (!exchangeMap.has(exchange)) {
          exchangeMap.set(exchange, { profits: [], durations: [], pairs: new Map(), wins: 0, losses: 0 });
        }
        const ex = exchangeMap.get(exchange)!;
        const pnl = trade.profit_loss || 0;
        ex.profits.push(pnl);
        
        if (pnl >= 1) ex.wins++;
        else if (pnl < 0) ex.losses++;

        if (trade.created_at && trade.closed_at) {
          const duration = new Date(trade.closed_at).getTime() - new Date(trade.created_at).getTime();
          ex.durations.push(duration);
        }

        const pair = trade.pair || 'Unknown';
        const currentPairProfit = ex.pairs.get(pair) || 0;
        ex.pairs.set(pair, currentPairProfit + pnl);
      });

      const exchangeStats: ExchangeStats[] = [];
      exchangeMap.forEach((data, exchange) => {
        const totalProfit = data.profits.reduce((a, b) => a + b, 0);
        const avgDuration = data.durations.length > 0 
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length 
          : 0;
        
        let bestPair = '';
        let bestPairProfit = 0;
        data.pairs.forEach((profit, pair) => {
          if (profit > bestPairProfit) {
            bestPair = pair;
            bestPairProfit = profit;
          }
        });

        const hitRate = data.profits.length > 0 
          ? (data.wins / data.profits.length) * 100 
          : 0;

        exchangeStats.push({
          exchange,
          hitRate,
          avgTradeTimeMs: avgDuration,
          totalProfit,
          tradeCount: data.profits.length,
          wins: data.wins,
          losses: data.losses,
          bestPair,
          bestPairProfit,
        });
      });

      setStats(exchangeStats.sort((a, b) => b.totalProfit - a.totalProfit));
      setLoading(false);
    };

    fetchStats();

    // Subscribe to trades updates
    const channel = supabase
      .channel('exchange-stats')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const formatDuration = (ms: number) => {
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  if (loading) {
    return (
      <Card className="card-terminal">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Exchange Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted/50 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card className="card-terminal">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Exchange Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No trade data yet. Start trading to see statistics.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Exchange Statistics
          <Badge variant="outline" className="text-[10px]">{stats.length} exchanges</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.map(ex => (
          <div key={ex.exchange} className="p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm">{ex.exchange}</span>
              <span className={cn(
                "text-sm font-mono font-bold",
                ex.totalProfit >= 0 ? "text-profit" : "text-loss"
              )}>
                {ex.totalProfit >= 0 ? '+' : ''}${ex.totalProfit.toFixed(2)}
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              <div className="flex flex-col items-center p-1.5 bg-background/50 rounded">
                <Target className="h-3 w-3 text-primary mb-0.5" />
                <span className="text-muted-foreground">Hit Rate</span>
                <span className="font-bold">{ex.hitRate.toFixed(0)}%</span>
              </div>
              <div className="flex flex-col items-center p-1.5 bg-background/50 rounded">
                <Clock className="h-3 w-3 text-blue-400 mb-0.5" />
                <span className="text-muted-foreground">Avg Time</span>
                <span className="font-bold">{formatDuration(ex.avgTradeTimeMs)}</span>
              </div>
              <div className="flex flex-col items-center p-1.5 bg-background/50 rounded">
                <TrendingUp className="h-3 w-3 text-emerald-400 mb-0.5" />
                <span className="text-muted-foreground">Wins</span>
                <span className="font-bold text-profit">{ex.wins}</span>
              </div>
              <div className="flex flex-col items-center p-1.5 bg-background/50 rounded">
                <DollarSign className="h-3 w-3 text-amber-400 mb-0.5" />
                <span className="text-muted-foreground">Trades</span>
                <span className="font-bold">{ex.tradeCount}</span>
              </div>
            </div>

            {ex.bestPair && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Best: <span className="text-foreground font-medium">{ex.bestPair}</span>
                <span className="text-profit ml-1">+${ex.bestPairProfit.toFixed(2)}</span>
              </div>
            )}

            <Progress 
              value={ex.hitRate} 
              className="h-1 mt-2"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
