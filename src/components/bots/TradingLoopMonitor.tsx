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
      'rounded-md border bg-card overflow-hidden',
      className
    )}>
      {/* Compact Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <RefreshCw className={cn(
            'h-3 w-3',
            botRunning && loopState !== 'idle' && 'animate-spin text-primary'
          )} />
          <span className="text-[10px] font-medium">Loop</span>
          <Badge 
            variant="outline" 
            className={cn('text-[8px] h-3.5 px-1 gap-0.5', config.color)}
          >
            <Icon className="h-2 w-2" />
            {config.label}
          </Badge>
        </div>
        
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-muted-foreground">AUTO</span>
          <Switch
            checked={autoTriggerEnabled}
            onCheckedChange={toggleAutoTrigger}
            className="h-3 w-6"
            disabled={!botRunning}
          />
          {nextScanIn > 0 && (
            <Badge variant="secondary" className="text-[8px] h-3.5 px-1 font-mono">
              {nextScanIn}s
            </Badge>
          )}
        </div>
      </div>
      
      {/* Compact Content */}
      <div className="p-2 space-y-1.5">
        {/* Status Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              loopState === 'idle' ? 'bg-muted-foreground' :
              loopState === 'scanning' ? 'bg-blue-500 animate-pulse' :
              loopState === 'executing' ? 'bg-yellow-500 animate-pulse' :
              loopState === 'monitoring' ? 'bg-green-500' :
              'bg-cyan-500'
            )} />
            <span className="text-[9px] text-muted-foreground truncate max-w-[100px]">{idleReason}</span>
          </div>
          
          {/* Position Slots - Compact */}
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {Array.from({ length: maxPositions }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-1.5 h-1.5 rounded-sm',
                    i < openPositionsCount ? 'bg-green-500' : 'bg-muted'
                  )}
                />
              ))}
            </div>
            <span className="text-[9px] font-mono text-muted-foreground">{openPositionsCount}/{maxPositions}</span>
          </div>
        </div>

        {/* Progress Bar - Pairs Scanned */}
        {loopState === 'scanning' && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[8px]">
              <span className="text-muted-foreground">Scanning</span>
              <span className="font-mono">{pairsScanned}/{totalPairs}</span>
            </div>
            <Progress value={scanProgress} className="h-0.5" />
          </div>
        )}

        {/* Best Opportunity - Compact */}
        {bestOpportunity && (
          <div className="flex items-center justify-between p-1 rounded bg-muted/50 text-[9px]">
            <div className="flex items-center gap-1">
              <Zap className="h-2.5 w-2.5 text-yellow-500" />
              <span>{bestOpportunity.pair}</span>
            </div>
            <span className="font-mono text-muted-foreground">{bestOpportunity.volatility.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
