import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Scale, Zap, Target, Calculator, Clock, ArrowRight } from 'lucide-react';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { usePositionAutoScaling } from '@/hooks/usePositionAutoScaling';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useVolatilityScanner } from '@/hooks/useVolatilityScanner';
import { cn } from '@/lib/utils';

interface PositionSizingPreviewWidgetProps {
  basePositionSize?: number;
  targetProfit?: number;
}

export function PositionSizingPreviewWidget({ 
  basePositionSize = 100,
  targetProfit = 1 
}: PositionSizingPreviewWidgetProps) {
  const { settings } = useJarvisSettings();
  const { regime, deviation, adaptiveTarget, isLoading: regimeLoading } = useJarvisRegime('BTCUSDT');
  const { pairs } = useVolatilityScanner();
  
  // Get top volatility pair for calculation display
  const topPair = pairs?.[0];
  const volatilityPct = topPair?.volatilityPercent || 0.5;
  
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

  // Calculate the dynamic position size breakdown
  const targetProfitUsd = adaptiveTarget || targetProfit;
  const baseCalcSize = (targetProfitUsd / (volatilityPct / 100));
  const clampedSize = Math.max(200, Math.min(500, baseCalcSize));
  
  // Risk adjustments simulation
  const drawdownMultiplier = recentPerformance === 'losing' ? 0.9 : 1.0;
  const winRateMultiplier = recentPerformance === 'winning' ? 1.1 : 1.0;
  const afterDrawdown = baseCalcSize * drawdownMultiplier;
  const afterWinRate = afterDrawdown * winRateMultiplier;
  const finalSize = Math.max(200, Math.min(500, afterWinRate));
  
  // Estimated time to profit
  const estTimeMinutes = volatilityPct > 0 ? (targetProfitUsd / (finalSize * volatilityPct / 100)) * 60 : 5;

  const getRegimeIcon = () => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-3 w-3 text-emerald-500" />;
      case 'BEAR': return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return <Minus className="h-3 w-3 text-amber-500" />;
    }
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'BULL': return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10';
      case 'BEAR': return 'text-red-400 border-red-500/50 bg-red-500/10';
      default: return 'text-amber-400 border-amber-500/50 bg-amber-500/10';
    }
  };

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-slate-300">Position Size Calculator</span>
          </div>
          <div className="text-lg font-bold text-cyan-400">
            ${finalSize.toFixed(0)}
          </div>
        </div>

        {/* Calculation Breakdown */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800 mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Calculation Breakdown</div>
          
          {/* Formula */}
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Target Profit</span>
              <span className="text-emerald-400 font-semibold">${targetProfitUsd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Current Volatility ({topPair?.symbol || 'BTC'})</span>
              <span className="text-amber-400 font-semibold">{volatilityPct.toFixed(2)}%</span>
            </div>
            
            <div className="border-t border-slate-700 my-2" />
            
            <div className="flex items-center gap-2 text-slate-300 bg-slate-800/50 rounded px-2 py-1.5">
              <span className="text-[10px] text-slate-500">Base Size =</span>
              <span>${targetProfitUsd.toFixed(2)}</span>
              <span className="text-slate-500">÷</span>
              <span>{volatilityPct.toFixed(2)}%</span>
              <span className="text-slate-500">=</span>
              <span className="text-cyan-400 font-bold">${baseCalcSize.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Risk Adjustments */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800 mb-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Risk Adjustments</div>
          
          <div className="space-y-1.5 text-xs">
            {recentPerformance === 'losing' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  Drawdown Protection
                </span>
                <span className="text-red-400">×0.90</span>
              </div>
            )}
            {recentPerformance === 'winning' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  Win Streak Boost
                </span>
                <span className="text-emerald-400">×1.10</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                {getRegimeIcon()}
                {regime} Regime
              </span>
              <span className={cn(
                regimeMultiplier > 1 ? "text-emerald-400" :
                regimeMultiplier < 1 ? "text-red-400" : "text-slate-300"
              )}>×{regimeMultiplier.toFixed(2)}</span>
            </div>
            
            <div className="border-t border-slate-700 my-2" />
            
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Clamped to range</span>
              <span className="text-slate-500">$200 - $500</span>
            </div>
          </div>
        </div>

        {/* Final Result */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-lg p-3 border border-cyan-500/30">
            <div className="text-[10px] text-slate-500 mb-1">NEXT TRADE SIZE</div>
            <div className="text-2xl font-bold text-cyan-400">
              ${finalSize.toFixed(0)}
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              EST. TIME TO PROFIT
            </div>
            <div className="text-lg font-bold text-slate-300">
              ~{estTimeMinutes.toFixed(1)}m
            </div>
          </div>
        </div>

        {/* Regime Confidence */}
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className={cn("text-[10px]", getRegimeColor())}>
            {getRegimeIcon()}
            <span className="ml-1">{regime}</span>
          </Badge>
          <div className="flex-1">
            <Progress 
              value={Math.min(100, regimeConfidence)} 
              className="h-1 bg-slate-800"
            />
          </div>
          <span className="text-slate-500 font-mono text-[10px]">
            {regimeConfidence.toFixed(0)}%
          </span>
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
