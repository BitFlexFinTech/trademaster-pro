import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Bot, 
  DollarSign, 
  TrendingUp, 
  Target, 
  Shield, 
  Gauge, 
  Zap,
  ChevronDown,
  RotateCcw,
  Loader2,
  Save
} from 'lucide-react';
import { useJarvisSettings, DEFAULT_JARVIS_SETTINGS } from '@/hooks/useJarvisSettings';

export function JarvisSettingsPanel() {
  const { settings, isLoading, isSaving, updateSettings, resetToDefaults } = useJarvisSettings();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    capital: true,
    regime: false,
    targets: false,
    rate: false,
    liquidation: false,
    yield: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Loading JARVIS settings...</span>
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  const effectiveSize = settings.base_capital * settings.leverage;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <CardTitle>JARVIS Engine Settings</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            disabled={isSaving}
            className="gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </Button>
        </div>
        <CardDescription>
          Configure the autonomous quant engine for Binance Futures hedge mode trading.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section 1: Capital & Leverage */}
        <Collapsible open={openSections.capital} onOpenChange={() => toggleSection('capital')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="font-medium">Capital & Leverage</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.capital ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Capital (USDT)</Label>
                <Input
                  type="number"
                  value={settings.base_capital}
                  onChange={(e) => updateSettings({ base_capital: parseFloat(e.target.value) || 0 })}
                  min={10}
                  max={10000}
                />
                <p className="text-xs text-muted-foreground">Starting capital for position sizing</p>
              </div>
              
              <div className="space-y-2">
                <Label>Leverage: {settings.leverage}x</Label>
                <Slider
                  value={[settings.leverage]}
                  onValueChange={([val]) => updateSettings({ leverage: val })}
                  min={1}
                  max={10}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Effective size: <span className="text-primary font-medium">${effectiveSize.toFixed(2)}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Label>Hedge Mode</Label>
                  <span className="text-xs text-muted-foreground">(Concurrent Long/Short)</span>
                </div>
                <Switch
                  checked={settings.hedge_mode_enabled}
                  onCheckedChange={(checked) => updateSettings({ hedge_mode_enabled: checked })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Margin Type</Label>
                <Select
                  value={settings.margin_type}
                  onValueChange={(val) => updateSettings({ margin_type: val as 'ISOLATED' | 'CROSSED' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ISOLATED">Isolated</SelectItem>
                    <SelectItem value="CROSSED">Cross</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 2: Regime Detection */}
        <Collapsible open={openSections.regime} onOpenChange={() => toggleSection('regime')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="font-medium">Regime Detection (200 EMA)</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.regime ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BULL Threshold: {(settings.regime_bull_ema_deviation * 100).toFixed(1)}%</Label>
                <Slider
                  value={[settings.regime_bull_ema_deviation * 100]}
                  onValueChange={([val]) => updateSettings({ regime_bull_ema_deviation: val / 100 })}
                  min={0.1}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">Price above EMA triggers BULL regime</p>
              </div>
              
              <div className="space-y-2">
                <Label>BEAR Threshold: {(settings.regime_bear_ema_deviation * 100).toFixed(1)}%</Label>
                <Slider
                  value={[Math.abs(settings.regime_bear_ema_deviation) * 100]}
                  onValueChange={([val]) => updateSettings({ regime_bear_ema_deviation: -val / 100 })}
                  min={0.1}
                  max={2}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground">Price below EMA triggers BEAR regime</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">BULL</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">BEAR</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm">CHOP (within thresholds)</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 3: Profit Targets */}
        <Collapsible open={openSections.targets} onOpenChange={() => toggleSection('targets')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-purple-500" />
              <span className="font-medium">Profit Targets per Regime</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.targets ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  BULL Target ($)
                </Label>
                <Input
                  type="number"
                  value={settings.target_bull_profit}
                  onChange={(e) => updateSettings({ target_bull_profit: parseFloat(e.target.value) || 0 })}
                  min={0.10}
                  max={10}
                  step={0.10}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  BEAR Target ($)
                </Label>
                <Input
                  type="number"
                  value={settings.target_bear_profit}
                  onChange={(e) => updateSettings({ target_bear_profit: parseFloat(e.target.value) || 0 })}
                  min={0.10}
                  max={10}
                  step={0.10}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  CHOP Target ($)
                </Label>
                <Input
                  type="number"
                  value={settings.target_chop_profit}
                  onChange={(e) => updateSettings({ target_chop_profit: parseFloat(e.target.value) || 0 })}
                  min={0.10}
                  max={10}
                  step={0.10}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 4: RateSentinel */}
        <Collapsible open={openSections.rate} onOpenChange={() => toggleSection('rate')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-orange-500" />
              <span className="font-medium">RateSentinel (API Load)</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.rate ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Request Interval: {settings.rate_request_interval_ms / 1000}s</Label>
                <Slider
                  value={[settings.rate_request_interval_ms / 1000]}
                  onValueChange={([val]) => updateSettings({ rate_request_interval_ms: val * 1000 })}
                  min={1}
                  max={10}
                  step={0.5}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Cooldown Threshold: {(settings.rate_cooldown_threshold * 100).toFixed(0)}%</Label>
                <Slider
                  value={[settings.rate_cooldown_threshold * 100]}
                  onValueChange={([val]) => updateSettings({ rate_cooldown_threshold: val / 100 })}
                  min={50}
                  max={95}
                  step={5}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Cooldown Duration: {settings.rate_cooldown_duration_ms / 1000}s</Label>
                <Slider
                  value={[settings.rate_cooldown_duration_ms / 1000]}
                  onValueChange={([val]) => updateSettings({ rate_cooldown_duration_ms: val * 1000 })}
                  min={30}
                  max={120}
                  step={10}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 5: LiquidationSentinel */}
        <Collapsible open={openSections.liquidation} onOpenChange={() => toggleSection('liquidation')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              <span className="font-medium">LiquidationSentinel (Distance)</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.liquidation ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Min Distance: {settings.liquidation_min_distance_percent}%</Label>
                <Slider
                  value={[settings.liquidation_min_distance_percent]}
                  onValueChange={([val]) => updateSettings({ liquidation_min_distance_percent: val })}
                  min={15}
                  max={30}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">Block trades below this</p>
              </div>
              
              <div className="space-y-2">
                <Label>Warning: {settings.liquidation_warning_threshold}%</Label>
                <Slider
                  value={[settings.liquidation_warning_threshold]}
                  onValueChange={([val]) => updateSettings({ liquidation_warning_threshold: val })}
                  min={20}
                  max={35}
                  step={1}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Critical: {settings.liquidation_critical_threshold}%</Label>
                <Slider
                  value={[settings.liquidation_critical_threshold]}
                  onValueChange={([val]) => updateSettings({ liquidation_critical_threshold: val })}
                  min={18}
                  max={25}
                  step={1}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 6: Yield Optimizer */}
        <Collapsible open={openSections.yield} onOpenChange={() => toggleSection('yield')}>
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span className="font-medium">Yield Optimizer</span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${openSections.yield ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fast Close Threshold: {settings.yield_fast_close_threshold_ms / 60000}min</Label>
                <Slider
                  value={[settings.yield_fast_close_threshold_ms / 60000]}
                  onValueChange={([val]) => updateSettings({ yield_fast_close_threshold_ms: val * 60000 })}
                  min={1}
                  max={15}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">Suggest increase if trades close faster</p>
              </div>
              
              <div className="space-y-2">
                <Label>Stall Threshold: {settings.yield_stall_threshold_ms / 3600000}hr</Label>
                <Slider
                  value={[settings.yield_stall_threshold_ms / 3600000]}
                  onValueChange={([val]) => updateSettings({ yield_stall_threshold_ms: val * 3600000 })}
                  min={1}
                  max={4}
                  step={0.5}
                />
                <p className="text-xs text-muted-foreground">Suggest decrease if trades take longer</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Increase %: {settings.yield_suggest_increase_pct}%</Label>
                <Slider
                  value={[settings.yield_suggest_increase_pct]}
                  onValueChange={([val]) => updateSettings({ yield_suggest_increase_pct: val })}
                  min={10}
                  max={50}
                  step={5}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Decrease %: {settings.yield_suggest_decrease_pct}%</Label>
                <Slider
                  value={[settings.yield_suggest_decrease_pct]}
                  onValueChange={([val]) => updateSettings({ yield_suggest_decrease_pct: val })}
                  min={10}
                  max={50}
                  step={5}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div>
                <Label>Auto-Apply Suggestions</Label>
                <p className="text-xs text-muted-foreground">Automatically adjust targets based on analysis</p>
              </div>
              <Switch
                checked={settings.yield_auto_apply}
                onCheckedChange={(checked) => updateSettings({ yield_auto_apply: checked })}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Save indicator */}
        {isSaving && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
