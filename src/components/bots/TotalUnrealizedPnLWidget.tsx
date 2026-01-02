import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useTradingRealtimeState } from '@/hooks/useTradingRealtimeState';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { cn } from '@/lib/utils';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

interface TotalUnrealizedPnLWidgetProps {
  className?: string;
}

interface ExchangePnL {
  exchange: string;
  pnl: number;
  positionCount: number;
}

export function TotalUnrealizedPnLWidget({ className }: TotalUnrealizedPnLWidgetProps) {
  const { openTrades, isLoading } = useTradingRealtimeState();
  const { getPrice, isConnected } = useBinanceWebSocket();
  const [totalUnrealizedPnL, setTotalUnrealizedPnL] = useState(0);
  const [exchangeBreakdown, setExchangeBreakdown] = useState<ExchangePnL[]>([]);
  const [pnlHistory, setPnlHistory] = useState<number[]>([]);

  // Calculate unrealized P&L every 500ms
  useEffect(() => {
    const calculatePnL = () => {
      let total = 0;
      const byExchange: Record<string, { pnl: number; count: number }> = {};

      openTrades.forEach(trade => {
        const symbol = trade.pair.replace('/', '');
        const currentPrice = getPrice(symbol) || trade.entryPrice;

        const priceDiff = trade.direction === 'long'
          ? currentPrice - trade.entryPrice
          : trade.entryPrice - currentPrice;

        const percentChange = (priceDiff / trade.entryPrice);
        const grossPnl = trade.positionSize * percentChange;
        const fees = trade.positionSize * 0.002; // 0.2% round trip
        const netPnl = grossPnl - fees;

        total += netPnl;

        const ex = trade.exchange || 'Unknown';
        if (!byExchange[ex]) {
          byExchange[ex] = { pnl: 0, count: 0 };
        }
        byExchange[ex].pnl += netPnl;
        byExchange[ex].count += 1;
      });

      setTotalUnrealizedPnL(total);
      setExchangeBreakdown(
        Object.entries(byExchange).map(([exchange, data]) => ({
          exchange,
          pnl: data.pnl,
          positionCount: data.count,
        }))
      );

      // Track P&L history for sparkline (last 60 data points = 30 seconds)
      setPnlHistory(prev => [...prev.slice(-59), total]);
    };

    calculatePnL();
    const interval = setInterval(calculatePnL, 500);
    return () => clearInterval(interval);
  }, [openTrades, getPrice]);

  const isPositive = totalUnrealizedPnL >= 0;
  const trend = useMemo(() => {
    if (pnlHistory.length < 10) return 'neutral';
    const recent = pnlHistory.slice(-10);
    const older = pnlHistory.slice(-20, -10);
    if (older.length === 0) return 'neutral';
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    return recentAvg > olderAvg ? 'up' : recentAvg < olderAvg ? 'down' : 'neutral';
  }, [pnlHistory]);

  if (isLoading) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardContent className="py-4 text-center">
          <Activity className="h-5 w-5 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "card-terminal transition-all",
      isPositive ? "border-emerald-500/30" : "border-red-500/30",
      className
    )}>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-primary" />
            Total Unrealized P&L
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )} />
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {openTrades.length} positions
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {openTrades.length === 0 ? (
          <div className="text-center py-3 text-muted-foreground">
            <Wallet className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">No open positions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Main P&L Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {trend === 'up' ? (
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                ) : trend === 'down' ? (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                ) : (
                  <Activity className="h-5 w-5 text-amber-400" />
                )}
                <span className={cn(
                  "text-2xl font-bold font-mono transition-colors",
                  isPositive ? "text-emerald-400" : "text-red-400"
                )}>
                  {isPositive ? '+' : ''}
                  <AnimatedCounter value={totalUnrealizedPnL} decimals={2} prefix="$" />
                </span>
              </div>
            </div>

            {/* Exchange Breakdown */}
            {exchangeBreakdown.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  By Exchange
                </p>
                <div className="flex flex-wrap gap-2">
                  {exchangeBreakdown.map(({ exchange, pnl, positionCount }) => (
                    <div
                      key={exchange}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                        pnl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                      )}
                    >
                      <span className="text-muted-foreground">{exchange}</span>
                      <span className={cn(
                        "font-mono font-medium",
                        pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                      <Badge variant="outline" className="text-[8px] h-3 px-0.5">
                        {positionCount}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mini Sparkline representation */}
            {pnlHistory.length > 10 && (
              <div className="h-6 flex items-end gap-px">
                {pnlHistory.slice(-30).map((value, i) => {
                  const max = Math.max(...pnlHistory.slice(-30).map(Math.abs), 0.01);
                  const height = Math.abs(value) / max * 100;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-t transition-all",
                        value >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"
                      )}
                      style={{ height: `${Math.max(5, height)}%` }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
