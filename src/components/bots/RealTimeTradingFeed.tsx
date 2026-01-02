import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowUpCircle, ArrowDownCircle, Clock, Activity, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TradeFeedItem {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange_name: string;
  entry_price: number;
  exit_price?: number | null;
  profit_loss: number | null;
  status: 'open' | 'closed' | 'pending';
  created_at: string;
  closed_at?: string | null;
  amount: number;
  is_sandbox?: boolean;
}

export const RealTimeTradingFeed: React.FC<{ className?: string }> = ({ className }) => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeFeedItem[]>([]);
  const [isLive, setIsLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial trades
  useEffect(() => {
    if (!user?.id) return;

    const fetchTrades = async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('id, pair, direction, exchange_name, entry_price, exit_price, profit_loss, status, created_at, closed_at, amount')
        .eq('user_id', user.id)
        .eq('is_sandbox', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data && !error) {
        setTrades(data as TradeFeedItem[]);
      }
    };

    fetchTrades();
  }, [user?.id]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('trading-feed-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        console.log('📥 New trade:', payload.new);
        const newTrade = payload.new as TradeFeedItem;
        if (!newTrade.is_sandbox) {
          setTrades(prev => [newTrade, ...prev].slice(0, 50));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        console.log('🔄 Trade updated:', payload.new);
        const updatedTrade = payload.new as TradeFeedItem;
        setTrades(prev => prev.map(t => 
          t.id === updatedTrade.id ? { ...t, ...updatedTrade } : t
        ));
      })
      .subscribe((status) => {
        console.log('Trading feed subscription:', status);
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const getStatusBadge = (trade: TradeFeedItem) => {
    if (trade.status === 'closed') {
      const profit = trade.profit_loss || 0;
      return (
        <Badge variant="secondary" className={cn(
          "text-xs font-medium",
          profit >= 0 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
        )}>
          <span className="flex items-center gap-1">
            {profit >= 0 ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {profit >= 0 ? '+' : ''}{profit.toFixed(2)} USDT
          </span>
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse text-xs">
        OPEN
      </Badge>
    );
  };

  const openCount = trades.filter(t => t.status === 'open').length;
  const closedCount = trades.filter(t => t.status === 'closed').length;

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Live Trading Feed
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-blue-400">{openCount} open</span>
              <span>•</span>
              <span className="text-green-400">{closedCount} closed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "h-2 w-2 rounded-full",
                isLive ? "bg-green-500 animate-pulse" : "bg-yellow-500"
              )} />
              <span className="text-xs text-muted-foreground">
                {isLive ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[320px] pr-2" ref={scrollRef}>
          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <Activity className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">No trades yet</p>
              <p className="text-xs mt-1">Trades will appear here in real-time</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {trades.map((trade, index) => (
                <div
                  key={trade.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg border transition-all",
                    trade.status === 'open' 
                      ? "bg-blue-500/5 border-blue-500/20" 
                      : (trade.profit_loss || 0) >= 0 
                        ? "bg-green-500/5 border-green-500/10" 
                        : "bg-red-500/5 border-red-500/10",
                    index === 0 && "animate-in slide-in-from-top-1 duration-200"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {trade.direction === 'long' ? (
                      <ArrowUpCircle className="h-6 w-6 text-green-400 flex-shrink-0" />
                    ) : (
                      <ArrowDownCircle className="h-6 w-6 text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground">{trade.pair}</span>
                        <Badge variant="outline" className={cn(
                          "text-[10px] px-1.5 py-0",
                          trade.direction === 'long' 
                            ? "border-green-500/40 text-green-400" 
                            : "border-red-500/40 text-red-400"
                        )}>
                          {trade.direction.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
                        <span className="capitalize">{trade.exchange_name}</span>
                        <span>•</span>
                        <span>${trade.amount?.toFixed(0) || '333'}</span>
                        <span>•</span>
                        <Clock className="h-2.5 w-2.5" />
                        <span>{format(new Date(trade.created_at), 'HH:mm:ss')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {getStatusBadge(trade)}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      @ ${trade.entry_price?.toFixed(2)}
                      {trade.exit_price && (
                        <span className="ml-1">→ ${trade.exit_price.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
