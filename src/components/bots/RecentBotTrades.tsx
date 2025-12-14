import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import { format } from 'date-fns';

interface BotTrade {
  id: string;
  pair: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  amount: number;
  profit_loss: number | null;
  exchange_name: string | null;
  created_at: string;
  closed_at: string | null;
  status: string | null;
}

export function RecentBotTrades() {
  const { user } = useAuth();
  const { resetTrigger, mode } = useTradingMode();
  const [trades, setTrades] = useState<BotTrade[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculate summary stats - MUST be before any early returns
  const { totalPnL, tradeCount } = useMemo(() => {
    const total = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
    return { totalPnL: total, tradeCount: trades.length };
  }, [trades]);

  // Fetch trades function
  const fetchTrades = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_sandbox', mode === 'demo')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setTrades(data as BotTrade[]);
    }
    setLoading(false);
  };

  // Fetch initial trades
  useEffect(() => {
    fetchTrades();
  }, [user, mode]);

  // Listen to reset trigger - clear trades
  useEffect(() => {
    if (resetTrigger > 0) {
      setTrades([]);
      setLoading(true);
      // Delay refetch to allow database deletes to complete
      setTimeout(() => {
        fetchTrades();
      }, 500);
    }
  }, [resetTrigger]);

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('bot-trades')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newTrade = payload.new as BotTrade;
          setTrades(prev => [newTrade, ...prev.slice(0, 19)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading trades...
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No trades yet. Start the bot to begin trading.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with badges */}
      <div className="flex items-center justify-between mb-2 px-1 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-primary" />
          <span className="text-xs font-semibold text-foreground">Recent Trades</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[9px] h-5 px-1.5 font-mono">
            {tradeCount}
          </Badge>
          <Badge 
            variant={totalPnL >= 0 ? 'default' : 'destructive'} 
            className={cn(
              "text-[9px] h-5 px-1.5 font-mono transition-all",
              totalPnL >= 0 ? 'bg-primary/20 text-primary border-primary/30' : 'bg-destructive/20 text-destructive border-destructive/30'
            )}
          >
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="bg-secondary/30 rounded p-2 text-[10px] border border-border/30"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {trade.direction === 'long' ? (
                    <TrendingUp className="w-3 h-3 text-primary" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-destructive" />
                  )}
                  <span className="font-semibold text-foreground">{trade.pair}</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      'text-[8px] h-4',
                      trade.direction === 'long' ? 'border-primary text-primary' : 'border-destructive text-destructive'
                    )}
                  >
                    {trade.direction.toUpperCase()}
                  </Badge>
                </div>
                <span className={cn(
                  'font-mono font-bold',
                  (trade.profit_loss || 0) >= 0 ? 'text-primary' : 'text-destructive'
                )}>
                  {(trade.profit_loss || 0) >= 0 ? '+' : ''}${(trade.profit_loss || 0).toFixed(2)}
                </span>
              </div>
              
              <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                <div>
                  <span className="block text-[8px]">Entry</span>
                  <span className="font-mono text-foreground">${trade.entry_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="block text-[8px]">Exit</span>
                  <span className="font-mono text-foreground">
                    {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-[8px]">Exchange</span>
                  <span className="text-foreground">{trade.exchange_name || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  <span className="text-foreground">
                    {format(new Date(trade.created_at), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
