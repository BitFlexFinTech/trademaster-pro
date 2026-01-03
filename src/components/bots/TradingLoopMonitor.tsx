import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { 
  RefreshCw, 
  Zap, 
  Clock, 
  Target, 
  AlertTriangle, 
  Play, 
  Pause,
  Activity,
  Radio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradingLoopMonitor, LoopState } from '@/hooks/useTradingLoopMonitor';
import { formatDistanceToNow } from 'date-fns';

interface TradingLoopMonitorProps {
  botRunning: boolean;
  tradeIntervalMs: number;
  onTriggerTrade?: () => void;
  className?: string;
}

const stateConfig: Record<LoopState, { label: string; color: string; icon: typeof Activity }> = {
  idle: { label: 'IDLE', color: 'text-muted-foreground', icon: Pause },
  scanning: { label: 'SCANNING', color: 'text-blue-500', icon: Radio },
  analyzing: { label: 'ANALYZING', color: 'text-purple-500', icon: Activity },
  executing: { label: 'EXECUTING', color: 'text-yellow-500', icon: Zap },
  monitoring: { label: 'MONITORING', color: 'text-green-500', icon: Target },
  closing: { label: 'CLOSING', color: 'text-orange-500', icon: Activity },
  cooldown: { label: 'COOLDOWN', color: 'text-cyan-500', icon: Clock },
};

export function TradingLoopMonitor({ 
  botRunning, 
  tradeIntervalMs,
  onTriggerTrade,
  className 
}: TradingLoopMonitorProps) {
  const {
    loopState,
    idleReason,
    nextScanIn,
    lastAction,
    lastActionTime,
    pairsScanned,
    totalPairs,
    bestOpportunity,
    autoTriggerEnabled,
    isAutoTriggering,
    openPositionsCount,
    maxPositions,
    toggleAutoTrigger,
    triggerNextTrade,
  } = useTradingLoopMonitor({
    botRunning,
    tradeIntervalMs,
    onAutoTrigger: onTriggerTrade,
  });

  const config = stateConfig[loopState];
  const Icon = config.icon;
  const scanProgress = (pairsScanned / totalPairs) * 100;
  const positionProgress = (openPositionsCount / maxPositions) * 100;

  return (
    <div className={cn(
      'rounded-lg border bg-card overflow-hidden',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <RefreshCw className={cn(
            'h-3.5 w-3.5',
            botRunning && loopState !== 'idle' && 'animate-spin text-primary'
          )} />
          <span className="text-xs font-medium">Trading Loop</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">AUTO</span>
          <Switch
            checked={autoTriggerEnabled}
            onCheckedChange={toggleAutoTrigger}
            className="h-4 w-7"
            disabled={!botRunning}
          />
          <Badge 
            variant="outline" 
            className={cn('text-[9px] h-4 px-1.5 gap-1', config.color)}
          >
            <Icon className="h-2.5 w-2.5" />
            {config.label}
          </Badge>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="p-3 space-y-2">
        {/* Status + Countdown Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              loopState === 'idle' ? 'bg-muted-foreground' :
              loopState === 'scanning' ? 'bg-blue-500 animate-pulse' :
              loopState === 'executing' ? 'bg-yellow-500 animate-pulse' :
              loopState === 'monitoring' ? 'bg-green-500' :
              'bg-cyan-500'
            )} />
            <span className="text-xs text-muted-foreground">{idleReason}</span>
          </div>
          
          {nextScanIn > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
              <Clock className="h-3 w-3 mr-1" />
              {nextScanIn}s
            </Badge>
          )}
        </div>

        {/* Progress Bar - Pairs Scanned */}
        {loopState === 'scanning' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Pairs Scanned</span>
              <span className="font-mono">{pairsScanned}/{totalPairs}</span>
            </div>
            <Progress value={scanProgress} className="h-1" />
          </div>
        )}

        {/* Position Slots */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Position Slots</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {Array.from({ length: maxPositions }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-2 h-2 rounded-sm',
                    i < openPositionsCount ? 'bg-green-500' : 'bg-muted'
                  )}
                />
              ))}
            </div>
            <span className="text-[10px] font-mono">{openPositionsCount}/{maxPositions}</span>
          </div>
        </div>

        {/* Best Opportunity */}
        {bestOpportunity && (
          <div className="flex items-center justify-between p-1.5 rounded bg-muted/50">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-[10px]">Best: {bestOpportunity.pair}</span>
            </div>
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {bestOpportunity.volatility.toFixed(2)}%
            </Badge>
          </div>
        )}

        {/* Last Action */}
        {lastActionTime && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Last: {lastAction}</span>
            <span className="text-muted-foreground">
              {formatDistanceToNow(lastActionTime, { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Manual Trigger Button */}
        {botRunning && openPositionsCount < maxPositions && nextScanIn === 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[10px]"
            onClick={() => triggerNextTrade()}
            disabled={isAutoTriggering}
          >
            {isAutoTriggering ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1" />
                Trigger Next Trade
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
