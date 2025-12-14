import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings, DollarSign, TrendingUp, Target, Zap } from 'lucide-react';
import { EXCHANGE_CONFIGS, TOP_PAIRS } from '@/lib/exchangeConfig';
import { cn } from '@/lib/utils';

interface BotSettings {
  dailyStopLoss: number;
  perTradeStopLoss: number;
  profitPerTrade: number;
  amountPerTrade: number;
  focusPairs: string[];
  leverageDefaults: Record<string, number>;
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

  const handleSave = () => {
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
                    amountPerTrade: parseFloat(e.target.value) || 100 
                  }))}
                  min={10}
                  step={10}
                  className="h-8 text-sm"
                />
              </div>
            </div>
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
