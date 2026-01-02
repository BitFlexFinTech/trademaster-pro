import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Activity, TrendingUp, TrendingDown, Target, Clock, X, Loader2 } from 'lucide-react';
import { useTradingRealtimeState } from '@/hooks/useTradingRealtimeState';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useMultiTimeframeSignals } from '@/hooks/useMultiTimeframeSignals';
import { MTFAlignmentIndicator } from './MTFAlignmentIndicator';
import { ProfitETABadge } from './ProfitETAIndicator';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PositionWithPnL {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  positionSize: number;
  targetProfit: number;
  openedAt: Date;
  currentPrice: number;
  pnl: number;
  progressPercent: number;
}

interface OpenPositionsDashboardProps {
  className?: string;
}

export function OpenPositionsDashboard({ className }: OpenPositionsDashboardProps) {
  // Use unified real-time state
  const { openTrades, isLoading } = useTradingRealtimeState();
  const { getPrice, isConnected } = useBinanceWebSocket();
  const [positionsWithPnL, setPositionsWithPnL] = useState<PositionWithPnL[]>([]);
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get unique symbols for MTF analysis
  const symbols = useMemo(() => 
    [...new Set(openTrades.map(t => t.pair))],
    [openTrades]
  );
  const { signals: mtfSignals } = useMultiTimeframeSignals(symbols);

  // Update P&L every 100ms using WebSocket prices for millisecond precision
  useEffect(() => {
    const updatePnL = () => {
      const updated = openTrades.map(pos => {
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
    intervalRef.current = setInterval(updatePnL, 100); // 100ms for millisecond precision

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [openTrades, getPrice]);

  const totalPnL = positionsWithPnL.reduce((sum, p) => sum + p.pnl, 0);

  // Manual close handler
  const handleManualClose = async (tradeId: string, pair: string) => {
    setClosingTradeId(tradeId);
    try {
      const { error } = await supabase.functions.invoke('check-trade-status', {
        body: { forceCloseTradeId: tradeId }
      });
      if (error) throw error;
      toast.success(`Closed ${pair} position`, {
        description: 'Position closed at market price'
      });
    } catch (e) {
      console.error('Failed to close position:', e);
      toast.error('Failed to close position', {
        description: e instanceof Error ? e.message : 'Unknown error'
      });
    } finally {
      setClosingTradeId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="card-terminal">
        <CardContent className="py-4 text-center">
          <Activity className="h-6 w-6 mx-auto mb-2 animate-spin" />
          <p className="text-xs text-muted-foreground">Loading positions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("card-terminal", className)}>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
            Open Positions
            <Badge variant="outline" className="text-[9px] h-4">
              {openTrades.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )} />
            <span className={cn(
              "text-xs font-mono font-bold",
              totalPnL >= 0 ? "text-profit" : "text-loss"
            )}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {positionsWithPnL.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Activity className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">No open positions</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {positionsWithPnL.map(pos => {
              // Calculate velocity ($ per minute toward target)
              const elapsedMinutes = (Date.now() - new Date(pos.openedAt).getTime()) / 60000;
              const velocity = elapsedMinutes > 0 ? pos.pnl / elapsedMinutes : 0;
              const remainingProfit = pos.targetProfit - pos.pnl;
              const etaMinutes = velocity > 0 ? remainingProfit / velocity : 999;

              return (
                <div 
                  key={pos.id}
                  className={cn(
                    "flex items-center gap-4 p-3 rounded-lg border transition-all",
                    pos.pnl >= 0 
                      ? "border-emerald-500/30 bg-emerald-500/5" 
                      : "border-amber-500/30 bg-amber-500/5"
                  )}
                >
                  {/* Pair + Direction */}
                  <div className="flex items-center gap-2 min-w-[100px]">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 px-1.5",
                        pos.direction === 'long' ? "text-emerald-400 border-emerald-500/50" : "text-red-400 border-red-500/50"
                      )}
                    >
                      {pos.direction === 'long' ? '↑ LONG' : '↓ SHORT'}
                    </Badge>
                    <span className="font-semibold text-sm">{pos.pair}</span>
                  </div>
                  
                  {/* Exchange Badge */}
                  <Badge variant="secondary" className="text-[9px] h-4 hidden sm:flex">
                    {pos.exchange}
                  </Badge>
                  
                  {/* Entry → Current Price */}
                  <div className="text-xs text-muted-foreground min-w-[140px] hidden md:block">
                    ${pos.entryPrice.toFixed(pos.entryPrice > 100 ? 2 : 4)} → 
                    <span className={pos.pnl >= 0 ? "text-profit" : "text-loss"}>
                      ${pos.currentPrice.toFixed(pos.currentPrice > 100 ? 2 : 4)}
                    </span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="flex-1 min-w-[80px] max-w-[120px]">
                    <Progress 
                      value={Math.min(100, Math.max(0, pos.progressPercent))} 
                      className="h-2"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {pos.progressPercent.toFixed(0)}% to $1
                    </span>
                  </div>
                  
                  {/* Profit Velocity Indicator */}
                  <div className="flex items-center gap-1 min-w-[70px]">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className={cn(
                      "text-[10px] font-mono",
                      velocity > 0.05 ? "text-profit" : velocity < 0 ? "text-loss" : "text-muted-foreground"
                    )}>
                      {etaMinutes < 999 
                        ? `~${Math.ceil(etaMinutes)}m` 
                        : velocity < 0 ? "⚠️" : "—"
                      }
                    </span>
                  </div>
                  
                  {/* P&L Display with Precision */}
                  <div className="min-w-[60px] text-right">
                    <span className={cn(
                      "font-mono font-bold text-sm",
                      pos.pnl >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(3)}
                    </span>
                  </div>
                  
                  {/* Close Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 gap-1 border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
                    onClick={() => handleManualClose(pos.id, pos.pair)}
                    disabled={closingTradeId === pos.id}
                  >
                    {closingTradeId === pos.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <X className="h-3 w-3" />
                        Close
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
