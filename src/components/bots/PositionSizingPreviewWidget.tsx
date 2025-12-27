import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Scale, Zap, Target } from 'lucide-react';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { usePositionAutoScaling } from '@/hooks/usePositionAutoScaling';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { cn } from '@/lib/utils';

interface PositionSizingPreviewWidgetProps {
  basePositionSize?: number;
}

export function PositionSizingPreviewWidget({ basePositionSize = 100 }: PositionSizingPreviewWidgetProps) {
  const { settings } = useJarvisSettings();
  const { regime, deviation, adaptiveTarget, isLoading: regimeLoading } = useJarvisRegime('BTCUSDT');
  
  const {
    scaledPositionSize,
    currentMultiplier,
    regimeMultiplier,
    regimeConfidence,
    combinedScalingReason,
    recentPerformance,
  } = usePositionAutoScaling({
    config: { basePositionSize: settings?.base_capital || basePositionSize },
    regime,
    deviation: Math.abs(deviation),
  });

  const getRegimeIcon = () => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'BEAR': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-amber-500" />;
    }
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'BULL': return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10';
      case 'BEAR': return 'text-red-400 border-red-500/50 bg-red-500/10';
      default: return 'text-amber-400 border-amber-500/50 bg-amber-500/10';
    }
  };

  const confidencePercent = Math.min(100, regimeConfidence);

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-slate-300">Position Sizing</span>
          </div>
          <Badge variant="outline" className={cn("text-xs", getRegimeColor())}>
            {getRegimeIcon()}
            <span className="ml-1">{regime}</span>
          </Badge>
        </div>

        {/* Current Position Size */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="text-[10px] text-slate-500 mb-1">BASE SIZE</div>
            <div className="text-lg font-bold text-slate-300">
              ${(settings?.base_capital || basePositionSize).toFixed(0)}
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="text-[10px] text-slate-500 mb-1">SCALED SIZE</div>
            <div className={cn(
              "text-lg font-bold",
              currentMultiplier > 1 ? "text-emerald-400" : 
              currentMultiplier < 1 ? "text-red-400" : "text-slate-300"
            )}>
              ${scaledPositionSize.toFixed(0)}
            </div>
          </div>
        </div>

        {/* Multipliers */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Performance Multiplier
            </span>
            <span className={cn(
              "font-mono",
              recentPerformance === 'winning' ? "text-emerald-400" :
              recentPerformance === 'losing' ? "text-red-400" : "text-slate-300"
            )}>
              {currentMultiplier.toFixed(2)}x
            </span>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 flex items-center gap-1">
              {getRegimeIcon()}
              Regime Multiplier
            </span>
            <span className="font-mono text-slate-300">
              {regimeMultiplier.toFixed(2)}x
            </span>
          </div>
        </div>

        {/* Regime Confidence Gauge */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Regime Confidence</span>
            <span className={cn(
              "font-mono",
              confidencePercent >= 70 ? "text-emerald-400" :
              confidencePercent >= 50 ? "text-amber-400" : "text-red-400"
            )}>
              {confidencePercent.toFixed(0)}%
            </span>
          </div>
          <Progress 
            value={confidencePercent} 
            className="h-1.5 bg-slate-800"
          />
        </div>

        {/* Adaptive Target */}
        <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Target className="h-3 w-3" />
              Adaptive Target
            </div>
            <span className="text-sm font-bold text-cyan-400">
              ${adaptiveTarget.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Scaling Reason */}
        {combinedScalingReason && (
          <div className="mt-2 text-[10px] text-slate-500 italic">
            {combinedScalingReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}