import { Activity, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTradingRealtimeState } from '@/hooks/useTradingRealtimeState';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { cn } from '@/lib/utils';

interface ExchangeSlotInfo {
  name: string;
  openCount: number;
  maxSlots: number;
  totalPnL: number;
}

export function TradingStatusCard() {
  const { openTrades, isLoading } = useTradingRealtimeState();
  const { connectedExchanges } = useConnectedExchanges();

  // Group trades by exchange
  const exchangeData = openTrades.reduce((acc, trade) => {
    const exchangeName = trade.exchange || 'Unknown';
    if (!acc[exchangeName]) {
      acc[exchangeName] = {
        name: exchangeName,
        openCount: 0,
        maxSlots: 3, // Default max slots per exchange
        totalPnL: 0,
      };
    }
    acc[exchangeName].openCount++;
    // Note: OpenTrade doesn't have profit_loss - it's calculated from current price
    return acc;
  }, {} as Record<string, ExchangeSlotInfo>);

  // Add connected exchanges that have no open trades
  connectedExchanges.forEach(ex => {
    if (!exchangeData[ex.name]) {
      exchangeData[ex.name] = {
        name: ex.name,
        openCount: 0,
        maxSlots: 3,
        totalPnL: 0,
      };
    }
  });

  const exchangeList = Object.values(exchangeData);
  const totalOpenPositions = openTrades.length;
  const totalSlots = exchangeList.reduce((sum, ex) => sum + ex.maxSlots, 0);
  const allAtCapacity = exchangeList.length > 0 && exchangeList.every(ex => ex.openCount >= ex.maxSlots);

  // Count by direction
  const longCount = openTrades.filter(t => t.direction === 'long').length;
  const shortCount = openTrades.filter(t => t.direction === 'short').length;

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Trading Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Trading Status
          </span>
          <Badge variant={allAtCapacity ? "destructive" : totalOpenPositions > 0 ? "default" : "secondary"}>
            {totalOpenPositions}/{totalSlots || '?'} slots
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Exchange Slot Usage */}
        <div className="space-y-2">
          {exchangeList.map(exchange => {
            const usagePercent = (exchange.openCount / exchange.maxSlots) * 100;
            const isAtCapacity = exchange.openCount >= exchange.maxSlots;
            
            return (
              <div key={exchange.name} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium">{exchange.name}</span>
                  <Badge 
                    variant={isAtCapacity ? "destructive" : exchange.openCount > 0 ? "default" : "outline"}
                    className="text-[10px] h-5"
                  >
                    {exchange.openCount}/{exchange.maxSlots}
                  </Badge>
                </div>
                <Progress 
                  value={usagePercent} 
                  className="h-1.5"
                />
              </div>
            );
          })}
        </div>

        {/* Direction Breakdown */}
        {totalOpenPositions > 0 && (
          <div className="flex items-center gap-3 text-xs pt-2 border-t">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span>{longCount} Long</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span>{shortCount} Short</span>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {allAtCapacity && (
          <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs">
            <Clock className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
            <span className="text-amber-600 dark:text-amber-400">
              All exchanges at max capacity. Waiting for positions to close at $1 profit target.
            </span>
          </div>
        )}

        {totalOpenPositions === 0 && connectedExchanges.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-muted rounded text-xs">
            <AlertCircle className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              No open positions. Bot will open trades when market conditions are favorable.
            </span>
          </div>
        )}

        {connectedExchanges.length === 0 && (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs">
            <AlertCircle className="h-3 w-3 mt-0.5 text-destructive shrink-0" />
            <span className="text-destructive">
              No exchanges connected. Connect an exchange to start trading.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
