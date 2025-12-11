import { useState } from 'react';
import { autoEarnStrategies } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Zap, Info, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function AutoEarn() {
  const [strategies, setStrategies] = useState(autoEarnStrategies);
  const [leverageMode, setLeverageMode] = useState<Record<number, boolean>>({});
  const [leverageAmount, setLeverageAmount] = useState<Record<number, number>>({});

  const activeCount = strategies.filter((s) => s.status === 'running').length;
  const totalDeployed = strategies.reduce((sum, s) => (s.status === 'running' ? sum + s.requiredUsdt : 0), 0);

  const getRiskBadge = (risk: string) => {
    const classes = {
      LOW: 'risk-low',
      MEDIUM: 'risk-medium',
      HIGH: 'risk-high',
    }[risk] || 'risk-low';
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded font-medium', classes)}>
        ○ {risk}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Auto Earn Strategies</h1>
          <span className="bg-secondary text-muted-foreground text-xs px-2 py-1 rounded">
            {activeCount}/{strategies.length} Active
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Total Deployed: <span className="text-foreground font-mono">${totalDeployed}</span></span>
          <span>24h Earnings: <span className="text-primary font-mono">$0</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map((strategy) => (
          <div key={strategy.id} className="card-terminal p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUpIcon className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">{strategy.name}</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{strategy.description}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className={strategy.type === 'CEX' ? 'badge-cex' : 'badge-defi'}>
                {strategy.type}
              </span>
            </div>

            <p className="text-sm text-muted-foreground mb-4">{strategy.description}</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-xs text-muted-foreground block">Exchange/Pool</span>
                <span className="text-sm text-foreground">{strategy.exchange}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Est. Daily Profit</span>
                <span className="text-sm text-primary font-mono">{strategy.dailyProfit}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Required USDT</span>
                <span className="text-sm text-foreground font-mono">${strategy.requiredUsdt.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Risk Score</span>
                {getRiskBadge(strategy.riskScore)}
              </div>
            </div>

            {strategy.maxLeverage > 1 && (
              <div className="mb-4 p-3 bg-secondary/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Spot Mode</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={leverageMode[strategy.id] || false}
                      onCheckedChange={(checked) =>
                        setLeverageMode({ ...leverageMode, [strategy.id]: checked })
                      }
                    />
                    <span className="text-xs text-muted-foreground">Max: {strategy.maxLeverage}x</span>
                  </div>
                </div>
                {leverageMode[strategy.id] && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-primary">Leverage: {leverageAmount[strategy.id] || 1}x</span>
                    <Slider
                      value={[leverageAmount[strategy.id] || 1]}
                      min={1}
                      max={strategy.maxLeverage}
                      step={1}
                      onValueChange={([value]) =>
                        setLeverageAmount({ ...leverageAmount, [strategy.id]: value })
                      }
                      className="flex-1"
                    />
                  </div>
                )}
              </div>
            )}

            <Button className="w-full btn-primary gap-2">
              <Play className="w-4 h-4" />
              Start Strategy
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendingUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
