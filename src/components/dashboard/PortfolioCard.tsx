import { usePortfolio } from '@/hooks/usePortfolio';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useEffect } from 'react';

export function PortfolioCard() {
  const { portfolio, loading, refetch, tradingMode } = usePortfolio();
  const { resetTrigger } = useTradingMode();

  // Listen to reset trigger
  useEffect(() => {
    if (resetTrigger > 0) {
      refetch();
    }
  }, [resetTrigger, refetch]);

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
        <div className={`flex items-center gap-0.5 text-xs ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? '+' : ''}{portfolio.changePercent.toFixed(2)}%
        </div>
      </div>
      
      <div className="mb-2">
        <span className="text-2xl font-bold text-foreground font-mono">
          ${portfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <p className={`text-xs mt-0.5 ${isPositive ? 'text-primary' : 'text-destructive'}`}>
          {isPositive ? '+' : ''}${portfolio.change24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (24h)
        </p>
      </div>

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
    </div>
  );
}
