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
    <div className={cn('space-y-1.5', className)}>
      {/* Header with current rate and zone badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3.5 h-3.5', zoneInfo.color)} />
          <span className="text-[10px] font-medium text-muted-foreground">Hit Rate</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[8px] font-bold h-4',
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
        {/* Current hit rate - compact display */}
        <div className="flex items-baseline gap-1 mb-1">
          <span className={cn('text-2xl font-bold font-mono', zoneInfo.color)}>
            {currentHitRate.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
          <span className="text-[10px] text-muted-foreground ml-1">
            ({tradesCount})
          </span>
        </div>

        {/* Visual gauge bar - thinner */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
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

        {/* Scale markers - compact */}
        <div className="flex justify-between mt-0.5 text-[8px] text-muted-foreground font-mono">
          <span>50</span>
          <span>70</span>
          <span>90</span>
          <span className="text-primary font-bold">95</span>
          <span>100</span>
        </div>
      </div>

      {/* Stats row - more compact */}
      <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border/50">
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground">Current</p>
          <p className={cn('text-[11px] font-bold font-mono', zoneInfo.color)}>
            {currentHitRate.toFixed(1)}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground">Target</p>
          <p className="text-[11px] font-bold font-mono text-primary">
            {targetHitRate}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-[8px] text-muted-foreground">Required</p>
          <p className={cn(
            'text-[11px] font-bold font-mono',
            requiredHitRate && requiredHitRate > currentHitRate ? 'text-warning' : 'text-muted-foreground'
          )}>
            {requiredHitRate ? `${requiredHitRate.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      {/* AI Status message - only show when critical */}
      {currentHitRate < 90 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-2.5 h-2.5 text-destructive flex-shrink-0" />
          <span className="text-[9px] text-destructive">AI adjusting thresholds</span>
        </div>
      )}
    </div>
  );
}
