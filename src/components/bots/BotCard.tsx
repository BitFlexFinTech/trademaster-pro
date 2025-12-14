import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign, Clock, AlertTriangle, Banknote, Loader2, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { supabase } from '@/integrations/supabase/client';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';
import { calculateNetProfit, MIN_NET_PROFIT } from '@/lib/exchangeFees';
import { generateSignalScore, meetsHitRateCriteria, calculateWinProbability } from '@/lib/technicalAnalysis';
import { demoDataStore } from '@/lib/demoDataStore';
import { hitRateTracker } from '@/lib/sandbox/hitRateTracker';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type TradingStrategy = 'profit' | 'signal';

interface BotCardProps {
  botType: 'spot' | 'leverage';
  existingBot: any;
  prices: Array<{ symbol: string; price: number; change_24h?: number }>;
  onStartBot: (botName: string, mode: 'spot' | 'leverage', dailyTarget: number, profitPerTrade: number, isSandbox: boolean) => Promise<any>;
  onStopBot: (botId: string) => Promise<void>;
  onUpdateBotPnl: (botId: string, pnl: number, trades: number, hitRate: number) => Promise<void>;
  suggestedUSDT: number;
  usdtFloat: Array<{ exchange: string; amount: number }>;
  dailyStopLoss?: number;
  perTradeStopLoss?: number;
  onConfigChange?: (key: string, value: number) => void;
  isAnyBotRunning?: boolean;
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
  dailyStopLoss = 5,
  perTradeStopLoss = 0.60,
  onConfigChange,
  isAnyBotRunning = false,
}: BotCardProps) {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance, setVirtualBalance, resetTrigger } = useTradingMode();
  const { notifyTrade, notifyTakeProfit, notifyDailyProgress, resetProgressNotifications } = useNotifications();

  const isRunning = existingBot?.status === 'running';
  const botName = botType === 'spot' ? 'GreenBack Spot' : 'GreenBack Leverage';

  const [dailyTarget, setDailyTarget] = useState(existingBot?.dailyTarget || 100);
  const [profitPerTrade, setProfitPerTrade] = useState(Math.max(existingBot?.profitPerTrade || 0.50, 0.10));
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
    tradesPerMinute: 0,
  });

  const [tradingStrategy, setTradingStrategy] = useState<TradingStrategy>('profit');
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const lastPricesRef = useRef<Record<string, number>>({});
  const priceHistoryRef = useRef<Map<string, { prices: number[], volumes: number[] }>>(new Map());
  const tradeTimestampsRef = useRef<number[]>([]);
  // Listen to reset trigger - reset local state
  useEffect(() => {
    if (resetTrigger > 0) {
      setMetrics({
        currentPnL: 0,
        tradesExecuted: 0,
        hitRate: 0,
        avgTimeToTP: 12.3,
        maxDrawdown: 0,
        tradesPerMinute: 0,
      });
      setActiveExchange(null);
      lastPricesRef.current = {};
      priceHistoryRef.current.clear();
      tradeTimestampsRef.current = [];
      resetProgressNotifications();
    }
  }, [resetTrigger, resetProgressNotifications]);

  // Sync with existing bot
  useEffect(() => {
    if (existingBot) {
      setMetrics({
        currentPnL: existingBot.currentPnl,
        tradesExecuted: existingBot.tradesExecuted,
        hitRate: existingBot.hitRate,
        avgTimeToTP: 12.3,
        maxDrawdown: existingBot.maxDrawdown || 0,
        tradesPerMinute: 0,
      });
      setDailyTarget(existingBot.dailyTarget);
      setProfitPerTrade(existingBot.profitPerTrade);
    }
  }, [existingBot]);

  // ===== TRADING LOGIC =====
  // LIVE MODE: No local simulation - data comes from edge function via Realtime
  // DEMO MODE: Local simulation for fast trading
  useEffect(() => {
    if (!isRunning || !existingBot) {
      setActiveExchange(null);
      return;
    }

    // ===== LIVE MODE: Execute real trades via edge function =====
    if (tradingMode === 'live') {
      console.log('🔴 LIVE MODE: Executing real trades via edge function every 5 seconds');
      
      let isCancelled = false;
      
      const executeLiveTrade = async () => {
        if (isCancelled) return;
        
        try {
          console.log('📤 Calling execute-bot-trade edge function...');
          const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
            body: {
              botId: existingBot.id,
              mode: botType,
              profitTarget: profitPerTrade,
              exchanges: EXCHANGE_CONFIGS.map(e => e.name),
              leverages,
              isSandbox: false,
              maxPositionSize: 100, // TODO: Pass from settings
            }
          });
          
          if (error) {
            console.error('❌ Live trade error:', error);
            return;
          }
          
          console.log('✅ Live trade result:', data);
          
          // Update active exchange indicator
          if (data?.exchange) {
            setActiveExchange(data.exchange);
          }
          
          // Notify on trade
          if (data?.pair && data?.direction) {
            notifyTrade(data.exchange, data.pair, data.direction, data.pnl || 0);
          }
        } catch (err) {
          console.error('❌ Failed to execute live trade:', err);
        }
      };
      
      // Execute first trade immediately, then every 5 seconds
      executeLiveTrade();
      const interval = setInterval(executeLiveTrade, 5000);
      
      return () => {
        console.log('🛑 STOPPING: Live trade execution loop cleanup');
        isCancelled = true;
        clearInterval(interval);
      };
    }

    // ===== DEMO MODE: Local simulation =====
    console.log('🟢 DEMO MODE: Running local trading simulation');
    
    const activeExchanges = EXCHANGE_CONFIGS.map(e => e.name);
    if (activeExchanges.length === 0) return;

    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let idx = 0;
    const interval = setInterval(async () => {
      // CRITICAL: Enforce daily stop loss (configurable, default -$5)
      if (metrics.currentPnL <= -dailyStopLoss) {
        const { toast } = await import('sonner');
        toast.error('⚠️ Daily Stop Loss Hit', {
          description: `GreenBack stopped: -$${dailyStopLoss} daily limit reached.`,
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

      // Build price history for AI signal mode
      const history = priceHistoryRef.current.get(symbol) || { prices: [], volumes: [] };
      history.prices.push(currentPrice);
      history.volumes.push(1000000);
      if (history.prices.length > 30) {
        history.prices.shift();
        history.volumes.shift();
      }
      priceHistoryRef.current.set(symbol, history);

      let direction: 'long' | 'short';
      let isWin: boolean;
      
      if (tradingStrategy === 'signal') {
        if (history.prices.length < 26) return;
        const signal = generateSignalScore(history.prices, history.volumes);
        if (!signal || !meetsHitRateCriteria(signal, 0.80)) return;
        direction = signal.direction;
        const winProbability = calculateWinProbability(signal);
        isWin = Math.random() < winProbability;
      } else {
        direction = priceChange >= 0 ? 'long' : 'short';
        isWin = true;
      }

      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      const positionSize = 100 * leverage;
      const pair = `${symbol}/USDT`;

      const targetProfit = Math.max(profitPerTrade, MIN_NET_PROFIT);
      const priceMovementPercent = targetProfit / positionSize;
      const exitPrice = direction === 'long'
        ? currentPrice * (1 + priceMovementPercent)
        : currentPrice * (1 - priceMovementPercent);

      const netProfit = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange);
      if (netProfit < MIN_NET_PROFIT) return;
      
      const tradePnl = isWin ? netProfit : -Math.abs(netProfit * 0.6);
      hitRateTracker.recordTrade(isWin);

      const now = Date.now();
      tradeTimestampsRef.current.push(now);
      tradeTimestampsRef.current = tradeTimestampsRef.current.filter(t => now - t < 60000);
      const tpm = tradeTimestampsRef.current.length;

      setMetrics(prev => {
        const newPnl = Math.min(Math.max(prev.currentPnL + tradePnl, -dailyStopLoss), dailyTarget * 1.5);
        const newTrades = prev.tradesExecuted + 1;
        const wins = Math.round(prev.hitRate * prev.tradesExecuted / 100) + (isWin ? 1 : 0);
        const newHitRate = newTrades > 0 ? (wins / newTrades) * 100 : 0;
        const newMaxDrawdown = Math.min(prev.maxDrawdown, newPnl < 0 ? newPnl : prev.maxDrawdown);

        // DEMO MODE: Route through demoDataStore
        demoDataStore.updateBalance(tradePnl, `trade-${Date.now()}-${Math.random()}`);
        demoDataStore.addTrade({ pair, direction, pnl: tradePnl, exchange: currentExchange, timestamp: new Date() });
        setVirtualBalance(prev => prev + tradePnl);

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
            is_sandbox: true, // Always true for demo
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
        notifyDailyProgress(newPnl, dailyTarget, botName);
        onUpdateBotPnl(existingBot.id, newPnl, newTrades, newHitRate);

        return {
          ...prev,
          currentPnL: newPnl,
          tradesExecuted: newTrades,
          hitRate: newHitRate,
          maxDrawdown: newMaxDrawdown,
          tradesPerMinute: tpm,
        };
      });
    }, 200);

    return () => {
      console.log('🛑 STOPPING: Demo trade simulation loop cleanup');
      clearInterval(interval);
    };
  }, [isRunning, tradingMode, dailyTarget, profitPerTrade, existingBot, prices, leverages, botType, user, notifyTrade, notifyTakeProfit, notifyDailyProgress, onUpdateBotPnl, setVirtualBalance, botName, onStopBot, dailyStopLoss, tradingStrategy]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      await onStopBot(existingBot.id);
      setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0, tradesPerMinute: 0 });
      resetProgressNotifications();
    } else {
      resetProgressNotifications();
      await onStartBot(botName, botType, dailyTarget, profitPerTrade, tradingMode === 'demo');
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

  // Manual trade execution for Live mode
  const handleExecuteTradeNow = async () => {
    if (!existingBot || tradingMode !== 'live') return;
    setIsExecutingTrade(true);
    
    try {
      const { toast } = await import('sonner');
      toast.info('Executing trade...');
      
      const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
        body: {
          botId: existingBot.id,
          mode: botType,
          profitTarget: profitPerTrade,
          exchanges: EXCHANGE_CONFIGS.map(e => e.name),
          leverages,
          isSandbox: false,
          maxPositionSize: 100,
        }
      });
      
      if (error) throw error;
      
      if (data?.exchange) {
        setActiveExchange(data.exchange);
      }
      
      notifyTrade(data.exchange, data.pair, data.direction, data.pnl || 0);
      
      toast.success(`Trade Executed: ${data.pair} ${data.direction}`, {
        description: `P&L: $${(data.pnl || 0).toFixed(2)} on ${data.exchange}`,
      });
    } catch (err) {
      console.error('Manual trade execution failed:', err);
      const { toast } = await import('sonner');
      toast.error('Trade execution failed');
    } finally {
      setIsExecutingTrade(false);
    }
  };

  const progressPercent = (metrics.currentPnL / dailyTarget) * 100;

  return (
    <div className="card-terminal p-3 flex flex-col h-full overflow-hidden">
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
            <Zap className="w-2.5 h-2.5" /> TPM
          </div>
          <p className={cn(
            "text-sm font-bold font-mono",
            metrics.tradesPerMinute >= 100 ? "text-primary animate-pulse" : "text-foreground"
          )}>
            {metrics.tradesPerMinute}
          </p>
        </div>
      </div>

      {/* Trading Strategy Toggle */}
      <div className="mb-3">
        <Label className="text-[10px] text-muted-foreground mb-1 block">Trading Strategy</Label>
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
          <Button
            size="sm"
            variant={tradingStrategy === 'profit' ? 'default' : 'ghost'}
            onClick={() => setTradingStrategy('profit')}
            className="h-6 text-[10px] px-2 flex-1"
            disabled={isRunning}
          >
            <Zap className="w-3 h-3 mr-1" />
            Profit-Focused
          </Button>
          <Button
            size="sm"
            variant={tradingStrategy === 'signal' ? 'default' : 'ghost'}
            onClick={() => setTradingStrategy('signal')}
            className="h-6 text-[10px] px-2 flex-1"
            disabled={isRunning}
          >
            <Brain className="w-3 h-3 mr-1" />
            AI Signals
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          {tradingStrategy === 'profit' 
            ? 'Trades as fast as possible, min $0.10 profit/trade'
            : 'Filters trades using AI signals for 80%+ hit rate'}
        </p>
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
            onChange={(e) => setProfitPerTrade(Math.max(0.10, Number(e.target.value)))}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={0.10}
            step={0.05}
          />
        </div>
      </div>

      {/* Stop Loss Configuration */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Daily Stop Loss ($)</label>
          <Input
            type="number"
            value={dailyStopLoss}
            onChange={(e) => onConfigChange?.('dailyStopLoss', Math.max(1, Number(e.target.value)))}
            disabled={isAnyBotRunning}
            className="h-8 text-xs font-mono"
            min={1}
            step={1}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Stop Loss/Trade ($)</label>
          <Input
            type="number"
            value={perTradeStopLoss}
            onChange={(e) => onConfigChange?.('perTradeStopLoss', Math.max(0.1, Number(e.target.value)))}
            disabled={isAnyBotRunning}
            className="h-8 text-xs font-mono"
            min={0.1}
            step={0.1}
          />
        </div>
      </div>

      {/* Leverage Sliders (only for leverage bot) - Compact */}
      {botType === 'leverage' && (
        <div className="mb-2 space-y-1">
          <label className="text-[9px] text-muted-foreground block">Leverage by Exchange</label>
          {EXCHANGE_CONFIGS.slice(0, 3).map(ex => (
            <div key={ex.name} className="flex items-center gap-1">
              <span className="text-[9px] text-foreground w-12 truncate">{ex.name}</span>
              <Slider
                value={[leverages[ex.name] || 1]}
                onValueChange={(v) => setLeverages(prev => ({ ...prev, [ex.name]: v[0] }))}
                min={1}
                max={ex.maxLeverage}
                step={1}
                disabled={isRunning}
                className="flex-1"
              />
              <span className="text-[9px] font-mono text-muted-foreground w-5">{leverages[ex.name]}×</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended USDT Allocation - Compact */}
      {!isRunning && (
        <div className="mb-2">
          <label className="text-[9px] text-muted-foreground block mb-1">
            Recommended: ${suggestedUSDT.toLocaleString()}
          </label>
          <div className="bg-secondary/30 rounded overflow-hidden text-[9px]">
            {EXCHANGE_CONFIGS.slice(0, 2).map(ex => {
              const allocation = Math.round(suggestedUSDT * EXCHANGE_ALLOCATION_PERCENTAGES[ex.confidence]);
              return (
                <div key={ex.name} className="flex items-center justify-between px-2 py-1 border-t border-border/50 first:border-t-0">
                  <span className="text-foreground">{ex.name}</span>
                  <span className="font-mono text-primary">${allocation.toLocaleString()}</span>
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
        {/* Manual Execute Trade Now button for Live mode */}
        {isRunning && tradingMode === 'live' && (
          <Button
            variant="outline"
            className="gap-1"
            onClick={handleExecuteTradeNow}
            disabled={isExecutingTrade}
          >
            {isExecutingTrade ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Trade
          </Button>
        )}
        {metrics.currentPnL > 0 && (
          <Button variant="outline" className="gap-1" onClick={handleWithdrawProfits} disabled={withdrawing}>
            {withdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
            ${metrics.currentPnL.toFixed(2)}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[8px] text-muted-foreground">
        <AlertTriangle className="w-2.5 h-2.5 text-warning" />
        <span>Daily stop: -${dailyStopLoss} | SL: -${perTradeStopLoss.toFixed(2)}/trade</span>
      </div>
    </div>
  );
}
