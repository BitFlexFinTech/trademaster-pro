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

  // Fixed card dimensions from CARD_SIZES
  const cardStyle = { width: '200px', height: '120px', minWidth: '180px' };

  return (
    <div 
      className="flex flex-col justify-between px-3 py-2 rounded-lg border bg-card/50"
      style={cardStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-muted-foreground">Session</span>
        <Badge 
          variant={metrics.canTrade ? "default" : "destructive"} 
          className="text-[8px] h-4 px-1.5"
        >
          {metrics.canTrade ? 'OK' : 'HALT'}
        </Badge>
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-around flex-1">
        {/* Wins */}
        <div className={cn(
          "flex flex-col items-center gap-0.5 p-1.5 rounded",
          metrics.consecutiveWins > 0 ? "bg-green-500/10" : "bg-muted/30"
        )}>
          <Trophy className={cn(
            "h-3 w-3",
            metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
          )} />
          <span className={cn(
            "text-sm font-bold font-mono",
            metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
          )}>
            {metrics.consecutiveWins}
          </span>
          <span className="text-[8px] text-muted-foreground">Wins</span>
        </div>

        {/* Losses */}
        <div className={cn(
          "flex flex-col items-center gap-0.5 p-1.5 rounded",
          metrics.consecutiveLosses >= 3 ? "bg-red-500/20 animate-pulse" : 
          metrics.consecutiveLosses > 0 ? "bg-red-500/10" : "bg-muted/30"
        )}>
          <XCircle className={cn(
            "h-3 w-3",
            metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
          )} />
          <span className={cn(
            "text-sm font-bold font-mono",
            metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
          )}>
            {metrics.consecutiveLosses}
          </span>
          <span className="text-[8px] text-muted-foreground">Losses</span>
        </div>

        {/* Win Rate */}
        <div className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-muted/30">
          <CheckCircle className={cn("h-3 w-3", winRateColor)} />
          <span className={cn("text-sm font-bold font-mono", winRateColor)}>
            {metrics.winRateLast20.toFixed(0)}%
          </span>
          <span className="text-[8px] text-muted-foreground">Rate</span>
        </div>
      </div>

      {/* Cooldown Timer */}
      {metrics.cooloffRemainingMs > 0 && (
        <div className="flex items-center justify-center gap-1 mt-2 text-yellow-500 text-[10px] bg-yellow-500/10 rounded py-0.5">
          <Clock className="h-3 w-3" />
          <span className="font-mono">{formatCountdown(metrics.cooloffRemainingMs)}</span>
        </div>
      )}
    </div>
  );
}
