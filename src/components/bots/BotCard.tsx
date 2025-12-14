import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign, Clock, AlertTriangle, Banknote, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BotCardProps {
  botType: 'spot' | 'leverage';
  existingBot: any;
  prices: Array<{ symbol: string; price: number; change_24h?: number }>;
  onStartBot: (botName: string, mode: 'spot' | 'leverage', dailyTarget: number, profitPerTrade: number) => Promise<any>;
  onStopBot: (botId: string) => Promise<void>;
  onUpdateBotPnl: (botId: string, pnl: number, trades: number, hitRate: number) => Promise<void>;
  suggestedUSDT: number;
  usdtFloat: Array<{ exchange: string; amount: number }>;
}

export function BotCard({
  botType,
  existingBot,
  prices,
  onStartBot,
  onStopBot,
  onUpdateBotPnl,
  suggestedUSDT,
  usdtFloat,
}: BotCardProps) {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance, setVirtualBalance, resetTrigger } = useTradingMode();
  const { notifyTrade, notifyTakeProfit } = useNotifications();

  const isRunning = !!existingBot;
  const botName = botType === 'spot' ? 'GreenBack Spot' : 'GreenBack Leverage';

  const [dailyTarget, setDailyTarget] = useState(existingBot?.dailyTarget || 40);
  const [profitPerTrade, setProfitPerTrade] = useState(existingBot?.profitPerTrade || 1);
  const [leverages, setLeverages] = useState<Record<string, number>>({
    Binance: 5, OKX: 5, Bybit: 5, Kraken: 2, Nexo: 2,
  });
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const [metrics, setMetrics] = useState({
    currentPnL: existingBot?.currentPnl || 0,
    tradesExecuted: existingBot?.tradesExecuted || 0,
    hitRate: existingBot?.hitRate || 0,
    avgTimeToTP: 12.3,
    maxDrawdown: existingBot?.maxDrawdown || 0,
  });

  const lastPricesRef = useRef<Record<string, number>>({});

  // Listen to reset trigger - reset local state
  useEffect(() => {
    if (resetTrigger > 0) {
      setMetrics({
        currentPnL: 0,
        tradesExecuted: 0,
        hitRate: 0,
        avgTimeToTP: 12.3,
        maxDrawdown: 0,
      });
      setActiveExchange(null);
      lastPricesRef.current = {};
    }
  }, [resetTrigger]);

  // Sync with existing bot
  useEffect(() => {
    if (existingBot) {
      setMetrics({
        currentPnL: existingBot.currentPnl,
        tradesExecuted: existingBot.tradesExecuted,
        hitRate: existingBot.hitRate,
        avgTimeToTP: 12.3,
        maxDrawdown: existingBot.maxDrawdown || 0,
      });
      setDailyTarget(existingBot.dailyTarget);
      setProfitPerTrade(existingBot.profitPerTrade);
    }
  }, [existingBot]);

  // Trading simulation
  useEffect(() => {
    if (!isRunning || !existingBot) {
      setActiveExchange(null);
      return;
    }

    const activeExchanges = tradingMode === 'demo'
      ? EXCHANGE_CONFIGS.map(e => e.name)
      : usdtFloat.filter(e => e.amount > 0).map(e => e.exchange);

    if (activeExchanges.length === 0) return;

    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let idx = 0;
    const interval = setInterval(async () => {
      // CRITICAL: Enforce daily stop loss at -$5
      if (metrics.currentPnL <= -5) {
        const { toast } = await import('sonner');
        toast.error('⚠️ Daily Stop Loss Hit', {
          description: 'GreenBack stopped: -$5 daily limit reached.',
        });
        onStopBot(existingBot.id);
        return;
      }

      const currentExchange = activeExchanges[idx % activeExchanges.length];
      setActiveExchange(currentExchange);
      idx++;

      const symbol = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
      const priceData = prices.find(p => p.symbol.toUpperCase() === symbol);
      if (!priceData) return;

      const currentPrice = priceData.price;
      const lastPrice = lastPricesRef.current[symbol] || currentPrice;
      const priceChange = lastPrice > 0 ? ((currentPrice - lastPrice) / lastPrice) * 100 : 0;
      lastPricesRef.current[symbol] = currentPrice;

      if (Math.abs(priceChange) < 0.001) return;

      const direction = priceChange >= 0 ? 'long' : 'short';
      const isWin = Math.random() < 0.70;
      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      const tradePnl = isWin ? profitPerTrade * (botType === 'leverage' ? Math.min(leverage / 5, 2) : 1) : -0.60;
      const pair = `${symbol}/USDT`;

      setMetrics(prev => {
        const newPnl = Math.min(Math.max(prev.currentPnL + tradePnl, -5), dailyTarget * 1.5);
        const newTrades = prev.tradesExecuted + 1;
        const wins = Math.round(prev.hitRate * prev.tradesExecuted / 100) + (isWin ? 1 : 0);
        const newHitRate = newTrades > 0 ? (wins / newTrades) * 100 : 0;
        const newMaxDrawdown = Math.min(prev.maxDrawdown, newPnl < 0 ? newPnl : prev.maxDrawdown);

        // Calculate exit price correctly based on position size and P&L
        const positionSize = 100;
        const priceChangePercent = tradePnl / (positionSize * leverage);
        const exitPrice = direction === 'long'
          ? currentPrice * (1 + priceChangePercent)
          : currentPrice * (1 - priceChangePercent);

        if (user) {
          supabase.from('trades').insert({
            user_id: user.id,
            pair,
            direction,
            entry_price: currentPrice,
            exit_price: exitPrice,
            amount: 100,
            leverage,
            profit_loss: tradePnl,
            profit_percentage: (tradePnl / 100) * 100,
            exchange_name: currentExchange,
            is_sandbox: tradingMode === 'demo',
            status: 'closed',
            closed_at: new Date().toISOString(),
          }).then(({ error }) => {
            if (error) console.error('Failed to log trade:', error);
          });
        }

        notifyTrade(currentExchange, pair, direction, tradePnl);

        if (isWin && Math.random() > 0.6) {
          const tpLevel = Math.ceil(Math.random() * 3);
          setTimeout(() => notifyTakeProfit(tpLevel, pair, tradePnl * (tpLevel / 3)), 500);
        }

        if (tradingMode === 'demo') {
          setVirtualBalance(prev => prev + tradePnl);
        }

        onUpdateBotPnl(existingBot.id, newPnl, newTrades, newHitRate);

        return {
          ...prev,
          currentPnL: newPnl,
          tradesExecuted: newTrades,
          hitRate: newHitRate,
          maxDrawdown: newMaxDrawdown,
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning, tradingMode, dailyTarget, profitPerTrade, existingBot, prices, leverages, botType, user, notifyTrade, notifyTakeProfit, onUpdateBotPnl, setVirtualBalance, usdtFloat]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      await onStopBot(existingBot.id);
      setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0 });
    } else {
      await onStartBot(botName, botType, dailyTarget, profitPerTrade);
    }
  };

  const handleWithdrawProfits = async () => {
    if (metrics.currentPnL <= 0) return;
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-bot-profits', {
        body: { botId: existingBot?.id }
      });
      if (error) throw error;
      
      // Reset local P&L after successful withdrawal
      setMetrics(prev => ({ ...prev, currentPnL: 0 }));
      
      // Show success notification via sonner
      const { toast } = await import('sonner');
      toast.success(`💰 Withdrew $${data?.withdrawnAmount?.toFixed(2) || metrics.currentPnL.toFixed(2)}`);
    } catch (err) {
      console.error('Withdraw failed:', err);
      const { toast } = await import('sonner');
      toast.error('Withdrawal failed. Try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  const progressPercent = (metrics.currentPnL / dailyTarget) * 100;

  return (
    <div className="card-terminal p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap className="w-5 h-5 text-primary" />
            {isRunning && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />}
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              {botName}
              {isRunning && activeExchange && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-[9px] flex items-center gap-1 animate-pulse">
                        <span className="w-1 h-1 bg-primary rounded-full" />
                        {activeExchange}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Trading on {activeExchange}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {botType === 'spot' ? 'Spot Trading Only' : 'Leverage Trading (1-25x)'}
            </p>
          </div>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[10px]">
          {isRunning ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Daily Progress</span>
          <span className="text-foreground font-mono">${metrics.currentPnL.toFixed(2)} / ${dailyTarget}</span>
        </div>
        <Progress value={Math.min(progressPercent, 100)} className="h-2" />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-secondary/50 p-2 rounded text-center">
          <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <DollarSign className="w-2.5 h-2.5" /> P&L
          </div>
          <p className={cn('text-sm font-bold font-mono', metrics.currentPnL >= 0 ? 'text-primary' : 'text-destructive')}>
            ${metrics.currentPnL.toFixed(2)}
          </p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <Activity className="w-2.5 h-2.5" /> Trades
          </div>
          <p className="text-sm font-bold text-foreground font-mono">{metrics.tradesExecuted}</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <Target className="w-2.5 h-2.5" /> Hit Rate
          </div>
          <p className="text-sm font-bold text-primary font-mono">{metrics.hitRate.toFixed(1)}%</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="w-2.5 h-2.5" /> Avg TP
          </div>
          <p className="text-sm font-bold text-foreground font-mono">{metrics.avgTimeToTP.toFixed(1)}s</p>
        </div>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Daily Target ($)</label>
          <Input
            type="number"
            value={dailyTarget}
            onChange={(e) => setDailyTarget(Number(e.target.value))}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={10}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Profit/Trade ($)</label>
          <Input
            type="number"
            value={profitPerTrade}
            onChange={(e) => setProfitPerTrade(Math.max(0.1, Number(e.target.value)))}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={0.1}
            step={0.1}
          />
        </div>
      </div>

      {/* Leverage Sliders (only for leverage bot) */}
      {botType === 'leverage' && (
        <div className="mb-3 space-y-2">
          <label className="text-[10px] text-muted-foreground block">Exchange Leverage</label>
          {EXCHANGE_CONFIGS.map(ex => (
            <div key={ex.name} className="flex items-center gap-2">
              <span className="text-[10px] text-foreground w-14">{ex.name}</span>
              <Slider
                value={[leverages[ex.name] || 1]}
                onValueChange={(v) => setLeverages(prev => ({ ...prev, [ex.name]: v[0] }))}
                min={1}
                max={ex.maxLeverage}
                step={1}
                disabled={isRunning}
                className="flex-1"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-6">{leverages[ex.name]}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended USDT Allocation */}
      {!isRunning && (
        <div className="mb-3 flex-1 min-h-0">
          <label className="text-[10px] text-muted-foreground block mb-2">
            Recommended USDT: ${suggestedUSDT.toLocaleString()}
          </label>
          <div className="bg-secondary/30 rounded overflow-hidden text-[10px]">
            <div className="grid grid-cols-3 gap-1 px-2 py-1.5 bg-muted/50 text-muted-foreground font-medium">
              <span>Exchange</span>
              <span>USDT</span>
              <span>Confidence</span>
            </div>
            {EXCHANGE_CONFIGS.slice(0, 3).map(ex => {
              const allocation = Math.round(suggestedUSDT * EXCHANGE_ALLOCATION_PERCENTAGES[ex.confidence]);
              return (
                <div key={ex.name} className="grid grid-cols-3 gap-1 px-2 py-1 border-t border-border/50">
                  <span className="text-foreground">{ex.name}</span>
                  <span className="font-mono text-primary">${allocation.toLocaleString()}</span>
                  <Badge variant="outline" className={cn('text-[8px] w-fit h-4',
                    ex.confidence === 'High' && 'border-primary text-primary',
                    ex.confidence === 'Medium' && 'border-warning text-warning',
                  )}>
                    {ex.confidence}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mt-auto">
        <Button
          className={cn('flex-1 gap-2', isRunning ? 'btn-outline-primary' : 'btn-primary')}
          onClick={handleStartStop}
        >
          {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'Stop' : 'Start'}
        </Button>
        {metrics.currentPnL > 0 && (
          <Button variant="outline" className="gap-1" onClick={handleWithdrawProfits} disabled={withdrawing}>
            {withdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
            ${metrics.currentPnL.toFixed(2)}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[8px] text-muted-foreground">
        <AlertTriangle className="w-2.5 h-2.5 text-warning" />
        <span>Daily stop: -$5 | SL: -$0.60/trade</span>
      </div>
    </div>
  );
}
