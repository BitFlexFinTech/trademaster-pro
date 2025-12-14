import { useState, useEffect } from 'react';
import { useTradingMode, DEFAULT_DEMO_ALLOCATION } from '@/contexts/TradingModeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Wallet, RotateCcw, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function DemoPortfolioSettings() {
  const { virtualBalance, updateVirtualBalance, demoAllocation, setDemoAllocation } = useTradingMode();
  
  const [localBalance, setLocalBalance] = useState(virtualBalance);
  const [localAllocation, setLocalAllocation] = useState(demoAllocation);
  const [hasChanges, setHasChanges] = useState(false);

  // Calculate total allocation
  const totalAllocation = localAllocation.USDT + localAllocation.BTC + localAllocation.ETH + localAllocation.SOL;
  const isValidAllocation = Math.abs(totalAllocation - 100) < 0.01;

  useEffect(() => {
    setLocalBalance(virtualBalance);
  }, [virtualBalance]);

  useEffect(() => {
    setLocalAllocation(demoAllocation);
  }, [demoAllocation]);

  useEffect(() => {
    const balanceChanged = localBalance !== virtualBalance;
    const allocationChanged = 
      localAllocation.USDT !== demoAllocation.USDT ||
      localAllocation.BTC !== demoAllocation.BTC ||
      localAllocation.ETH !== demoAllocation.ETH ||
      localAllocation.SOL !== demoAllocation.SOL;
    setHasChanges(balanceChanged || allocationChanged);
  }, [localBalance, localAllocation, virtualBalance, demoAllocation]);

  const handleAllocationChange = (asset: keyof typeof localAllocation, value: number) => {
    const newAllocation = { ...localAllocation, [asset]: value };
    setLocalAllocation(newAllocation);
  };

  const handleSave = () => {
    if (!isValidAllocation) {
      toast.error('Allocation must sum to 100%');
      return;
    }

    // Update virtual balance (this triggers sync)
    updateVirtualBalance(localBalance);
    
    // Update allocation
    setDemoAllocation(localAllocation);

    toast.success('Demo settings saved', {
      description: `Virtual balance: $${localBalance.toLocaleString()}`,
    });
  };

  const handleReset = () => {
    setLocalBalance(1000);
    setLocalAllocation(DEFAULT_DEMO_ALLOCATION);
  };

  const assets = [
    { key: 'USDT' as const, name: 'USDT', color: 'bg-green-500' },
    { key: 'BTC' as const, name: 'Bitcoin', color: 'bg-orange-500' },
    { key: 'ETH' as const, name: 'Ethereum', color: 'bg-blue-500' },
    { key: 'SOL' as const, name: 'Solana', color: 'bg-purple-500' },
  ];

  return (
    <Card className="card-terminal">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wallet className="w-4 h-4 text-primary" />
          Demo Portfolio Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Virtual Balance Input */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Virtual Balance (USD)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={localBalance}
              onChange={(e) => setLocalBalance(Number(e.target.value))}
              className="font-mono"
              min={100}
              max={1000000}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocalBalance(1000)}
              className="whitespace-nowrap"
            >
              Reset to $1,000
            </Button>
          </div>
        </div>

        {/* Allocation Sliders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Portfolio Allocation</Label>
            <span className={cn(
              "text-xs font-mono",
              isValidAllocation ? "text-primary" : "text-destructive"
            )}>
              {totalAllocation.toFixed(0)}% / 100%
            </span>
          </div>

          {!isValidAllocation && (
            <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 p-2 rounded">
              <AlertCircle className="w-3 h-3" />
              Allocation must sum to 100%
            </div>
          )}

          {assets.map((asset) => (
            <div key={asset.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2 h-2 rounded-full", asset.color)} />
                  <span className="text-xs text-foreground">{asset.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    ${((localBalance * localAllocation[asset.key]) / 100).toFixed(0)}
                  </span>
                  <span className="text-xs font-mono w-12 text-right text-primary">
                    {localAllocation[asset.key]}%
                  </span>
                </div>
              </div>
              <Slider
                value={[localAllocation[asset.key]]}
                onValueChange={([value]) => handleAllocationChange(asset.key, value)}
                max={100}
                min={0}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>

        {/* Allocation Preview Bar */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Allocation Preview</Label>
          <div className="h-3 rounded-full overflow-hidden flex">
            {assets.map((asset) => (
              <div
                key={asset.key}
                className={cn("h-full transition-all", asset.color)}
                style={{ width: `${localAllocation[asset.key]}%` }}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1 gap-2"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !isValidAllocation}
            className="flex-1 gap-2 btn-primary"
          >
            <Save className="w-3 h-3" />
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
