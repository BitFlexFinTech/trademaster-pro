import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Calculator, Clock, DollarSign } from 'lucide-react';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { usePositionAutoScaling } from '@/hooks/usePositionAutoScaling';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useVolatilityScanner } from '@/hooks/useVolatilityScanner';
import { cn } from '@/lib/utils';

interface PositionSizingPreviewWidgetProps {
  basePositionSize?: number;
  targetProfit?: number;
}

// Fee rates (configurable)
const MAKER_FEE = 0.0002; // 0.02%
const TAKER_FEE = 0.0004; // 0.04%
const FUNDING_FEE = 0.0001; // 0.01% for futures

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
  const currentPrice = topPair?.currentPrice || 95000;
  
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
  
  // Risk adjustments simulation
  const drawdownMultiplier = recentPerformance === 'losing' ? 0.9 : 1.0;
  const winRateMultiplier = recentPerformance === 'winning' ? 1.1 : 1.0;
  const afterDrawdown = baseCalcSize * drawdownMultiplier;
  const afterWinRate = afterDrawdown * winRateMultiplier;
  const finalSize = Math.max(200, Math.min(500, afterWinRate));
  
  // Calculate LONG position breakdown
  const longTargetPct = volatilityPct / 100;
  const longExitPrice = currentPrice * (1 + longTargetPct);
  const longGrossProfit = finalSize * longTargetPct;
  const longTakerFees = finalSize * TAKER_FEE * 2; // Entry + exit
  const longNetProfit = longGrossProfit - longTakerFees;
  
  // Calculate SHORT position breakdown
  const shortTargetPct = volatilityPct / 100;
  const shortExitPrice = currentPrice * (1 - shortTargetPct);
  const shortGrossProfit = finalSize * shortTargetPct;
  const shortTakerFees = finalSize * TAKER_FEE * 2;
  const shortNetProfit = shortGrossProfit - shortTakerFees;
  
  // Leverage calculations (for futures)
  const leverage = 4;
  const leveragedSize = finalSize * leverage;
  const leverageGrossProfit = leveragedSize * longTargetPct;
  const leverageTakerFees = leveragedSize * TAKER_FEE * 2;
  const leverageFundingFee = leveragedSize * FUNDING_FEE;
  const leverageNetProfit = leverageGrossProfit - leverageTakerFees - leverageFundingFee;

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
    <Card className="bg-card border-border font-mono">
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">Position Calculator</span>
          </div>
          <div className="text-base font-bold text-cyan-400">
            ${finalSize.toFixed(0)}
          </div>
        </div>

        {/* Long/Short Comparison Grid */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* LONG Position */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-400">LONG</span>
            </div>
            <div className="space-y-1 text-[9px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry</span>
                <span>${currentPrice.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exit (+{(volatilityPct).toFixed(2)}%)</span>
                <span>${longExitPrice.toFixed(0)}</span>
              </div>
              <div className="border-t border-emerald-500/20 pt-1 mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross</span>
                  <span className="text-emerald-400">+${longGrossProfit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fees (2×0.04%)</span>
                  <span className="text-red-400">-${longTakerFees.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>NET</span>
                  <span className="text-emerald-400">+${longNetProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SHORT Position */}
          <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingDown className="h-3 w-3 text-red-500" />
              <span className="text-[10px] font-bold text-red-400">SHORT</span>
            </div>
            <div className="space-y-1 text-[9px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry</span>
                <span>${currentPrice.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exit (-{(volatilityPct).toFixed(2)}%)</span>
                <span>${shortExitPrice.toFixed(0)}</span>
              </div>
              <div className="border-t border-red-500/20 pt-1 mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross</span>
                  <span className="text-emerald-400">+${shortGrossProfit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fees (2×0.04%)</span>
                  <span className="text-red-400">-${shortTakerFees.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>NET</span>
                  <span className="text-emerald-400">+${shortNetProfit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Leverage Section */}
        <div className="bg-muted/30 rounded p-2 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">FUTURES ({leverage}× Leverage)</span>
            <span className="text-[10px] font-mono">${leveragedSize.toFixed(0)} effective</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[9px]">
            <div>
              <div className="text-muted-foreground">Gross</div>
              <div className="text-emerald-400 font-bold">+${leverageGrossProfit.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fees + Fund</div>
              <div className="text-red-400">-${(leverageTakerFees + leverageFundingFee).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">NET</div>
              <div className="text-cyan-400 font-bold">+${leverageNetProfit.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground mb-2">
          <span>Maker: {(MAKER_FEE * 100).toFixed(2)}%</span>
          <span>Taker: {(TAKER_FEE * 100).toFixed(2)}%</span>
          <span>Funding: {(FUNDING_FEE * 100).toFixed(2)}%</span>
        </div>

        {/* Regime Indicator */}
        <div className="flex items-center gap-2 text-[10px]">
          <Badge variant="outline" className={cn("text-[9px] h-5", getRegimeColor())}>
            {getRegimeIcon()}
            <span className="ml-1">{regime}</span>
          </Badge>
          <Progress 
            value={Math.min(100, regimeConfidence)} 
            className="h-1 flex-1 bg-muted"
          />
          <span className="text-muted-foreground font-mono">
            {regimeConfidence.toFixed(0)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
