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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              pnl.dollars >= 0 ? "bg-emerald-500" : "bg-amber-500"
            )} />
            <span className="text-sm font-semibold text-foreground">TRADE OPENED</span>
            <Badge variant="outline" className={cn(
              "text-xs",
              trade.direction === 'long' 
                ? "text-emerald-400 border-emerald-500/50" 
                : "text-red-400 border-red-500/50"
            )}>
              {trade.direction === 'long' ? (
                <><TrendingUp className="h-3 w-3 mr-1" />LONG</>
              ) : (
                <><TrendingDown className="h-3 w-3 mr-1" />SHORT</>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatElapsedTime()}
            {onDismiss && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDismiss}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Pair and Position */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-foreground">{trade.pair}</span>
            {trade.exchange && (
              <Badge variant="secondary" className="text-xs">{trade.exchange}</Badge>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Position</div>
            <div className="text-sm font-semibold">${trade.positionSize.toFixed(2)}</div>
          </div>
        </div>

        {/* Price Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-background/50 rounded-lg p-2 border border-border">
            <div className="text-[10px] text-muted-foreground mb-1">ENTRY</div>
            <div className="text-sm font-mono font-medium">${formatPrice(trade.entryPrice)}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-border">
            <div className="text-[10px] text-muted-foreground mb-1">CURRENT</div>
            <div className={cn(
              "text-sm font-mono font-medium",
              pnl.dollars >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              ${formatPrice(currentPrice)}
            </div>
          </div>
          <div className="bg-background/50 rounded-lg p-2 border border-emerald-500/30">
            <div className="text-[10px] text-emerald-400 mb-1 flex items-center gap-1">
              <Target className="h-2 w-2" />TARGET TP
            </div>
            <div className="text-sm font-mono font-medium text-emerald-400">
              ${formatPrice(trade.targetTPPrice)}
            </div>
            <div className="text-[9px] text-muted-foreground">+{targetPricePercent.toFixed(2)}%</div>
          </div>
        </div>

        {/* P&L Display */}
        <div className="bg-background/80 rounded-lg p-3 border border-border mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className={cn(
                "h-4 w-4",
                pnl.dollars >= 0 ? "text-emerald-400" : "text-red-400"
              )} />
              <span className="text-sm text-muted-foreground">Current P&L</span>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-lg font-bold font-mono",
                pnl.dollars >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {pnl.dollars >= 0 ? '+' : ''}${pnl.dollars.toFixed(2)}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                / ${trade.targetProfit.toFixed(2)}
              </span>
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
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {progressPercent.toFixed(0)}% to target
              </span>
              {progressPercent >= 100 && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Target reached!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Max Profit Tracker */}
        {maxProfit > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            Peak: +${maxProfit.toFixed(2)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
