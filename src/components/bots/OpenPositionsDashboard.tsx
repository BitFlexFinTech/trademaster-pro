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

  // Update P&L every 500ms using WebSocket prices
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
    intervalRef.current = setInterval(updatePnL, 500);

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
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {positionsWithPnL.map(pos => (
              <div 
                key={pos.id}
                className={cn(
                  "p-2 rounded-lg border transition-colors relative group",
                  pos.pnl >= 0 
                    ? "border-emerald-500/30 bg-emerald-500/5" 
                    : "border-amber-500/30 bg-amber-500/5"
                )}
              >
                {/* Manual Close Button */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                  onClick={() => handleManualClose(pos.id, pos.pair)}
                  disabled={closingTradeId === pos.id}
                  title="Close position"
                >
                  {closingTradeId === pos.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </Button>

                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs">{pos.pair}</span>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[8px] h-4 px-1",
                        pos.direction === 'long' 
                          ? "text-emerald-400 border-emerald-500/50" 
                          : "text-red-400 border-red-500/50"
                      )}
                    >
                      {pos.direction === 'long' ? (
                        <><TrendingUp className="h-2 w-2 mr-0.5" />L</>
                      ) : (
                        <><TrendingDown className="h-2 w-2 mr-0.5" />S</>
                      )}
                    </Badge>
                    {/* MTF Alignment Indicator */}
                    <MTFAlignmentIndicator 
                      analysis={mtfSignals[pos.pair] || null}
                      positionDirection={pos.direction}
                      compact
                    />
                    {/* Profit ETA Badge */}
                    <ProfitETABadge
                      pair={pos.pair}
                      direction={pos.direction}
                      entryPrice={pos.entryPrice}
                      currentPnL={pos.pnl}
                      targetProfit={pos.targetProfit}
                      positionSize={pos.positionSize}
                    />
                  </div>
                  <span className={cn(
                    "font-mono font-bold text-xs",
                    pos.pnl >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
                  <span>${pos.entryPrice.toFixed(pos.entryPrice < 1 ? 4 : 2)} → ${pos.currentPrice.toFixed(pos.currentPrice < 1 ? 4 : 2)}</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2 w-2" />
                    {formatDistanceToNow(pos.openedAt, { addSuffix: false })}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <Progress 
                    value={pos.progressPercent} 
                    className={cn(
                      "h-1",
                      pos.progressPercent >= 100 ? "bg-emerald-900" : ""
                    )}
                  />
                  <div className="flex items-center justify-between text-[8px]">
                    <span className="text-muted-foreground">
                      {pos.progressPercent.toFixed(0)}%
                    </span>
                    {pos.progressPercent >= 100 && (
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <Target className="h-2 w-2" />
                        Target!
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
