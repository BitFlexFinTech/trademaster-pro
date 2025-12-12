import { useState, useEffect } from 'react';
import { Bot, Play, Square, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Target, Clock, Activity, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ExchangeConfig {
  name: string;
  maxLeverage: number;
  suggestedUSDT: number;
  confidence: 'High' | 'Medium' | 'Low';
  notes: string;
  evThreshold: number;
  spreadTrigger: number;
  obiThreshold: number;
  aggressorRatio: number;
}

const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  { name: 'Binance', maxLeverage: 20, suggestedUSDT: 1800, confidence: 'High', notes: 'Maker-first; deep books', evThreshold: 0.06, spreadTrigger: 1.3, obiThreshold: 2.0, aggressorRatio: 1.6 },
  { name: 'OKX', maxLeverage: 20, suggestedUSDT: 1400, confidence: 'High', notes: 'Solid borrow, good spreads', evThreshold: 0.06, spreadTrigger: 1.4, obiThreshold: 2.2, aggressorRatio: 1.6 },
  { name: 'Bybit', maxLeverage: 25, suggestedUSDT: 1200, confidence: 'Medium', notes: 'Watch taker cost drift', evThreshold: 0.07, spreadTrigger: 1.4, obiThreshold: 2.0, aggressorRatio: 1.7 },
  { name: 'Kraken', maxLeverage: 5, suggestedUSDT: 700, confidence: 'Medium', notes: 'Prefer maker entries only', evThreshold: 0.08, spreadTrigger: 1.5, obiThreshold: 2.3, aggressorRatio: 1.6 },
  { name: 'Nexo', maxLeverage: 3, suggestedUSDT: 500, confidence: 'Low', notes: 'Validate effective fees live', evThreshold: 0.09, spreadTrigger: 1.5, obiThreshold: 2.4, aggressorRatio: 1.7 },
];

export function GreenBackBot() {
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'spot' | 'leverage'>('spot');
  const [dailyTarget, setDailyTarget] = useState(40);
  const [profitPerTrade, setProfitPerTrade] = useState(1);
  const [leverages, setLeverages] = useState<Record<string, number>>({
    Binance: 5,
    OKX: 5,
    Bybit: 5,
    Kraken: 2,
    Nexo: 2,
  });
  const [activeExchange, setActiveExchange] = useState<string | null>(null);

  // Simulated metrics
  const [metrics, setMetrics] = useState({
    currentPnL: 22.5,
    tradesExecuted: 45,
    hitRate: 68.5,
    avgTimeToTP: 12.3,
    avgSlippage: 0.02,
    maxDrawdown: 3.2,
  });

  // Simulate active trading
  useEffect(() => {
    if (!isRunning) {
      setActiveExchange(null);
      return;
    }

    const exchanges = EXCHANGE_CONFIGS.map(e => e.name);
    let idx = 0;
    const interval = setInterval(() => {
      setActiveExchange(exchanges[idx % exchanges.length]);
      idx++;
      // Simulate metrics updates
      setMetrics(prev => ({
        ...prev,
        currentPnL: Math.min(prev.currentPnL + (Math.random() * 0.5 - 0.1), dailyTarget),
        tradesExecuted: prev.tradesExecuted + (Math.random() > 0.7 ? 1 : 0),
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning, dailyTarget]);

  const handleLeverageChange = (exchange: string, value: number[]) => {
    setLeverages(prev => ({ ...prev, [exchange]: value[0] }));
  };

  const progressPercent = (metrics.currentPnL / dailyTarget) * 100;
  const progressColor = progressPercent >= 75 ? 'bg-primary' : progressPercent >= 25 ? 'bg-warning' : 'bg-destructive';

  return (
    <div className="card-terminal p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Zap className="w-5 h-5 text-primary" />
            {isRunning && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              GreenBack
              {isRunning && activeExchange && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                        {activeExchange}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Active on {activeExchange}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">AI-Powered Scalping Bot</p>
          </div>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-xs">
          {isRunning ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Daily Progress</span>
          <span className="text-foreground font-mono">
            ${metrics.currentPnL.toFixed(2)} / ${dailyTarget.toFixed(2)}
          </span>
        </div>
        <Progress value={progressPercent} className={cn('h-2', progressColor)} />
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-secondary/50 p-2 rounded">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Trades
          </div>
          <p className="text-sm font-bold text-foreground font-mono">{metrics.tradesExecuted}</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3" />
            Hit Rate
          </div>
          <p className="text-sm font-bold text-primary font-mono">{metrics.hitRate.toFixed(1)}%</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Avg TP
          </div>
          <p className="text-sm font-bold text-foreground font-mono">{metrics.avgTimeToTP.toFixed(1)}s</p>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="mb-4">
        <label className="text-xs text-muted-foreground block mb-2">Trading Mode</label>
        <Select value={mode} onValueChange={(v: 'spot' | 'leverage') => setMode(v)} disabled={isRunning}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spot">Spot (Margin Scalps)</SelectItem>
            <SelectItem value="leverage">Leverage (Perpetuals)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leverage Sliders (only in leverage mode) */}
      {mode === 'leverage' && (
        <div className="mb-4 space-y-3">
          <label className="text-xs text-muted-foreground block">Exchange Leverage</label>
          {EXCHANGE_CONFIGS.map(ex => (
            <div key={ex.name} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-16">{ex.name}</span>
              <Slider
                value={[leverages[ex.name] || 1]}
                onValueChange={(v) => handleLeverageChange(ex.name, v)}
                min={1}
                max={ex.maxLeverage}
                step={1}
                disabled={isRunning}
                className="flex-1"
              />
              <span className="text-xs font-mono text-muted-foreground w-8">{leverages[ex.name]}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Editable Fields */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Daily Target ($)</label>
          <Input
            type="number"
            value={dailyTarget}
            onChange={(e) => setDailyTarget(Number(e.target.value))}
            disabled={isRunning}
            className="h-8 text-sm font-mono"
            min={10}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Profit/Trade ($)</label>
          <Input
            type="number"
            value={profitPerTrade}
            onChange={(e) => setProfitPerTrade(Math.max(0.1, Number(e.target.value)))}
            disabled={isRunning}
            className="h-8 text-sm font-mono"
            min={0.1}
            step={0.1}
          />
        </div>
      </div>

      {/* Pre-Start USDT Allocation Table */}
      {!isRunning && (
        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-2">Recommended USDT Allocation</label>
          <div className="bg-secondary/30 rounded overflow-hidden text-xs">
            <div className="grid grid-cols-4 gap-1 px-2 py-1 bg-muted/50 text-muted-foreground font-medium">
              <span>Exchange</span>
              <span>USDT</span>
              <span>Confidence</span>
              <span>Notes</span>
            </div>
            {EXCHANGE_CONFIGS.map(ex => (
              <div key={ex.name} className="grid grid-cols-4 gap-1 px-2 py-1.5 border-t border-border/50">
                <span className="text-foreground">{ex.name}</span>
                <span className="font-mono text-primary">${ex.suggestedUSDT}</span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-[9px] w-fit',
                    ex.confidence === 'High' && 'border-primary text-primary',
                    ex.confidence === 'Medium' && 'border-warning text-warning',
                    ex.confidence === 'Low' && 'border-muted-foreground text-muted-foreground'
                  )}
                >
                  {ex.confidence}
                </Badge>
                <span className="text-muted-foreground truncate">{ex.notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Start/Stop Button */}
      <Button
        className={cn('w-full gap-2', isRunning ? 'btn-outline-primary' : 'btn-primary')}
        onClick={() => setIsRunning(!isRunning)}
      >
        {isRunning ? (
          <>
            <Square className="w-4 h-4" />
            Stop GreenBack
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Start GreenBack
          </>
        )}
      </Button>

      {/* Risk Warning */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <AlertTriangle className="w-3 h-3 text-warning" />
        <span>Daily stop: -$5 | Time-stop: 5-45s | SL: -$0.60/trade</span>
      </div>
    </div>
  );
}