import { AlertTriangle, DollarSign, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExchangeBalance {
  exchange: string;
  freeUSDT: number;
  minRequired: number;
  hasCredentials: boolean;
  canTrade: boolean;
}

interface BalanceRequirementBannerProps {
  balances: ExchangeBalance[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function BalanceRequirementBanner({ 
  balances, 
  onRefresh,
  isRefreshing = false 
}: BalanceRequirementBannerProps) {
  const tradableExchanges = balances.filter(b => b.canTrade);
  const insufficientExchanges = balances.filter(b => b.hasCredentials && !b.canTrade);
  const noCredentialsExchanges = balances.filter(b => !b.hasCredentials);
  
  // If at least one exchange can trade, show success state
  if (tradableExchanges.length > 0) {
    return (
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <div>
              <p className="text-xs font-medium text-primary">
                Ready to trade on {tradableExchanges.length} exchange{tradableExchanges.length > 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {tradableExchanges.map(ex => (
                  <Badge key={ex.exchange} variant="outline" className="text-[10px] border-primary/50 text-primary">
                    {ex.exchange}: ${ex.freeUSDT.toFixed(2)} free
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </div>
    );
  }
  
  // No tradable exchanges - show warning with details
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-destructive">
            Insufficient USDT balance for trading
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            The bot requires minimum free USDT to place orders. Current balances:
          </p>
          
          {/* Insufficient balance exchanges */}
          {insufficientExchanges.length > 0 && (
            <div className="mt-2 space-y-1">
              {insufficientExchanges.map(ex => (
                <div key={ex.exchange} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">{ex.exchange}:</span>
                  <span className="text-destructive font-mono">${ex.freeUSDT.toFixed(2)}</span>
                  <span className="text-muted-foreground">/ min ${ex.minRequired}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Suggestion */}
          <p className="text-xs text-muted-foreground mt-2">
            💡 Deposit at least ${Math.max(...insufficientExchanges.map(e => e.minRequired), 5).toFixed(0)} USDT to any connected exchange to start trading.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
        </Button>
      </div>
    </div>
  );
}
