import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Settings, DollarSign, TrendingUp, Target, Zap, Gauge, AlertTriangle, Banknote } from 'lucide-react';
import { EXCHANGE_CONFIGS, TOP_PAIRS } from '@/lib/exchangeConfig';
import { cn } from '@/lib/utils';

export interface BotSettings {
  dailyTarget: number;
  dailyStopLoss: number;
  perTradeStopLoss: number;
  profitPerTrade: number;
  amountPerTrade: number;
  tradeIntervalMs: number;
  maxPositionSize: number;
  focusPairs: string[];
  leverageDefaults: Record<string, number>;
  autoSpeedAdjust: boolean;
  minProfitThreshold: number;
}

interface BotSettingsDrawerProps {
  settings: BotSettings;
  onSettingsChange: (settings: BotSettings) => void;
  disabled?: boolean;
}

export function BotSettingsDrawer({ settings, onSettingsChange, disabled }: BotSettingsDrawerProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<BotSettings>(settings);

  // Sync local state when prop settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    // Save to localStorage for persistence
    localStorage.setItem('greenback-bot-settings', JSON.stringify(localSettings));
    
    // Generate change summary
    const changes: string[] = [];
    if (settings.dailyStopLoss !== localSettings.dailyStopLoss) {
      changes.push(`Daily Stop: $${settings.dailyStopLoss} → $${localSettings.dailyStopLoss}`);
    }
    if (settings.profitPerTrade !== localSettings.profitPerTrade) {
      changes.push(`Profit/Trade: $${settings.profitPerTrade} → $${localSettings.profitPerTrade}`);
    }
    if (settings.focusPairs.length !== localSettings.focusPairs.length) {
      changes.push(`Focus Pairs: ${settings.focusPairs.length} → ${localSettings.focusPairs.length}`);
    }

    
    onSettingsChange(localSettings);
    setOpen(false);
    
    // Show confirmation toast with changes
    if (changes.length > 0) {
      import('sonner').then(({ toast }) => {
        toast.success('Bot Settings Updated', {
          description: changes.join(' • '),
        });
      });
    }
  };

  const handleLeverageChange = (exchange: string, value: number[]) => {
    setLocalSettings(prev => ({
      ...prev,
      leverageDefaults: {
        ...prev.leverageDefaults,
        [exchange]: value[0],
      },
    }));
  };

  const togglePair = (pair: string) => {
    setLocalSettings(prev => ({
      ...prev,
      focusPairs: prev.focusPairs.includes(pair)
        ? prev.focusPairs.filter(p => p !== pair)
        : [...prev.focusPairs, pair],
    }));
  };

  const selectAllPairs = () => {
    setLocalSettings(prev => ({ ...prev, focusPairs: [...TOP_PAIRS] }));
  };

  const deselectAllPairs = () => {
    setLocalSettings(prev => ({ ...prev, focusPairs: [] }));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          disabled={disabled}
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] sm:w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Bot Settings
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Stop Loss Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <DollarSign className="w-4 h-4 text-destructive" />
              Stop Loss Configuration
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Daily Stop Loss ($)</Label>
                <Input
                  type="number"
                  value={localSettings.dailyStopLoss}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    dailyStopLoss: parseFloat(e.target.value) || 5 
                  }))}
                  min={1}
                  step={0.5}
                  className="h-8 text-sm"
                />
                <span className="text-[10px] text-muted-foreground">Bot stops at -${localSettings.dailyStopLoss}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Per-Trade Stop ($)</Label>
                <Input
                  type="number"
                  value={localSettings.perTradeStopLoss}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    perTradeStopLoss: parseFloat(e.target.value) || 0.60 
                  }))}
                  min={0.10}
                  step={0.05}
                  className="h-8 text-sm"
                />
                <span className="text-[10px] text-muted-foreground">Max loss per trade</span>
              </div>
            </div>
          </div>

          {/* Position Size Configuration - PROMINENT */}
          <div className="space-y-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <DollarSign className="w-4 h-4 text-warning" />
              Max Position Size (Live Mode)
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Maximum Trade Size ($)</Label>
              <Input
                type="number"
                value={localSettings.maxPositionSize}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  maxPositionSize: Math.min(Math.max(parseFloat(e.target.value) || 100, 10), 1000)
                }))}
                min={10}
                max={1000}
                step={10}
                className="h-8 text-sm"
              />
              <Slider
                value={[localSettings.maxPositionSize]}
                min={10}
                max={1000}
                step={10}
                onValueChange={([value]) => setLocalSettings(prev => ({ ...prev, maxPositionSize: value }))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>$10</span>
                <span className="font-mono">${localSettings.maxPositionSize}</span>
                <span>$1000</span>
              </div>
              {localSettings.maxPositionSize > 100 && (
                <div className="flex items-center gap-1 text-[10px] text-warning mt-1">
                  <Zap className="w-3 h-3" />
                  Higher position sizes increase both profit potential and risk
                </div>
              )}
            </div>
          </div>

          {/* Adaptive Profit-Taking Threshold */}
          <div className="space-y-4 p-3 bg-primary/10 border border-primary/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="w-4 h-4 text-primary" />
              Adaptive Profit-Taking (Live)
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Take Profit When Above (% after fees)
              </Label>
              <Slider
                value={[localSettings.minProfitThreshold * 100]}
                min={0.01}
                max={0.5}
                step={0.01}
                onValueChange={([value]) => setLocalSettings(prev => ({ 
                  ...prev, 
                  minProfitThreshold: value / 100 
                }))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0.01%</span>
                <span className="font-mono text-primary">{(localSettings.minProfitThreshold * 100).toFixed(2)}%</span>
                <span>0.5%</span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                Bot will sell immediately when profit exceeds {(localSettings.minProfitThreshold * 100).toFixed(2)}% + fees.
                Lower = more frequent small profits. Higher = wait for bigger moves.
              </div>
            </div>
          </div>

          {/* Profit Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="w-4 h-4 text-primary" />
              Profit Configuration
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Profit Per Trade ($)</Label>
                <Input
                  type="number"
                  value={localSettings.profitPerTrade}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    profitPerTrade: parseFloat(e.target.value) || 1 
                  }))}
                  min={0.10}
                  step={0.10}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Amount Per Trade ($)</Label>
                <Input
                  type="number"
                  value={localSettings.amountPerTrade}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    amountPerTrade: parseFloat(e.target.value) || 5 
                  }))}
                  min={5}
                  step={1}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Trade Speed (ms)</Label>
                <Input
                  type="number"
                  value={localSettings.tradeIntervalMs}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    tradeIntervalMs: Math.max(100, Math.min(60000, parseInt(e.target.value) || 200))
                  }))}
                  min={100}
                  max={60000}
                  step={100}
                  className="h-8 text-sm"
                />
                <span className="text-[10px] text-muted-foreground">100-60000ms (Demo: 100+, Live: 5000+)</span>
              </div>
            </div>
          </div>
          {/* Auto Speed Adjustment Toggle */}
          <div className="space-y-4 p-3 bg-secondary/30 border border-border rounded-lg">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Gauge className="w-4 h-4 text-primary" />
              Speed Control
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Auto Speed Adjustment</Label>
                <span className="text-[10px] text-muted-foreground block">
                  Automatically slow down when hit rate drops below 95%
                </span>
              </div>
              <Switch
                checked={localSettings.autoSpeedAdjust}
                onCheckedChange={(checked) => setLocalSettings(prev => ({
                  ...prev,
                  autoSpeedAdjust: checked
                }))}
              />
            </div>
            
            {!localSettings.autoSpeedAdjust && (
              <div className="flex items-center gap-1 text-[10px] text-warning">
                <AlertTriangle className="w-3 h-3" />
                Manual mode: Trade speed will use your interval setting regardless of hit rate
              </div>
            )}
          </div>
          {/* Leverage Defaults */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="w-4 h-4 text-warning" />
              Leverage Defaults (for Leverage Mode)
            </div>
            
            <div className="space-y-3">
              {EXCHANGE_CONFIGS.map((config) => {
                const currentLeverage = localSettings.leverageDefaults[config.name] || 1;
                return (
                  <div key={config.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground">{config.name}</span>
                      <span className="text-xs font-mono text-primary">{currentLeverage}x / {config.maxLeverage}x</span>
                    </div>
                    <Slider
                      value={[currentLeverage]}
                      min={1}
                      max={config.maxLeverage}
                      step={1}
                      onValueChange={(value) => handleLeverageChange(config.name, value)}
                      className="w-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Focus Pairs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TrendingUp className="w-4 h-4 text-primary" />
                Focus Pairs
              </div>
              <div className="flex gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] px-2"
                  onClick={selectAllPairs}
                >
                  All
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] px-2"
                  onClick={deselectAllPairs}
                >
                  None
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-5 gap-2">
              {TOP_PAIRS.map((pair) => (
                <label
                  key={pair}
                  className={cn(
                    "flex items-center justify-center gap-1.5 p-2 rounded cursor-pointer transition-colors border",
                    localSettings.focusPairs.includes(pair)
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-secondary/50 border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Checkbox
                    checked={localSettings.focusPairs.includes(pair)}
                    onCheckedChange={() => togglePair(pair)}
                    className="hidden"
                  />
                  <span className="text-xs font-medium">{pair}</span>
                </label>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {localSettings.focusPairs.length} pairs selected
            </span>
          </div>

          {/* Save Button */}
          <div className="pt-4 border-t border-border">
            <Button onClick={handleSave} className="w-full">
              Save Settings
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
