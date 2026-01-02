import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, AlertTriangle, Lightbulb, TrendingUp, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  exchange?: string;
  className?: string;
}

const MINIMUM_POSITION_SIZE = 333;

export function LivePositionCalculator({
  portfolioBalance,
  currentPositionSize,
  onPositionSizeChange,
  exchange = 'binance',
  className,
}: LivePositionCalculatorProps) {
  const [selectedExchange, setSelectedExchange] = useState(exchange);
  const [selectedTier, setSelectedTier] = useState('standard');
  const [hasBnbDiscount, setHasBnbDiscount] = useState(false);
  const [edgePercent, setEdgePercent] = useState(0.6); // 0.6% default edge
  const [localPositionSize, setLocalPositionSize] = useState(currentPositionSize);

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

  // Calculate recommendation
  const recommendation = useMemo(() => {
    if (portfolioBalance < MINIMUM_POSITION_SIZE) {
      return {
        message: `Balance too low. Need $${MINIMUM_POSITION_SIZE} minimum for $1 profit trades.`,
        type: 'warning' as const,
      };
    }
    
    if (localPositionSize < MINIMUM_POSITION_SIZE) {
      return {
        message: `Increase to $${MINIMUM_POSITION_SIZE} for reliable $1 profit per trade.`,
        type: 'warning' as const,
      };
    }
    
    if (profitPreview.netProfit >= 2) {
      return {
        message: `Great! You'll make $${profitPreview.netProfit.toFixed(2)} per trade.`,
        type: 'success' as const,
      };
    }
    
    if (profitPreview.netProfit >= 1) {
      return {
        message: `Good. Expected $${profitPreview.netProfit.toFixed(2)} profit per trade.`,
        type: 'info' as const,
      };
    }
    
    return {
      message: `Consider increasing position size for better profits.`,
      type: 'info' as const,
    };
  }, [portfolioBalance, localPositionSize, profitPreview.netProfit]);

  return (
    <Card className={cn("bg-slate-950 border-slate-800 font-mono", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-slate-300">
          <Calculator className="h-4 w-4 text-primary" />
          Position Size Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portfolio Balance Display */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Portfolio Balance</span>
            <span className="text-sm font-bold text-cyan-400">
              ${portfolioBalance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Position Size Input */}
        <div className="space-y-2">
          <Label className="text-xs text-slate-400">Position Size (USD)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={MINIMUM_POSITION_SIZE}
              value={localPositionSize}
              onChange={(e) => handlePositionSizeChange(Number(e.target.value))}
              className="bg-slate-900 border-slate-700 font-mono"
            />
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              Min: ${MINIMUM_POSITION_SIZE}
            </Badge>
          </div>
          <Slider
            value={[localPositionSize]}
            min={MINIMUM_POSITION_SIZE}
            max={Math.max(1000, portfolioBalance * 0.5)}
            step={10}
            onValueChange={([v]) => handlePositionSizeChange(v)}
            className="mt-2"
          />
        </div>

        {/* Exchange & Fee Settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">Exchange</Label>
            <Select value={selectedExchange} onValueChange={setSelectedExchange}>
              <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="binance">Binance</SelectItem>
                <SelectItem value="okx">OKX</SelectItem>
                <SelectItem value="bybit">Bybit</SelectItem>
                <SelectItem value="kraken">Kraken</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-slate-500">VIP Tier</Label>
            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="bg-slate-900 border-slate-700 h-8 text-xs">
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
        </div>

        {/* BNB Discount Toggle (Binance only) */}
        {selectedExchange === 'binance' && (
          <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <Label className="text-xs text-slate-400">BNB Fee Discount (25% off)</Label>
            <Switch
              checked={hasBnbDiscount}
              onCheckedChange={setHasBnbDiscount}
            />
          </div>
        )}

        {/* Fee Rate Display */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Effective Fee Rate</span>
          <span className="font-mono text-slate-300">
            {(profitPreview.effectiveFeeRate).toFixed(3)}%
            {hasBnbDiscount && <span className="text-emerald-400 ml-1">(discounted)</span>}
          </span>
        </div>

        {/* Edge Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Expected Price Move</Label>
            <span className="text-xs font-mono text-cyan-400">{edgePercent.toFixed(2)}%</span>
          </div>
          <Slider
            value={[edgePercent]}
            min={0.3}
            max={1.5}
            step={0.05}
            onValueChange={([v]) => setEdgePercent(v)}
          />
        </div>

        {/* Profit Breakdown */}
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-800 space-y-2">
          <div className="text-xs text-slate-500 mb-2">💰 Profit Breakdown</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Gross Profit</span>
            <span className="font-mono text-emerald-400">+${profitPreview.grossProfit.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Fee Cost</span>
            <span className="font-mono text-red-400">-${profitPreview.feeCost.toFixed(2)}</span>
          </div>
          <div className="border-t border-slate-700 my-2" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-300">NET PROFIT</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              profitPreview.netProfit >= 1 ? "text-emerald-400" : "text-amber-400"
            )}>
              ${profitPreview.netProfit.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Recommendation */}
        <div className={cn(
          "flex items-start gap-2 p-2 rounded-lg text-xs",
          recommendation.type === 'warning' && "bg-amber-500/10 border border-amber-500/30",
          recommendation.type === 'success' && "bg-emerald-500/10 border border-emerald-500/30",
          recommendation.type === 'info' && "bg-blue-500/10 border border-blue-500/30"
        )}>
          {recommendation.type === 'warning' ? (
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          ) : (
            <Lightbulb className="h-4 w-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          )}
          <span className={cn(
            recommendation.type === 'warning' && "text-amber-400",
            recommendation.type === 'success' && "text-emerald-400",
            recommendation.type === 'info' && "text-blue-400"
          )}>
            {recommendation.message}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
