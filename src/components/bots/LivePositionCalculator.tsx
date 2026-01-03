import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, AlertTriangle, Lightbulb, TrendingUp, DollarSign, Play, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CARD_SIZES } from '@/lib/cardSizes';
import { 
  BINANCE_VIP_TIERS, 
  OKX_VIP_TIERS, 
  BYBIT_VIP_TIERS, 
  DEFAULT_EXCHANGE_FEES,
  getVipTierFees,
  getAvailableTiers,
} from '@/lib/positionSizing';

interface LivePositionCalculatorProps {
  portfolioBalance: number;
  currentPositionSize: number;
  onPositionSizeChange: (size: number) => void;
  onCalculate?: () => void;
  onExecute?: () => Promise<void>;
  exchange?: string;
  className?: string;
}

const MINIMUM_POSITION_SIZE = 333;

export function LivePositionCalculator({
  portfolioBalance,
  currentPositionSize,
  onPositionSizeChange,
  onCalculate,
  onExecute,
  exchange = 'binance',
  className,
}: LivePositionCalculatorProps) {
  const [selectedExchange, setSelectedExchange] = useState(exchange);
  const [selectedTier, setSelectedTier] = useState('standard');
  const [hasBnbDiscount, setHasBnbDiscount] = useState(false);
  const [edgePercent, setEdgePercent] = useState(0.6); // 0.6% default edge
  const [localPositionSize, setLocalPositionSize] = useState(currentPositionSize);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);

  // Fixed card dimensions from CARD_SIZES
  const cardStyle = CARD_SIZES.positionCalculator;

  // Get available tiers for selected exchange
  const availableTiers = useMemo(() => getAvailableTiers(selectedExchange), [selectedExchange]);

  // Get fee rates based on selection
  const feeRates = useMemo(() => {
    return getVipTierFees(selectedExchange, selectedTier, hasBnbDiscount);
  }, [selectedExchange, selectedTier, hasBnbDiscount]);

  // Calculate profit preview
  const profitPreview = useMemo(() => {
    const positionSize = localPositionSize;
    const edgeDecimal = edgePercent / 100;
    const roundTripFees = feeRates.taker * 2; // Taker fees for market orders (entry + exit)
    
    const grossProfit = positionSize * edgeDecimal;
    const feeCost = positionSize * roundTripFees;
    const netProfit = grossProfit - feeCost;
    
    const requiredMovePercent = ((1 + feeCost) / positionSize) * 100;
    const isViable = edgeDecimal > roundTripFees;
    
    return {
      grossProfit,
      feeCost,
      netProfit,
      requiredMovePercent,
      isViable,
      effectiveFeeRate: roundTripFees * 100,
    };
  }, [localPositionSize, edgePercent, feeRates]);

  // Sync with parent
  useEffect(() => {
    if (localPositionSize !== currentPositionSize) {
      setLocalPositionSize(currentPositionSize);
    }
  }, [currentPositionSize]);

  const handlePositionSizeChange = (value: number) => {
    const enforced = Math.max(MINIMUM_POSITION_SIZE, value);
    setLocalPositionSize(enforced);
    onPositionSizeChange(enforced);
  };

  // Handle Calculate button
  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      onCalculate?.();
      await new Promise(r => setTimeout(r, 500)); // Simulate calculation
    } finally {
      setIsCalculating(false);
    }
  };

  // Handle Execute button
  const handleExecute = async () => {
    if (!onExecute) return;
    setIsExecuting(true);
    try {
      await onExecute();
    } finally {
      setIsExecuting(false);
    }
  };

  // Calculate recommendation
  const recommendation = useMemo(() => {
    if (portfolioBalance < MINIMUM_POSITION_SIZE) {
      return {
        message: `Need $${MINIMUM_POSITION_SIZE} minimum.`,
        type: 'warning' as const,
      };
    }
    
    if (localPositionSize < MINIMUM_POSITION_SIZE) {
      return {
        message: `Increase to $${MINIMUM_POSITION_SIZE}.`,
        type: 'warning' as const,
      };
    }
    
    if (profitPreview.netProfit >= 1) {
      return {
        message: `$${profitPreview.netProfit.toFixed(2)}/trade`,
        type: 'success' as const,
      };
    }
    
    return {
      message: `Increase size for better profits.`,
      type: 'info' as const,
    };
  }, [portfolioBalance, localPositionSize, profitPreview.netProfit]);

  return (
    <Card 
      className={cn("bg-slate-950 border-slate-800 font-mono overflow-hidden", className)}
      style={cardStyle}
    >
      <CardHeader className="pb-1 pt-2 px-3">
        <CardTitle className="text-xs flex items-center gap-2 text-slate-300">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Position Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-2">
        {/* Portfolio Balance Display - Compact */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Balance</span>
          <span className="font-bold text-cyan-400">${portfolioBalance.toFixed(2)}</span>
        </div>

        {/* Position Size Input - Compact */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MINIMUM_POSITION_SIZE}
              value={localPositionSize}
              onChange={(e) => handlePositionSizeChange(Number(e.target.value))}
              className="bg-slate-900 border-slate-700 font-mono h-7 text-xs"
            />
            <Badge variant="outline" className="text-[9px] h-5 px-1">
              ${MINIMUM_POSITION_SIZE}
            </Badge>
          </div>
          <Slider
            value={[localPositionSize]}
            min={MINIMUM_POSITION_SIZE}
            max={Math.max(1000, portfolioBalance * 0.5)}
            step={10}
            onValueChange={([v]) => handlePositionSizeChange(v)}
            className="py-1"
          />
        </div>

        {/* Exchange & Fee Settings - Compact */}
        <div className="grid grid-cols-2 gap-2">
          <Select value={selectedExchange} onValueChange={setSelectedExchange}>
            <SelectTrigger className="bg-slate-900 border-slate-700 h-6 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="binance">Binance</SelectItem>
              <SelectItem value="okx">OKX</SelectItem>
              <SelectItem value="bybit">Bybit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedTier} onValueChange={setSelectedTier}>
            <SelectTrigger className="bg-slate-900 border-slate-700 h-6 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableTiers.map(tier => (
                <SelectItem key={tier} value={tier}>
                  {tier.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Profit Display - Compact */}
        <div className="bg-slate-900 rounded p-2 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Net Profit</span>
            <span className={cn(
              "text-sm font-bold font-mono",
              profitPreview.netProfit >= 1 ? "text-emerald-400" : "text-amber-400"
            )}>
              ${profitPreview.netProfit.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1">
            <span>Fee: {profitPreview.effectiveFeeRate.toFixed(3)}%</span>
            <span>-${profitPreview.feeCost.toFixed(2)}</span>
          </div>
        </div>

        {/* Recommendation - Compact */}
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded text-[10px]",
          recommendation.type === 'warning' && "bg-amber-500/10 text-amber-400",
          recommendation.type === 'success' && "bg-emerald-500/10 text-emerald-400",
          recommendation.type === 'info' && "bg-blue-500/10 text-blue-400"
        )}>
          {recommendation.type === 'warning' ? (
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          ) : (
            <Lightbulb className="h-3 w-3 flex-shrink-0" />
          )}
          <span className="truncate">{recommendation.message}</span>
        </div>

        {/* ACTION BUTTONS - Required per spec */}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCalculate}
            disabled={isCalculating}
            className="flex-1 h-7 text-xs gap-1"
          >
            {isCalculating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Calculate
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={isExecuting || !onExecute || profitPreview.netProfit < 0.5}
            className="flex-1 h-7 text-xs gap-1 bg-primary hover:bg-primary/90"
          >
            {isExecuting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Execute
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
