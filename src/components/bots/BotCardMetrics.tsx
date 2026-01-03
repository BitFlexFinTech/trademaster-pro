// ============================================
// BotCardMetrics - PnL, Hit Rate, Trades Count
// Presentation-only component
// ============================================

import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotCardMetricsProps {
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  dailyTarget: number;
}

export function BotCardMetrics({ 
  currentPnL, 
  tradesExecuted, 
  hitRate, 
  dailyTarget 
}: BotCardMetricsProps) {
  const isProfit = currentPnL >= 0;
  const progressPercent = dailyTarget > 0 ? Math.min((currentPnL / dailyTarget) * 100, 100) : 0;
  
  return (
    <div className="space-y-3">
      {/* Main PnL Display */}
      <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          {isProfit ? (
            <TrendingUp className="w-4 h-4 text-green-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-destructive" />
          )}
          <span className="text-xs text-muted-foreground">Session P&L</span>
        </div>
        <span className={cn(
          "text-lg font-bold font-mono",
          isProfit ? 'text-green-500' : 'text-destructive'
        )}>
          {isProfit ? '+' : ''}{currentPnL.toFixed(2)}
          <span className="text-xs text-muted-foreground ml-0.5">USDT</span>
        </span>
      </div>

      {/* Progress to Daily Target */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3" />
            Daily Target
          </span>
          <span className="font-mono">
            ${currentPnL.toFixed(2)} / ${dailyTarget.toFixed(2)}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-500",
              progressPercent >= 100 ? 'bg-green-500' : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="text-[10px] text-right text-muted-foreground">
          {progressPercent.toFixed(0)}% complete
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 bg-muted/20 rounded-lg text-center">
          <Activity className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
          <div className="text-lg font-bold font-mono">{tradesExecuted}</div>
          <div className="text-[10px] text-muted-foreground">Trades</div>
        </div>
        <div className="p-2 bg-muted/20 rounded-lg text-center">
          <Target className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
          <div className={cn(
            "text-lg font-bold font-mono",
            hitRate >= 50 ? 'text-green-500' : 'text-amber-500'
          )}>
            {hitRate.toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">Hit Rate</div>
        </div>
      </div>
    </div>
  );
}
