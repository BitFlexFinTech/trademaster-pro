import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, TrendingUp, TrendingDown, Target, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface OpenPosition {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  positionSize: number;
  targetProfit: number;
  openedAt: Date;
}

interface PositionWithPnL extends OpenPosition {
  currentPrice: number;
  pnl: number;
  progressPercent: number;
}

export function OpenPositionsDashboard() {
  const { user } = useAuth();
  const { getPrice, isConnected } = useBinanceWebSocket();
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [positionsWithPnL, setPositionsWithPnL] = useState<PositionWithPnL[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch open positions from database
  useEffect(() => {
    if (!user) return;

    const fetchPositions = async () => {
      const { data } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (data) {
        setPositions(data.map(t => ({
          id: t.id,
          pair: t.pair,
          direction: t.direction as 'long' | 'short',
          exchange: t.exchange_name || 'Unknown',
          entryPrice: t.entry_price,
          positionSize: t.amount,
          targetProfit: t.target_profit_usd || 1,
          openedAt: new Date(t.created_at),
        })));
      }
    };

    fetchPositions();

    const channel = supabase
      .channel('open-positions')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchPositions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Update P&L every 500ms using WebSocket prices
  useEffect(() => {
    const updatePnL = () => {
      const updated = positions.map(pos => {
        const symbol = pos.pair.replace('/', '');
        const currentPrice = getPrice(symbol) || pos.entryPrice;
        
        const priceDiff = pos.direction === 'long'
          ? currentPrice - pos.entryPrice
          : pos.entryPrice - currentPrice;
        
        const percentChange = (priceDiff / pos.entryPrice) * 100;
        const grossPnl = pos.positionSize * (percentChange / 100);
        const fees = pos.positionSize * 0.002; // 0.2% round trip
        const netPnl = grossPnl - fees;
        
        const progressPercent = Math.min(100, Math.max(0, (netPnl / pos.targetProfit) * 100));

        return {
          ...pos,
          currentPrice,
          pnl: netPnl,
          progressPercent,
        };
      });

      setPositionsWithPnL(updated);
    };

    updatePnL();
    intervalRef.current = setInterval(updatePnL, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [positions, getPrice]);

  const totalPnL = positionsWithPnL.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            Open Positions
            <Badge variant="outline" className="text-[10px]">
              {positions.length} active
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )} />
            <span className={cn(
              "text-sm font-mono font-bold",
              totalPnL >= 0 ? "text-profit" : "text-loss"
            )}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {positionsWithPnL.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open positions</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {positionsWithPnL.map(pos => (
              <div 
                key={pos.id}
                className={cn(
                  "p-3 rounded-lg border transition-colors",
                  pos.pnl >= 0 
                    ? "border-emerald-500/30 bg-emerald-500/5" 
                    : "border-amber-500/30 bg-amber-500/5"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{pos.pair}</span>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px]",
                        pos.direction === 'long' 
                          ? "text-emerald-400 border-emerald-500/50" 
                          : "text-red-400 border-red-500/50"
                      )}
                    >
                      {pos.direction === 'long' ? (
                        <><TrendingUp className="h-2.5 w-2.5 mr-0.5" />LONG</>
                      ) : (
                        <><TrendingDown className="h-2.5 w-2.5 mr-0.5" />SHORT</>
                      )}
                    </Badge>
                    <Badge variant="secondary" className="text-[9px]">{pos.exchange}</Badge>
                  </div>
                  <span className={cn(
                    "font-mono font-bold text-sm",
                    pos.pnl >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                  <div>
                    <span className="text-muted-foreground">Entry</span>
                    <p className="font-mono">${pos.entryPrice.toFixed(pos.entryPrice < 1 ? 6 : 2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current</span>
                    <p className={cn(
                      "font-mono",
                      pos.pnl >= 0 ? "text-profit" : "text-loss"
                    )}>
                      ${pos.currentPrice.toFixed(pos.currentPrice < 1 ? 6 : 2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDistanceToNow(pos.openedAt, { addSuffix: false })}
                    </span>
                    <p className="font-mono">${pos.positionSize.toFixed(0)}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <Progress 
                    value={pos.progressPercent} 
                    className={cn(
                      "h-1.5",
                      pos.progressPercent >= 100 ? "bg-emerald-900" : ""
                    )}
                  />
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">
                      {pos.progressPercent.toFixed(0)}% → ${pos.targetProfit.toFixed(2)} target
                    </span>
                    {pos.progressPercent >= 100 && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Target className="h-2.5 w-2.5" />
                        Target hit!
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
