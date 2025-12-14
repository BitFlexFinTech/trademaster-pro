import { usePortfolio } from '@/hooks/usePortfolio';
import { TrendingUp, TrendingDown, RefreshCw, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function PortfolioCard() {
  const { portfolio, loading, refetch, tradingMode, lastSyncTime } = usePortfolio();
  const { resetTrigger, triggerSync } = useTradingMode();
  const [syncing, setSyncing] = useState(false);

  // Listen to reset trigger
  useEffect(() => {
    if (resetTrigger > 0) {
      refetch();
    }
  }, [resetTrigger, refetch]);

  const handleSync = async () => {
    setSyncing(true);
    await triggerSync();
    await refetch();
    setSyncing(false);
  };

  // Format relative time
  const getRelativeTime = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="card-terminal p-3 h-full flex flex-col">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-32 mb-2" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    );
  }

  const isPositive = portfolio.changePercent >= 0;

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      {/* Header with sync button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs text-muted-foreground">
            {tradingMode === 'demo' ? 'Demo Portfolio' : 'Portfolio Value'}
          </h3>
          <Badge 
            variant={tradingMode === 'demo' ? 'secondary' : 'destructive'} 
            className="text-[8px] h-4 px-1"
          >
            {tradingMode === 'demo' ? 'DEMO' : 'LIVE'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <div className={`flex items-center gap-0.5 text-xs ${isPositive ? 'text-primary' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}{portfolio.changePercent.toFixed(2)}%
          </div>
          {tradingMode === 'live' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSync}
                    disabled={syncing}
                    className="h-5 w-5 p-0 ml-1"
                  >
                    <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Sync: {getRelativeTime(lastSyncTime)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      {/* Total Portfolio Value */}
      <div className="mb-2">
        <span className="text-2xl font-bold text-foreground font-mono">
          ${portfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <p className={`text-xs mt-0.5 ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {isPositive ? '+' : ''}${portfolio.change24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (24h)
        </p>
      </div>

      {/* Available USDT for Trading - NEW */}
      <div className="bg-secondary/30 rounded-md px-2 py-1.5 mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-muted-foreground">Available for Trading</span>
        </div>
        <span className="text-sm font-bold font-mono text-primary">
          ${portfolio.availableUSDT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Holdings List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-1.5 pr-2">
          {portfolio.holdings.length > 0 ? (
            portfolio.holdings.map((holding) => (
              <div key={holding.symbol} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{holding.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-mono">
                    ${holding.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-primary text-[11px]">{holding.percent}%</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No holdings yet</p>
          )}
        </div>
      </ScrollArea>

      {/* Last sync timestamp */}
      {tradingMode === 'live' && lastSyncTime && (
        <div className="mt-2 pt-2 border-t border-border/50">
          <p className="text-[9px] text-muted-foreground text-center">
            Last synced: {getRelativeTime(lastSyncTime)}
          </p>
        </div>
      )}
    </div>
  );
}