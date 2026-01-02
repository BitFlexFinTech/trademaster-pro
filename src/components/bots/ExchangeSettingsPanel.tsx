import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings, Save, RotateCcw } from 'lucide-react';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExchangeConfig {
  enabled: boolean;
  positionSize: number;
  profitTarget: number;
  maxConcurrentTrades: number;
}

const DEFAULT_CONFIG: ExchangeConfig = {
  enabled: true,
  positionSize: 333,
  profitTarget: 1.00,
  maxConcurrentTrades: 3,
};

export function ExchangeSettingsPanel() {
  const { connectedExchangeNames } = useConnectedExchanges();
  const [configs, setConfigs] = useState<Record<string, ExchangeConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('exchange-settings');
    if (saved) {
      try {
        setConfigs(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // Initialize configs for connected exchanges
  useEffect(() => {
    setConfigs(prev => {
      const updated = { ...prev };
      connectedExchangeNames.forEach(ex => {
        if (!updated[ex]) {
          updated[ex] = { ...DEFAULT_CONFIG };
        }
      });
      return updated;
    });
  }, [connectedExchangeNames]);

  const updateConfig = (exchange: string, field: keyof ExchangeConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [exchange]: { ...prev[exchange], [field]: value }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem('exchange-settings', JSON.stringify(configs));
    setHasChanges(false);
    toast.success('Exchange settings saved');
  };

  const handleReset = () => {
    const reset: Record<string, ExchangeConfig> = {};
    connectedExchangeNames.forEach(ex => {
      reset[ex] = { ...DEFAULT_CONFIG };
    });
    setConfigs(reset);
    setHasChanges(true);
  };

  if (connectedExchangeNames.length === 0) {
    return (
      <Card className="card-terminal">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Exchange Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Connect an exchange to configure settings
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Exchange Settings
            {hasChanges && (
              <Badge variant="secondary" className="text-[9px]">Unsaved</Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={handleReset}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              className="h-6 gap-1"
              onClick={handleSave}
              disabled={!hasChanges}
            >
              <Save className="h-3 w-3" />
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {connectedExchangeNames.map(exchange => {
          const config = configs[exchange] || DEFAULT_CONFIG;
          return (
            <div 
              key={exchange} 
              className={cn(
                "p-3 rounded-lg border transition-colors",
                config.enabled 
                  ? "border-primary/30 bg-primary/5" 
                  : "border-muted bg-muted/30 opacity-60"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">{exchange}</span>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${exchange}-enabled`} className="text-xs">Active</Label>
                  <Switch
                    id={`${exchange}-enabled`}
                    checked={config.enabled}
                    onCheckedChange={(v) => updateConfig(exchange, 'enabled', v)}
                  />
                </div>
              </div>

              {config.enabled && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Position Size ($)</Label>
                    <Input
                      type="number"
                      value={config.positionSize}
                      onChange={(e) => updateConfig(exchange, 'positionSize', Number(e.target.value))}
                      className="h-7 text-xs"
                      min={10}
                      max={1000}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Profit Target ($)</Label>
                    <Input
                      type="number"
                      value={config.profitTarget}
                      onChange={(e) => updateConfig(exchange, 'profitTarget', Number(e.target.value))}
                      className="h-7 text-xs"
                      min={0.5}
                      max={10}
                      step={0.1}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Max Trades</Label>
                    <Input
                      type="number"
                      value={config.maxConcurrentTrades}
                      onChange={(e) => updateConfig(exchange, 'maxConcurrentTrades', Number(e.target.value))}
                      className="h-7 text-xs"
                      min={1}
                      max={10}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
