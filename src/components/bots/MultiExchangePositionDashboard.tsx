import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { useTradingData } from '@/contexts/TradingDataContext';
import { cn } from '@/lib/utils';

interface MultiExchangePositionDashboardProps {
  className?: string;
}

const EXCHANGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Binance: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-500' },
  OKX: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500' },
  Bybit: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500' },
  Kraken: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-500' },
};

export function MultiExchangePositionDashboard({ className }: MultiExchangePositionDashboardProps) {
  const { openPositions, metrics, isConnected } = useTradingData();

  // Group positions by exchange
  const positionsByExchange = openPositions.reduce((acc, pos) => {
    const exchange = pos.exchange || 'Unknown';
    if (!acc[exchange]) {
      acc[exchange] = { positions: [], totalPnL: 0 };
    }
    acc[exchange].positions.push(pos);
    acc[exchange].totalPnL += pos.unrealizedPnL || 0;
    return acc;
  }, {} as Record<string, { positions: typeof openPositions; totalPnL: number }>);

  const exchanges = Object.keys(positionsByExchange);

  if (openPositions.length === 0) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardContent className="py-6 text-center">
          <Building2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">No positions across exchanges</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("card-terminal", className)}>
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Multi-Exchange View
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            )} />
            <span className={cn(
              "text-xs font-mono font-bold",
              metrics.totalUnrealizedPnL >= 0 ? "text-profit" : "text-loss"
            )}>
              Total: {metrics.totalUnrealizedPnL >= 0 ? '+' : ''}${metrics.totalUnrealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="px-3 pb-3 pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {exchanges.map(exchange => {
            const data = positionsByExchange[exchange];
            const colors = EXCHANGE_COLORS[exchange] || EXCHANGE_COLORS.Binance;
            
            return (
              <div 
                key={exchange}
                className={cn(
                  "p-2 rounded-lg border",
                  colors.bg, colors.border
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", colors.text, colors.border)}>
                    {exchange}
                  </Badge>
                  <span className={cn(
                    "font-mono text-[10px] font-bold",
                    data.totalPnL >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {data.totalPnL >= 0 ? '+' : ''}${data.totalPnL.toFixed(2)}
                  </span>
                </div>
                
                <div className="space-y-1">
                  {data.positions.map(pos => (
                    <div key={pos.id} className="flex items-center gap-2 text-[9px]">
                      {pos.direction === 'long' ? (
                        <TrendingUp className="h-2.5 w-2.5 text-green-500" />
                      ) : (
                        <TrendingDown className="h-2.5 w-2.5 text-red-500" />
                      )}
                      <span className="font-mono flex-1 truncate">{pos.pair}</span>
                      <span className={cn(
                        "font-mono font-medium",
                        (pos.unrealizedPnL || 0) >= 0 ? "text-profit" : "text-loss"
                      )}>
                        {(pos.unrealizedPnL || 0) >= 0 ? '+' : ''}${(pos.unrealizedPnL || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Exchange summary bar */}
                <div className="mt-2 pt-2 border-t border-border/30">
                  <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                    <span>{data.positions.length} positions</span>
                    <span>
                      {data.positions.filter(p => p.direction === 'long').length}L / 
                      {data.positions.filter(p => p.direction === 'short').length}S
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
