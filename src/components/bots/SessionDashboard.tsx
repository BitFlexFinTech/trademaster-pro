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
    <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-card/50">
      {/* Session Status */}
      <div className="flex items-center gap-1">
        {metrics.canTrade ? (
          <CheckCircle className="h-3 w-3 text-green-500" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        )}
        <Badge 
          variant={metrics.canTrade ? "default" : "destructive"} 
          className="text-[8px] h-3.5 px-1"
        >
          {metrics.canTrade ? 'OK' : 'HALT'}
        </Badge>
      </div>

      {/* Wins */}
      <div className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px]",
        metrics.consecutiveWins > 0 ? "bg-green-500/10 text-green-500" : "text-muted-foreground"
      )}>
        <Trophy className="h-2.5 w-2.5" />
        <span className="font-bold">{metrics.consecutiveWins}</span>
      </div>

      {/* Losses */}
      <div className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px]",
        metrics.consecutiveLosses >= 3 ? "bg-red-500/20 animate-pulse text-red-500" : 
        metrics.consecutiveLosses > 0 ? "bg-red-500/10 text-red-500" : "text-muted-foreground"
      )}>
        <XCircle className="h-2.5 w-2.5" />
        <span className="font-bold">{metrics.consecutiveLosses}</span>
      </div>

      {/* Win Rate */}
      <span className={cn("text-[10px] font-mono font-medium", winRateColor)}>
        {metrics.winRateLast20.toFixed(0)}%
      </span>

      {/* Cooldown Timer */}
      {metrics.cooloffRemainingMs > 0 && (
        <div className="flex items-center gap-0.5 text-yellow-500 text-[10px]">
          <Clock className="h-2.5 w-2.5" />
          <span className="font-mono">{formatCountdown(metrics.cooloffRemainingMs)}</span>
        </div>
      )}
    </div>
  );
}
