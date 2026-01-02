import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MTFAnalysis, MTFSignal } from '@/hooks/useMultiTimeframeSignals';

interface MTFAlignmentIndicatorProps {
  analysis: MTFAnalysis | null;
  positionDirection?: 'long' | 'short';
  compact?: boolean;
}

function getSignalColor(
  signal: MTFSignal, 
  positionDirection?: 'long' | 'short'
): string {
  if (signal.direction === 'neutral') {
    return 'bg-muted-foreground/50';
  }

  // If we have a position, color based on alignment
  if (positionDirection) {
    const isAligned = 
      (positionDirection === 'long' && signal.direction === 'bullish') ||
      (positionDirection === 'short' && signal.direction === 'bearish');
    return isAligned ? 'bg-emerald-500' : 'bg-red-500';
  }

  // No position - show raw direction
  return signal.direction === 'bullish' ? 'bg-emerald-500' : 'bg-red-500';
}

function getDirectionLabel(direction: string): string {
  switch (direction) {
    case 'bullish': return '↑ Bullish';
    case 'bearish': return '↓ Bearish';
    default: return '→ Neutral';
  }
}

export function MTFAlignmentIndicator({ 
  analysis, 
  positionDirection,
  compact = false 
}: MTFAlignmentIndicatorProps) {
  if (!analysis) {
    return (
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
        <div className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
      </div>
    );
  }

  const { m1, m3, m5, alignment, confidence } = analysis;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", compact ? "gap-0.5" : "gap-1")}>
        {/* 1m indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={cn(
                "rounded-full transition-all",
                compact ? "w-1.5 h-1.5" : "w-2 h-2",
                getSignalColor(m1, positionDirection)
              )} 
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="font-medium">1m: {getDirectionLabel(m1.direction)}</div>
            <div className="text-muted-foreground">
              {m1.momentum >= 0 ? '+' : ''}{m1.momentum.toFixed(3)}%
            </div>
          </TooltipContent>
        </Tooltip>

        {/* 3m indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={cn(
                "rounded-full transition-all",
                compact ? "w-1.5 h-1.5" : "w-2 h-2",
                getSignalColor(m3, positionDirection)
              )} 
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="font-medium">3m: {getDirectionLabel(m3.direction)}</div>
            <div className="text-muted-foreground">
              {m3.momentum >= 0 ? '+' : ''}{m3.momentum.toFixed(3)}%
            </div>
          </TooltipContent>
        </Tooltip>

        {/* 5m indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={cn(
                "rounded-full transition-all",
                compact ? "w-1.5 h-1.5" : "w-2 h-2",
                getSignalColor(m5, positionDirection)
              )} 
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="font-medium">5m: {getDirectionLabel(m5.direction)}</div>
            <div className="text-muted-foreground">
              {m5.momentum >= 0 ? '+' : ''}{m5.momentum.toFixed(3)}%
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Confidence badge (optional, non-compact) */}
        {!compact && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "text-[9px] font-mono px-1 rounded",
                alignment === 'aligned_long' && "bg-emerald-500/20 text-emerald-400",
                alignment === 'aligned_short' && "bg-red-500/20 text-red-400",
                alignment === 'mixed' && "bg-muted text-muted-foreground"
              )}>
                {confidence}%
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="font-medium">
                {alignment === 'aligned_long' && 'Timeframes aligned LONG'}
                {alignment === 'aligned_short' && 'Timeframes aligned SHORT'}
                {alignment === 'mixed' && 'Mixed signals'}
              </div>
              <div className="text-muted-foreground">
                Confidence: {confidence}%
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
