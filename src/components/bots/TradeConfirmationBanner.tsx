import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Clock, Target, DollarSign, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ActiveTradeInfo {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetTPPrice: number;
  positionSize: number;
  targetProfit: number;
  openedAt: Date;
  exchange?: string;
}

interface TradeConfirmationBannerProps {
  trade: ActiveTradeInfo | null;
  currentPrice: number;
  onDismiss?: () => void;
  onTradeClose?: (profit: number) => void;
}

export function TradeConfirmationBanner({
  trade,
  currentPrice,
  onDismiss,
  onTradeClose,
}: TradeConfirmationBannerProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [maxProfit, setMaxProfit] = useState(0);
  const [prevPrice, setPrevPrice] = useState(currentPrice);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Detect price changes for flash animation
  useEffect(() => {
    if (currentPrice !== prevPrice) {
      setPriceFlash(currentPrice > prevPrice ? 'up' : 'down');
      setPrevPrice(currentPrice);
      const timeout = setTimeout(() => setPriceFlash(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [currentPrice, prevPrice]);

  // Calculate real-time P&L
  const calculatePnL = () => {
    if (!trade) return { dollars: 0, percent: 0 };
    
    const priceDiff = trade.direction === 'long' 
      ? currentPrice - trade.entryPrice
      : trade.entryPrice - currentPrice;
    
    const percentChange = (priceDiff / trade.entryPrice) * 100;
    const dollarPnL = trade.positionSize * (percentChange / 100);
    
    // Subtract estimated fees (0.2% round-trip)
    const fees = trade.positionSize * 0.002;
    const netPnL = dollarPnL - fees;
    
    return { dollars: netPnL, percent: percentChange };
  };

  const pnl = calculatePnL();
  
  // Calculate progress toward target
  const progressPercent = trade 
    ? Math.min(100, Math.max(0, (pnl.dollars / trade.targetProfit) * 100))
    : 0;

  // Track max profit for display
  useEffect(() => {
    if (pnl.dollars > maxProfit) {
      setMaxProfit(pnl.dollars);
    }
  }, [pnl.dollars, maxProfit]);

  // Update elapsed time
  useEffect(() => {
    if (!trade) {
      setElapsedTime(0);
      setMaxProfit(0);
      return;
    }

    const updateTime = () => {
      const elapsed = Date.now() - trade.openedAt.getTime();
      setElapsedTime(elapsed);
    };

    updateTime();
    intervalRef.current = setInterval(updateTime, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [trade]);

  // Check if trade hit target
  useEffect(() => {
    if (trade && pnl.dollars >= trade.targetProfit) {
      onTradeClose?.(pnl.dollars);
    }
  }, [trade, pnl.dollars, onTradeClose]);

  if (!trade) return null;

  const formatElapsedTime = () => {
    const seconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const targetPricePercent = ((trade.targetTPPrice - trade.entryPrice) / trade.entryPrice) * 100;

  return (
    <Card className={cn(
      "border-2 transition-all duration-300 font-mono",
      pnl.dollars >= 0 
        ? "border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/10" 
        : "border-amber-500/50 bg-amber-500/5"
    )}>
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              pnl.dollars >= 0 ? "bg-emerald-500" : "bg-amber-500"
            )} />
            <span className="text-xs font-semibold text-foreground">LIVE</span>
            <Badge variant="outline" className={cn(
              "text-[10px]",
              trade.direction === 'long' 
                ? "text-emerald-400 border-emerald-500/50" 
                : "text-red-400 border-red-500/50"
            )}>
              {trade.direction === 'long' ? (
                <><TrendingUp className="h-2.5 w-2.5 mr-0.5" />LONG</>
              ) : (
                <><TrendingDown className="h-2.5 w-2.5 mr-0.5" />SHORT</>
              )}
            </Badge>
            <span className="text-sm font-bold">{trade.pair}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {formatElapsedTime()}
            {onDismiss && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDismiss}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Price Grid - Compact */}
        <div className="grid grid-cols-4 gap-2 mb-2 text-[10px]">
          <div className="bg-background/50 rounded p-1.5 border border-border">
            <div className="text-muted-foreground">Entry</div>
            <div className="font-mono font-medium">${formatPrice(trade.entryPrice)}</div>
          </div>
          <div className={cn(
            "bg-background/50 rounded p-1.5 border transition-colors",
            priceFlash === 'up' ? "border-emerald-500 bg-emerald-500/10" :
            priceFlash === 'down' ? "border-red-500 bg-red-500/10" : "border-border"
          )}>
            <div className="text-muted-foreground">Current</div>
            <div className={cn(
              "font-mono font-medium transition-colors",
              pnl.dollars >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              ${formatPrice(currentPrice)}
            </div>
          </div>
          <div className="bg-background/50 rounded p-1.5 border border-emerald-500/30">
            <div className="text-emerald-400 flex items-center gap-0.5">
              <Target className="h-2 w-2" />TP
            </div>
            <div className="font-mono font-medium text-emerald-400">
              ${formatPrice(trade.targetTPPrice)}
            </div>
          </div>
          <div className="bg-background/50 rounded p-1.5 border border-border">
            <div className="text-muted-foreground">P&L</div>
            <div className={cn(
              "font-mono font-bold",
              pnl.dollars >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {pnl.dollars >= 0 ? '+' : ''}${pnl.dollars.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <Progress 
            value={progressPercent} 
            className={cn(
              "h-2",
              progressPercent >= 100 ? "bg-emerald-900" : "bg-muted"
            )}
          />
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              {progressPercent.toFixed(0)}% → ${trade.targetProfit.toFixed(2)}
            </span>
            {progressPercent >= 100 && (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Target!
              </span>
            )}
            {maxProfit > 0 && progressPercent < 100 && (
              <span className="text-muted-foreground">
                Peak: +${maxProfit.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
