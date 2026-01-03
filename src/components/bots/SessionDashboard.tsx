import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  XCircle, 
  Clock, 
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { profitLockStrategy } from '@/lib/profitLockStrategy';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SessionMetrics {
  consecutiveWins: number;
  consecutiveLosses: number;
  winRateLast20: number;
  totalTradesInWindow: number;
  isSessionHalted: boolean;
  haltReason: string;
  cooloffRemainingMs: number;
  canTrade: boolean;
}

export function SessionDashboard() {
  const [metrics, setMetrics] = useState<SessionMetrics>({
    consecutiveWins: 0,
    consecutiveLosses: 0,
    winRateLast20: 70,
    totalTradesInWindow: 0,
    isSessionHalted: false,
    haltReason: '',
    cooloffRemainingMs: 0,
    canTrade: true,
  });

  // Poll session metrics every second for real-time updates
  useEffect(() => {
    const updateMetrics = () => {
      const stats = profitLockStrategy.getStats();
      const canTradeResult = profitLockStrategy.canTrade();
      
      setMetrics({
        consecutiveWins: stats.consecutiveWins,
        consecutiveLosses: stats.consecutiveLosses,
        winRateLast20: stats.winRate,
        totalTradesInWindow: stats.totalTrades,
        isSessionHalted: stats.isSessionHalted,
        haltReason: stats.haltReason,
        cooloffRemainingMs: Math.max(0, stats.pauseUntil - Date.now()),
        canTrade: canTradeResult.canTrade,
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format countdown timer
  const formatCountdown = useCallback((ms: number): string => {
    if (ms <= 0) return '00:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const winRateColor = metrics.winRateLast20 >= 50 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg border bg-card/50">
      {/* Session Status */}
      <div className="flex items-center gap-1.5">
        {metrics.canTrade ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        )}
        <Badge 
          variant={metrics.canTrade ? "default" : "destructive"} 
          className="text-[9px] h-4 px-1.5"
        >
          {metrics.canTrade ? 'ACTIVE' : 'HALTED'}
        </Badge>
      </div>

      {/* Wins */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded",
            metrics.consecutiveWins > 0 ? "bg-green-500/10" : "bg-muted/30"
          )}>
            <Trophy className={cn(
              "h-3 w-3",
              metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
            )} />
            <span className={cn(
              "text-xs font-bold",
              metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
            )}>
              {metrics.consecutiveWins}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          Consecutive wins streak
        </TooltipContent>
      </Tooltip>

      {/* Losses */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded",
            metrics.consecutiveLosses >= 3 ? "bg-red-500/20 animate-pulse" : 
            metrics.consecutiveLosses > 0 ? "bg-red-500/10" : "bg-muted/30"
          )}>
            <XCircle className={cn(
              "h-3 w-3",
              metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
            )} />
            <span className={cn(
              "text-xs font-bold",
              metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
            )}>
              {metrics.consecutiveLosses}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          Consecutive losses (3 = halt)
        </TooltipContent>
      </Tooltip>

      {/* Win Rate */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <span className={cn("text-xs font-mono font-medium", winRateColor)}>
              {metrics.winRateLast20.toFixed(0)}%
            </span>
            <span className="text-[9px] text-muted-foreground">WR</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          Win rate (last 20 trades) - Min 50%
        </TooltipContent>
      </Tooltip>

      {/* Cooldown Timer */}
      {metrics.cooloffRemainingMs > 0 && (
        <div className="flex items-center gap-1 text-yellow-500">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-mono">
            {formatCountdown(metrics.cooloffRemainingMs)}
          </span>
        </div>
      )}

      {/* Halt Reason (if halted) */}
      {!metrics.canTrade && metrics.haltReason && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[9px] text-red-400 truncate max-w-[100px]">
              {metrics.haltReason}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
            {metrics.haltReason}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
