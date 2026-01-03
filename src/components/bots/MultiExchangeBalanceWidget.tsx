import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ExchangeBalance {
  exchange: string;
  amount: number;
  color: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  binance: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  okx: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  bybit: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  kraken: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  default: 'bg-muted text-muted-foreground border-border',
};

export function MultiExchangeBalanceWidget() {
  const { user } = useAuth();
  const { 
    mode: tradingMode, 
    virtualBalance, 
    exchangeBalances, 
    fetchExchangeBalances 
  } = useTradingMode();
  const { connectedExchangeNames } = useConnectedExchanges();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Calculate total portfolio value
  const totalValue = tradingMode === 'demo' 
    ? virtualBalance 
    : exchangeBalances.reduce((sum, b) => sum + (b.totalValue || b.usdtBalance || 0), 0);

  // Format exchange balances for display
  const formattedBalances: ExchangeBalance[] = tradingMode === 'demo'
    ? connectedExchangeNames.slice(0, 3).map((name, i) => ({
        exchange: name,
        amount: Math.round(virtualBalance / 3),
        color: EXCHANGE_COLORS[name.toLowerCase()] || EXCHANGE_COLORS.default,
      }))
    : exchangeBalances.map(b => ({
        exchange: b.exchange,
        amount: b.totalValue || b.usdtBalance || 0,
        color: EXCHANGE_COLORS[b.exchange.toLowerCase()] || EXCHANGE_COLORS.default,
      }));

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchExchangeBalances();
      toast.success('Portfolio refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchExchangeBalances]);

  const getExchangeAbbrev = (name: string) => name.slice(0, 3).toUpperCase();

  return (
    <div className="rounded-lg border bg-card/50 px-3 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-medium text-muted-foreground uppercase">
            {tradingMode === 'demo' ? 'Virtual' : 'Portfolio'}
          </span>
          <span className="text-sm font-mono font-bold text-primary">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Exchange badges - inline */}
          {formattedBalances.slice(0, 3).map((b) => (
            <Badge 
              key={b.exchange} 
              variant="outline" 
              className={cn("text-[8px] px-1 py-0 h-4 font-mono", b.color)}
            >
              {getExchangeAbbrev(b.exchange)} ${b.amount >= 1000 ? `${(b.amount/1000).toFixed(1)}K` : b.amount.toFixed(0)}
            </Badge>
          ))}

          {formattedBalances.length > 3 && (
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          )}

          {tradingMode === 'live' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded view for more exchanges */}
      {isOpen && formattedBalances.length > 3 && (
        <div className="mt-2 pt-2 border-t flex flex-wrap gap-1">
          {formattedBalances.slice(3).map((b) => (
            <Badge 
              key={b.exchange} 
              variant="outline" 
              className={cn("text-[8px] px-1 py-0 h-4 font-mono", b.color)}
            >
              {getExchangeAbbrev(b.exchange)} ${b.amount >= 1000 ? `${(b.amount/1000).toFixed(1)}K` : b.amount.toFixed(0)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
