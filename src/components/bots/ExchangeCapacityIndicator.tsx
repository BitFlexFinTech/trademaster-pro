import { useMemo } from 'react';
import { AlertTriangle, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTradingRealtimeState } from '@/hooks/useTradingRealtimeState';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const MAX_POSITIONS_PER_EXCHANGE = 3;

interface ExchangeCapacity {
  name: string;
  openCount: number;
  maxCount: number;
  percentage: number;
  isAtCapacity: boolean;
}

export function ExchangeCapacityIndicator({ className }: { className?: string }) {
  const { openTrades, isLoading } = useTradingRealtimeState();
  const { connectedExchanges } = useConnectedExchanges();

  const capacityData = useMemo(() => {
    // Group open trades by exchange
    const tradesByExchange = openTrades.reduce((acc, trade) => {
      const exchange = trade.exchange || 'Unknown';
      acc[exchange] = (acc[exchange] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Build capacity data for each connected exchange
    const exchanges: ExchangeCapacity[] = connectedExchanges.map(ex => {
      const openCount = tradesByExchange[ex.name] || 0;
      return {
        name: ex.name,
        openCount,
        maxCount: MAX_POSITIONS_PER_EXCHANGE,
        percentage: (openCount / MAX_POSITIONS_PER_EXCHANGE) * 100,
        isAtCapacity: openCount >= MAX_POSITIONS_PER_EXCHANGE,
      };
    });

    // Add any exchanges with trades that aren't in connected list
    Object.keys(tradesByExchange).forEach(exchange => {
      if (!exchanges.find(e => e.name === exchange)) {
        const openCount = tradesByExchange[exchange];
        exchanges.push({
          name: exchange,
          openCount,
          maxCount: MAX_POSITIONS_PER_EXCHANGE,
          percentage: (openCount / MAX_POSITIONS_PER_EXCHANGE) * 100,
          isAtCapacity: openCount >= MAX_POSITIONS_PER_EXCHANGE,
        });
      }
    });

    const totalOpen = openTrades.length;
    const totalSlots = exchanges.length * MAX_POSITIONS_PER_EXCHANGE;
    const allAtCapacity = exchanges.length > 0 && exchanges.every(e => e.isAtCapacity);

    return {
      exchanges: exchanges.filter(e => e.openCount > 0 || connectedExchanges.some(c => c.name === e.name)),
      totalOpen,
      totalSlots,
      allAtCapacity,
    };
  }, [openTrades, connectedExchanges]);

  if (isLoading) {
    return null;
  }

  if (capacityData.exchanges.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Compact header with total */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Server className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">Exchange Capacity</span>
        </div>
        <Badge 
          variant={capacityData.allAtCapacity ? 'destructive' : 'outline'} 
          className="text-[9px] px-1.5 py-0"
        >
          {capacityData.totalOpen}/{capacityData.totalSlots} slots
        </Badge>
      </div>

      {/* Per-exchange capacity bars */}
      <div className="space-y-1">
        {capacityData.exchanges.map(exchange => (
          <TooltipProvider key={exchange.name}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground w-14 truncate">
                    {exchange.name}
                  </span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        exchange.isAtCapacity 
                          ? 'bg-destructive' 
                          : exchange.percentage >= 66 
                            ? 'bg-amber-500' 
                            : 'bg-primary'
                      )}
                      style={{ width: `${Math.min(exchange.percentage, 100)}%` }}
                    />
                  </div>
                  <span className={cn(
                    'text-[9px] font-mono w-8 text-right',
                    exchange.isAtCapacity ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {exchange.openCount}/{exchange.maxCount}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                <p>{exchange.name}: {exchange.openCount} open positions</p>
                {exchange.isAtCapacity && (
                  <p className="text-destructive">At max capacity - waiting for closes</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* All at capacity warning */}
      {capacityData.allAtCapacity && (
        <div className="flex items-start gap-1.5 p-1.5 bg-amber-500/10 border border-amber-500/20 rounded">
          <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[9px] text-amber-400 font-medium">Trading Paused</p>
            <p className="text-[8px] text-muted-foreground">
              All exchanges at max capacity. New trades will resume when positions close.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
