import { memo } from 'react';
import { Play, Square, Loader2, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BotMicroCardProps {
  botType: 'spot' | 'leverage';
  botName: string;
  isRunning: boolean;
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  dailyTarget: number;
  lastTradeTime?: Date;
  isLoading?: boolean;
  onStart: () => void;
  onStop: () => void;
  onClick?: () => void;
}

export const BotMicroCard = memo(function BotMicroCard({
  botType,
  botName,
  isRunning,
  currentPnL,
  tradesExecuted,
  hitRate,
  dailyTarget,
  lastTradeTime,
  isLoading = false,
  onStart,
  onStop,
  onClick,
}: BotMicroCardProps) {
  const isProfit = currentPnL >= 0;
  const progressPercent = Math.min((currentPnL / dailyTarget) * 100, 100);
  const shortName = botType === 'spot' ? 'SPOT' : 'LEV';

  return (
    <div
      className={cn(
        "micro-card flex flex-col justify-between cursor-pointer group",
        isRunning ? "micro-card-running" : "micro-card-stopped"
      )}
      onClick={onClick}
    >
      {/* Top Row: Status, Name, P&L */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Status dot */}
          <div 
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              isRunning ? "bg-primary status-dot-pulse" : "bg-muted-foreground"
            )} 
          />
          
          {/* Bot type badge */}
          <Badge 
            variant="outline" 
            className={cn(
              "text-[9px] px-1.5 py-0 h-4 font-mono shrink-0",
              botType === 'spot' 
                ? "border-accent-spot text-accent-spot" 
                : "border-accent-leverage text-accent-leverage"
            )}
          >
            {shortName}
          </Badge>
          
          {/* Bot name - truncated */}
          <span className="text-xs font-medium text-foreground truncate">
            {botName.replace('GreenBack ', '')}
          </span>
        </div>

        {/* P&L Display - Large and prominent */}
        <div className="flex items-center gap-1 shrink-0">
          {isProfit ? (
            <TrendingUp className="w-3 h-3 text-neon-profit" />
          ) : (
            <TrendingDown className="w-3 h-3 text-destructive" />
          )}
          <span 
            className={cn(
              "text-sm font-mono font-bold tabular-nums",
              isProfit ? "text-neon-profit" : "text-destructive"
            )}
          >
            {isProfit ? '+' : ''}${currentPnL.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Bottom Row: Stats + Actions */}
      <div className="flex items-center justify-between gap-2 mt-1">
        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="font-mono">{tradesExecuted} trades</span>
          <span className="font-mono">{hitRate.toFixed(0)}% HR</span>
          {lastTradeTime && (
            <span className="hidden sm:inline">
              {Math.floor((Date.now() - lastTradeTime.getTime()) / 60000)}m ago
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {isRunning ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onStop();
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Square className="w-3 h-3" />
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="h-5 w-5 p-0 bg-primary hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation();
                onStart();
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </Button>
          )}
          
          {/* Quick action - speed boost indicator when running */}
          {isRunning && (
            <div className="flex items-center gap-0.5 text-[9px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              <Zap className="w-2.5 h-2.5" />
            </div>
          )}
        </div>
      </div>

      {/* Progress bar - subtle at bottom */}
      {isRunning && (
        <div className="mt-1.5 h-0.5 bg-border rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${Math.max(progressPercent, 2)}%` }}
          />
        </div>
      )}
    </div>
  );
});
