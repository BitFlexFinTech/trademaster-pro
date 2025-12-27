import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Zap, Save, RotateCcw, TrendingUp, TrendingDown, 
  Minus, Shield, Target, Activity
} from 'lucide-react';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useJarvisFuturesPositions } from '@/hooks/useJarvisFuturesPositions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type RiskTolerance = 'conservative' | 'medium' | 'aggressive';

interface RegimeAdjustment {
  activationMultiplier: number;
  distanceMultiplier: number;
}

const DEFAULT_REGIME_ADJUSTMENTS: Record<string, RegimeAdjustment> = {
  BULL: { activationMultiplier: 0.9, distanceMultiplier: 0.8 },
  BEAR: { activationMultiplier: 1.1, distanceMultiplier: 1.2 },
  CHOP: { activationMultiplier: 1.2, distanceMultiplier: 1.5 },
};

export function SmartTrailingStopPanel() {
  const { settings, updateSettings, isSaving } = useJarvisSettings();
  const { regime, deviation } = useJarvisRegime('BTCUSDT');
  const { longPosition, shortPosition } = useJarvisFuturesPositions();

  const [enabled, setEnabled] = useState(true);
  const [activationPct, setActivationPct] = useState(0.75);
  const [distancePct, setDistancePct] = useState(0.25);
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>('medium');
  const [regimeAdjustments, setRegimeAdjustments] = useState(DEFAULT_REGIME_ADJUSTMENTS);

  // Load settings
  useEffect(() => {
    if (settings) {
      // These fields may not exist yet in the type, but we added them in migration
      const s = settings as any;
      setEnabled(s.trailing_stop_enabled ?? true);
      setActivationPct(s.trailing_activation_pct ?? 0.75);
      setDistancePct(s.trailing_distance_pct ?? 0.25);
      setRiskTolerance(s.risk_tolerance ?? 'medium');
      if (s.regime_trailing_adjustments) {
        setRegimeAdjustments(s.regime_trailing_adjustments);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings({
        trailing_stop_enabled: enabled,
        trailing_activation_pct: activationPct,
        trailing_distance_pct: distancePct,
        risk_tolerance: riskTolerance,
        regime_trailing_adjustments: regimeAdjustments,
      } as any);
      toast.success('Trailing stop settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const handleReset = () => {
    setEnabled(true);
    setActivationPct(0.75);
    setDistancePct(0.25);
    setRiskTolerance('medium');
    setRegimeAdjustments(DEFAULT_REGIME_ADJUSTMENTS);
  };

  // Calculate effective settings based on current regime
  const currentAdjustment = regimeAdjustments[regime] || DEFAULT_REGIME_ADJUSTMENTS.CHOP;
  const effectiveActivation = activationPct * currentAdjustment.activationMultiplier;
  const effectiveDistance = distancePct * currentAdjustment.distanceMultiplier;

  const getRegimeIcon = (r: string) => {
    switch (r) {
      case 'BULL': return <TrendingUp className="h-3 w-3 text-emerald-500" />;
      case 'BEAR': return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return <Minus className="h-3 w-3 text-amber-500" />;
    }
  };

  // Active trailing stops
  const activeTrails = [];
  if (longPosition && longPosition.unrealizedProfit > 0) {
    activeTrails.push({
      symbol: longPosition.symbol,
      direction: 'LONG',
      entry: longPosition.entryPrice,
      current: longPosition.entryPrice + (longPosition.unrealizedProfit / Math.abs(longPosition.positionAmt)),
      pnl: longPosition.unrealizedProfit,
    });
  }
  if (shortPosition && shortPosition.unrealizedProfit > 0) {
    activeTrails.push({
      symbol: shortPosition.symbol,
      direction: 'SHORT',
      entry: shortPosition.entryPrice,
      current: shortPosition.entryPrice - (shortPosition.unrealizedProfit / Math.abs(shortPosition.positionAmt)),
      pnl: shortPosition.unrealizedProfit,
    });
  }

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Smart Trailing Stops
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-xs text-muted-foreground">
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Base Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-400">Activation (% of TP)</Label>
              <span className="text-xs text-primary font-mono">
                {(activationPct * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={[activationPct * 100]}
              onValueChange={([v]) => setActivationPct(v / 100)}
              min={50}
              max={95}
              step={5}
              disabled={!enabled}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-400">Trail Distance (% of TP)</Label>
              <span className="text-xs text-amber-400 font-mono">
                {(distancePct * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={[distancePct * 100]}
              onValueChange={([v]) => setDistancePct(v / 100)}
              min={10}
              max={50}
              step={5}
              disabled={!enabled}
            />
          </div>

          {/* Risk Tolerance */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Risk Tolerance</Label>
            <div className="flex gap-2">
              {(['conservative', 'medium', 'aggressive'] as RiskTolerance[]).map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={riskTolerance === level ? 'default' : 'outline'}
                  onClick={() => setRiskTolerance(level)}
                  disabled={!enabled}
                  className="flex-1 capitalize text-xs"
                >
                  {level}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Regime Adjustments */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="text-[10px] text-slate-500 mb-2">REGIME ADJUSTMENTS (Auto-Applied)</div>
          <div className="space-y-1.5">
            {Object.entries(regimeAdjustments).map(([r, adj]) => (
              <div key={r} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {getRegimeIcon(r)}
                  <span className={cn(
                    regime === r ? "text-foreground font-semibold" : "text-muted-foreground"
                  )}>
                    {r}
                  </span>
                  {regime === r && (
                    <Badge variant="outline" className="text-[8px] h-4">ACTIVE</Badge>
                  )}
                </div>
                <span className="text-slate-400 font-mono">
                  Act ×{adj.activationMultiplier.toFixed(1)}, Dist ×{adj.distanceMultiplier.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Effective Settings */}
        {enabled && (
          <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
            <div className="text-[10px] text-primary mb-2 flex items-center gap-1">
              <Target className="h-3 w-3" />
              EFFECTIVE SETTINGS ({regime} Regime)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Activation:</span>
                <span className="text-primary ml-1 font-mono">
                  {(effectiveActivation * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Distance:</span>
                <span className="text-amber-400 ml-1 font-mono">
                  {(effectiveDistance * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Active Trailing Stops */}
        {activeTrails.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 mb-2">ACTIVE TRAILING STOPS</div>
            <ScrollArea className="h-[100px]">
              <div className="space-y-2">
                {activeTrails.map((trail, idx) => (
                  <div 
                    key={idx}
                    className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{trail.symbol} {trail.direction}</span>
                      <span className="text-emerald-400">+${trail.pnl.toFixed(2)}</span>
                    </div>
                    <div className="text-muted-foreground">
                      Entry: ${trail.entry.toFixed(2)} → Current: ${trail.current.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}