import { useState, useEffect, useMemo } from 'react';
import { Timer, TrendingUp, TrendingDown, Target, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export interface HoldingTradeInfo {
  tradeId: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetProfitUsd: number;
  positionSize: number;
  openedAt: number;
}

interface HoldingForProfitBannerProps {
  trade: HoldingTradeInfo;
  currentPrice: number | null;
  isLoading?: boolean;
}

export function HoldingForProfitBanner({
  trade,
  currentPrice,
  isLoading = false,
}: HoldingForProfitBannerProps) {
  const [, forceUpdate] = useState(0);

  // Update hold time display every second
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate current P&L based on direction
  const currentPnL = useMemo(() => {
    if (!currentPrice || !trade.entryPrice) return 0;

    const { entryPrice, positionSize, direction } = trade;
    const priceChange =
      direction === 'long'
        ? currentPrice - entryPrice
        : entryPrice - currentPrice;

    return priceChange * (positionSize / entryPrice);
  }, [trade, currentPrice]);

  // Calculate progress toward target (capped at 100%)
  const progressPercent = useMemo(() => {
    const progress = (currentPnL / trade.targetProfitUsd) * 100;
    return Math.max(0, Math.min(100, progress));
  }, [currentPnL, trade.targetProfitUsd]);

  // Price change percentage
  const priceChangePercent = useMemo(() => {
    if (!currentPrice || !trade.entryPrice) return 0;
    return ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
  }, [currentPrice, trade.entryPrice]);

  const isProfitable = currentPnL > 0;
  const holdTime = formatDistanceToNow(trade.openedAt, { includeSeconds: true });

  return (
    <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-r from-amber-500/20 via-amber-500/30 to-amber-500/20 border-b border-amber-500/50 px-4 py-3 backdrop-blur-sm">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-sm font-semibold text-amber-200">
            Holding for ${trade.targetProfitUsd.toFixed(2)} Profit
          </span>
          <Badge variant="outline" className="text-xs border-amber-500/50">
            {trade.pair}
          </Badge>
          <Badge
            variant={trade.direction === 'long' ? 'default' : 'destructive'}
            className="text-xs"
          >
            {trade.direction === 'long' ? (
              <TrendingUp className="w-3 h-3 mr-1" />
            ) : (
              <TrendingDown className="w-3 h-3 mr-1" />
            )}
            {trade.direction.toUpperCase()}
          </Badge>
        </div>

        {/* Price and P&L info */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Entry: ${trade.entryPrice.toFixed(2)}
          </span>
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : currentPrice ? (
            <>
              <span className="text-muted-foreground">
                Now: ${currentPrice.toFixed(2)}
              </span>
              <span
                className={cn(
                  'font-semibold',
                  priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
                )}
              >
                {priceChangePercent >= 0 ? '+' : ''}
                {priceChangePercent.toFixed(3)}%
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Loading...</span>
          )}
          <span
            className={cn(
              'font-bold text-base',
              isProfitable ? 'text-green-400' : 'text-red-400'
            )}
          >
            {currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}
          </span>
          <span className="text-amber-400 flex items-center gap-1">
            <Target className="w-3 h-3" />
            Target: +${trade.targetProfitUsd.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 flex items-center gap-2">
        <Progress
          value={progressPercent}
          className={cn(
            'h-2 flex-1',
            isProfitable ? 'bg-green-900/30' : 'bg-amber-900/30'
          )}
        />
        <span
          className={cn(
            'text-xs font-medium min-w-[45px] text-right',
            progressPercent >= 100
              ? 'text-green-400'
              : progressPercent >= 50
              ? 'text-amber-300'
              : 'text-amber-400'
          )}
        >
          {progressPercent.toFixed(0)}%
        </span>
      </div>

      {/* Hold time */}
      <div className="mt-1 text-xs text-muted-foreground">
        Holding for {holdTime}
      </div>
    </div>
  );
}
