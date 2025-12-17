import { useMemo } from 'react';
import { Brain, TrendingUp, TrendingDown, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MLConfidenceGaugeProps {
  currentConfidence: number;      // 0-100 from ML model
  predictionAccuracy: number;     // Rolling 50-trade accuracy
  lastPrediction?: 'long' | 'short';
  lastPredictionCorrect?: boolean;
  tradesAnalyzed: number;
  className?: string;
  compact?: boolean;
}

export function MLConfidenceGauge({
  currentConfidence,
  predictionAccuracy,
  lastPrediction,
  lastPredictionCorrect,
  tradesAnalyzed,
  className,
  compact = false,
}: MLConfidenceGaugeProps) {
  const { zone, color, bgColor, icon, label } = useMemo(() => {
    if (predictionAccuracy >= 95) {
      return {
        zone: 'elite',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/20',
        icon: <Sparkles className="h-4 w-4 text-yellow-500" />,
        label: 'ELITE',
      };
    } else if (predictionAccuracy >= 85) {
      return {
        zone: 'high',
        color: 'text-success',
        bgColor: 'bg-success/20',
        icon: <CheckCircle2 className="h-4 w-4 text-success" />,
        label: 'HIGH',
      };
    } else if (predictionAccuracy >= 70) {
      return {
        zone: 'medium',
        color: 'text-warning',
        bgColor: 'bg-warning/20',
        icon: <Brain className="h-4 w-4 text-warning" />,
        label: 'MEDIUM',
      };
    } else {
      return {
        zone: 'low',
        color: 'text-destructive',
        bgColor: 'bg-destructive/20',
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        label: 'LOW',
      };
    }
  }, [predictionAccuracy]);

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md",
              bgColor,
              zone === 'elite' && "animate-pulse",
              className
            )}>
              {icon}
              <span className={cn("text-xs font-bold tabular-nums", color)}>
                {predictionAccuracy.toFixed(0)}%
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1 text-xs">
              <div className="font-medium">ML Prediction Accuracy</div>
              <div>Confidence: {currentConfidence.toFixed(0)}%</div>
              <div>Trades Analyzed: {tradesAnalyzed}</div>
              {lastPrediction && (
                <div className="flex items-center gap-1">
                  Last: {lastPrediction.toUpperCase()}
                  {lastPredictionCorrect !== undefined && (
                    lastPredictionCorrect ? 
                      <CheckCircle2 className="h-3 w-3 text-success" /> : 
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                  )}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-3",
      bgColor,
      zone === 'elite' && "ring-1 ring-yellow-500/50",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className={cn("h-5 w-5", color)} />
          <span className="text-sm font-medium">ML Confidence</span>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] font-bold",
            zone === 'elite' && "border-yellow-500 text-yellow-500",
            zone === 'high' && "border-success text-success",
            zone === 'medium' && "border-warning text-warning",
            zone === 'low' && "border-destructive text-destructive",
          )}
        >
          {label}
        </Badge>
      </div>

      {/* Gauge */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Prediction Accuracy</span>
          <span className={cn("font-bold tabular-nums", color)}>
            {predictionAccuracy.toFixed(1)}%
          </span>
        </div>
        <Progress 
          value={predictionAccuracy} 
          className={cn(
            "h-2",
            zone === 'elite' && "[&>div]:bg-yellow-500",
            zone === 'high' && "[&>div]:bg-success",
            zone === 'medium' && "[&>div]:bg-warning",
            zone === 'low' && "[&>div]:bg-destructive",
          )}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>Target: 85%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="text-center p-2 rounded bg-background/50">
          <div className={cn("text-lg font-bold tabular-nums", color)}>
            {currentConfidence.toFixed(0)}%
          </div>
          <div className="text-[10px] text-muted-foreground">Current Confidence</div>
        </div>
        <div className="text-center p-2 rounded bg-background/50">
          <div className="text-lg font-bold tabular-nums text-foreground">
            {tradesAnalyzed}
          </div>
          <div className="text-[10px] text-muted-foreground">Trades Analyzed</div>
        </div>
      </div>

      {/* Last Prediction */}
      {lastPrediction && (
        <div className={cn(
          "flex items-center justify-between px-2 py-1.5 rounded text-xs",
          lastPredictionCorrect === true && "bg-success/10",
          lastPredictionCorrect === false && "bg-destructive/10",
          lastPredictionCorrect === undefined && "bg-muted",
        )}>
          <div className="flex items-center gap-1.5">
            {lastPrediction === 'long' ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className="font-medium">
              Last: {lastPrediction.toUpperCase()}
            </span>
          </div>
          {lastPredictionCorrect !== undefined && (
            <Badge 
              variant={lastPredictionCorrect ? "default" : "destructive"}
              className="text-[10px] h-5"
            >
              {lastPredictionCorrect ? '✓ Correct' : '✗ Wrong'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
