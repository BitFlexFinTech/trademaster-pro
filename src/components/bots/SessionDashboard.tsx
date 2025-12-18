import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Pause,
  TrendingUp,
  TrendingDown 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { profitLockStrategy } from '@/lib/profitLockStrategy';

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

  // Poll session metrics every second
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
  const winRateBgColor = metrics.winRateLast20 >= 50 ? 'bg-green-500' : 'bg-red-500';

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Session Controls
          <Badge 
            variant={metrics.canTrade ? "default" : "destructive"} 
            className="ml-auto text-[10px] px-1.5 py-0"
          >
            {metrics.canTrade ? 'ACTIVE' : 'HALTED'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-3">
        {/* Consecutive Streak Display */}
        <div className="grid grid-cols-2 gap-2">
          {/* Wins Streak */}
          <div className={cn(
            "flex items-center gap-2 p-2 rounded",
            metrics.consecutiveWins > 0 ? "bg-green-500/10" : "bg-muted/30"
          )}>
            <Trophy className={cn(
              "h-4 w-4",
              metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
            )} />
            <div>
              <div className="text-[10px] text-muted-foreground">Wins Streak</div>
              <div className={cn(
                "text-lg font-bold",
                metrics.consecutiveWins > 0 ? "text-green-500" : "text-muted-foreground"
              )}>
                {metrics.consecutiveWins}
              </div>
            </div>
          </div>
          
          {/* Losses Streak */}
          <div className={cn(
            "flex items-center gap-2 p-2 rounded",
            metrics.consecutiveLosses >= 3 ? "bg-red-500/20 animate-pulse" : 
            metrics.consecutiveLosses > 0 ? "bg-red-500/10" : "bg-muted/30"
          )}>
            <XCircle className={cn(
              "h-4 w-4",
              metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
            )} />
            <div>
              <div className="text-[10px] text-muted-foreground">Losses Streak</div>
              <div className={cn(
                "text-lg font-bold",
                metrics.consecutiveLosses >= 3 ? "text-red-500 animate-pulse" :
                metrics.consecutiveLosses > 0 ? "text-red-500" : "text-muted-foreground"
              )}>
                {metrics.consecutiveLosses}
                {metrics.consecutiveLosses >= 3 && <span className="text-xs ml-1">⚠️</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Win Rate (20 trades)</span>
            <span className={cn("font-mono font-medium", winRateColor)}>
              {metrics.winRateLast20.toFixed(1)}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className={cn("h-full transition-all", winRateBgColor)}
              style={{ width: `${Math.min(100, metrics.winRateLast20)}%` }}
            />
            {/* 50% threshold marker */}
            <div className="absolute top-0 left-1/2 h-full w-0.5 bg-white/30" />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Min: 50%</span>
            <span>{metrics.totalTradesInWindow}/20 trades</span>
          </div>
        </div>

        {/* Session Status */}
        {metrics.isSessionHalted ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-2 space-y-2">
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">SESSION HALTED</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {metrics.haltReason}
            </div>
            {metrics.cooloffRemainingMs > 0 && (
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-mono">
                  Cooloff: {formatCountdown(metrics.cooloffRemainingMs)}
                </span>
              </div>
            )}
          </div>
        ) : metrics.cooloffRemainingMs > 0 ? (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
            <div className="flex items-center gap-2 text-yellow-500">
              <Pause className="h-4 w-4" />
              <span className="text-xs font-medium">COOLING OFF</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-mono">
                {formatCountdown(metrics.cooloffRemainingMs)}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
            <div className="flex items-center gap-2 text-green-500">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">TRADING ACTIVE</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              All session controls passed
            </div>
          </div>
        )}

        {/* Halt Rules Summary */}
        <div className="text-[10px] text-muted-foreground space-y-0.5">
          <div className="flex items-center gap-1">
            <span className={metrics.consecutiveLosses < 3 ? "text-green-500" : "text-red-500"}>●</span>
            3 consecutive losses = halt
          </div>
          <div className="flex items-center gap-1">
            <span className={metrics.winRateLast20 >= 50 ? "text-green-500" : "text-red-500"}>●</span>
            &lt;50% win rate (20 trades) = halt
          </div>
          <div className="flex items-center gap-1">
            <span className="text-blue-500">●</span>
            5 min cooloff after halt
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
