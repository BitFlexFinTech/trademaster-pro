import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Target, TrendingUp, AlertTriangle, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HitRateGaugeProps {
  currentHitRate: number;
  targetHitRate?: number;
  requiredHitRate?: number;
  tradesCount: number;
  className?: string;
}

export function HitRateGauge({
  currentHitRate,
  targetHitRate = 95,
  requiredHitRate,
  tradesCount,
  className,
}: HitRateGaugeProps) {
  // Determine zone color based on hit rate
  const zoneInfo = useMemo(() => {
    if (currentHitRate >= 98) {
      return { zone: 'elite', color: 'text-yellow-400', bgColor: 'bg-yellow-400', label: 'ELITE', icon: Trophy };
    }
    if (currentHitRate >= 95) {
      return { zone: 'target', color: 'text-primary', bgColor: 'bg-primary', label: 'ON TARGET', icon: Target };
    }
    if (currentHitRate >= 90) {
      return { zone: 'warning', color: 'text-yellow-500', bgColor: 'bg-yellow-500', label: 'WARNING', icon: TrendingUp };
    }
    return { zone: 'critical', color: 'text-destructive', bgColor: 'bg-destructive', label: 'CRITICAL', icon: AlertTriangle };
  }, [currentHitRate]);

  const Icon = zoneInfo.icon;

  // Calculate gauge fill percentage (scale 50-100 to 0-100 for visual)
  const gaugePercent = useMemo(() => {
    const minDisplay = 50;
    const maxDisplay = 100;
    const normalized = ((currentHitRate - minDisplay) / (maxDisplay - minDisplay)) * 100;
    return Math.max(0, Math.min(100, normalized));
  }, [currentHitRate]);

  // Required hit rate position on gauge
  const requiredPosition = useMemo(() => {
    if (!requiredHitRate) return null;
    const minDisplay = 50;
    const maxDisplay = 100;
    const normalized = ((requiredHitRate - minDisplay) / (maxDisplay - minDisplay)) * 100;
    return Math.max(0, Math.min(100, normalized));
  }, [requiredHitRate]);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header with current rate and zone badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', zoneInfo.color)} />
          <span className="text-xs font-medium text-muted-foreground">Hit Rate</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[9px] font-bold',
            zoneInfo.zone === 'elite' && 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
            zoneInfo.zone === 'target' && 'border-primary text-primary bg-primary/10',
            zoneInfo.zone === 'warning' && 'border-yellow-500 text-yellow-500 bg-yellow-500/10',
            zoneInfo.zone === 'critical' && 'border-destructive text-destructive bg-destructive/10'
          )}
        >
          {zoneInfo.label}
        </Badge>
      </div>

      {/* Main gauge display */}
      <div className="relative">
        {/* Current hit rate - large display */}
        <div className="flex items-baseline gap-1 mb-2">
          <span className={cn('text-3xl font-bold font-mono', zoneInfo.color)}>
            {currentHitRate.toFixed(1)}
          </span>
          <span className="text-lg text-muted-foreground">%</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({tradesCount} trades)
          </span>
        </div>

        {/* Visual gauge bar */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
                {/* Zone colors background */}
                <div className="absolute inset-0 flex">
                  <div className="w-[40%] bg-destructive/30" /> {/* 50-70% = critical */}
                  <div className="w-[20%] bg-yellow-500/30" /> {/* 70-80% = warning */}
                  <div className="w-[10%] bg-yellow-500/20" /> {/* 80-90% = warning */}
                  <div className="w-[10%] bg-primary/30" /> {/* 90-95% = approaching */}
                  <div className="w-[6%] bg-primary/40" /> {/* 95-98% = target */}
                  <div className="w-[4%] bg-yellow-400/40" /> {/* 98-100% = elite */}
                </div>

                {/* Current fill */}
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                    zoneInfo.bgColor
                  )}
                  style={{ width: `${gaugePercent}%` }}
                />

                {/* Required hit rate marker */}
                {requiredPosition !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-foreground/80"
                    style={{ left: `${requiredPosition}%` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-foreground/80" />
                  </div>
                )}

                {/* Target marker (95%) */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-primary/60"
                  style={{ left: '90%' }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <p>Rolling {tradesCount} trade hit rate</p>
              <p className="text-muted-foreground">Target: {targetHitRate}%</p>
              {requiredHitRate && (
                <p className="text-muted-foreground">Required: {requiredHitRate.toFixed(1)}%</p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Scale markers */}
        <div className="flex justify-between mt-1 text-[9px] text-muted-foreground font-mono">
          <span>50%</span>
          <span>70%</span>
          <span>90%</span>
          <span className="text-primary font-bold">95%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">Current</p>
          <p className={cn('text-xs font-bold font-mono', zoneInfo.color)}>
            {currentHitRate.toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">Target</p>
          <p className="text-xs font-bold font-mono text-primary">
            {targetHitRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground">Required</p>
          <p className={cn(
            'text-xs font-bold font-mono',
            requiredHitRate && requiredHitRate > currentHitRate ? 'text-warning' : 'text-muted-foreground'
          )}>
            {requiredHitRate ? `${requiredHitRate.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      {/* AI Status message */}
      {currentHitRate < 90 && (
        <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-3 h-3 text-destructive" />
          <span className="text-[10px] text-destructive">AI auto-adjusting signal thresholds</span>
        </div>
      )}
      {currentHitRate >= 90 && currentHitRate < 95 && (
        <div className="flex items-center gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
          <TrendingUp className="w-3 h-3 text-yellow-500" />
          <span className="text-[10px] text-yellow-500">Minor adjustments in progress</span>
        </div>
      )}
      {currentHitRate >= 95 && currentHitRate < 98 && (
        <div className="flex items-center gap-2 p-2 rounded bg-primary/10 border border-primary/20">
          <Target className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-primary">Maintaining optimal strategy</span>
        </div>
      )}
      {currentHitRate >= 98 && (
        <div className="flex items-center gap-2 p-2 rounded bg-yellow-400/10 border border-yellow-400/20">
          <Trophy className="w-3 h-3 text-yellow-400" />
          <span className="text-[10px] text-yellow-400">Elite performance - can increase frequency</span>
        </div>
      )}
    </div>
  );
}
