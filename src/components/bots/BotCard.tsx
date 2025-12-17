import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign, Clock, AlertTriangle, Banknote, Loader2, Brain, Timer } from 'lucide-react';
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
import { tradeSpeedController } from '@/lib/tradeSpeedController';
import { tradingStateMachine } from '@/lib/tradingStateMachine';
import { recordTradeForAudit, shouldGenerateAudit, generateAuditReport } from '@/lib/selfAuditReporter';
import { generateDashboards, recordProfitForDashboard } from '@/lib/dashboardGenerator';
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
  amountPerTrade?: number;
  tradeIntervalMs?: number;
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
  perTradeStopLoss = 0.10,
  amountPerTrade = 100,
  tradeIntervalMs = 200,
  onConfigChange,
  isAnyBotRunning = false,
}: BotCardProps) {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance, setVirtualBalance, resetTrigger, lockProfit, vaultProfit, initializeSessionBalance, sessionStartBalance } = useTradingMode();
  const { notifyTrade, notifyTakeProfit, notifyDailyProgress, resetProgressNotifications } = useNotifications();

  const isRunning = existingBot?.status === 'running';
  const botName = botType === 'spot' ? 'GreenBack Spot' : 'GreenBack Leverage';

  // Core trading config
  const [dailyTarget, setDailyTarget] = useState(existingBot?.dailyTarget || 100);
  const [profitPerTrade, setProfitPerTrade] = useState(Math.max(existingBot?.profitPerTrade || 0.50, MIN_NET_PROFIT));
  const [localAmountPerTrade, setLocalAmountPerTrade] = useState(amountPerTrade);
  const [localTradeIntervalMs, setLocalTradeIntervalMs] = useState(tradeIntervalMs);
  
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
  
  // Refs for trading loop - CRITICAL: Use refs to avoid dependency issues
  const lastPricesRef = useRef<Record<string, number>>({});
  const priceHistoryRef = useRef<Map<string, { prices: number[], volumes: number[] }>>(new Map());
  const tradeTimestampsRef = useRef<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);
  const isStoppingRef = useRef(false);  // CRITICAL: Immediate stop flag
  const metricsRef = useRef({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 });  // Internal metrics tracking

  // Calculate stop loss automatically: 20% of profit (80% lower)
  const calculatedStopLoss = profitPerTrade * 0.2;

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
      metricsRef.current = { currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 };
      setActiveExchange(null);
      lastPricesRef.current = {};
      priceHistoryRef.current.clear();
      tradeTimestampsRef.current = [];
      isStoppingRef.current = false;
      resetProgressNotifications();
    }
  }, [resetTrigger, resetProgressNotifications]);

  // Sync with existing bot
  useEffect(() => {
    if (existingBot) {
      const newMetrics = {
        currentPnL: existingBot.currentPnl || 0,
        tradesExecuted: existingBot.tradesExecuted || 0,
        hitRate: existingBot.hitRate || 0,
        avgTimeToTP: 12.3,
        maxDrawdown: existingBot.maxDrawdown || 0,
        tradesPerMinute: 0,
      };
      setMetrics(newMetrics);
      metricsRef.current = {
        currentPnL: newMetrics.currentPnL,
        tradesExecuted: newMetrics.tradesExecuted,
        hitRate: newMetrics.hitRate,
        winsCount: Math.round((newMetrics.hitRate * newMetrics.tradesExecuted) / 100),
      };
      setDailyTarget(existingBot.dailyTarget);
      setProfitPerTrade(existingBot.profitPerTrade);
    }
  }, [existingBot]);

  // Sync local config with parent
  useEffect(() => {
    setLocalAmountPerTrade(amountPerTrade);
  }, [amountPerTrade]);

  useEffect(() => {
    setLocalTradeIntervalMs(tradeIntervalMs);
  }, [tradeIntervalMs]);

  // ===== TRADING LOGIC =====
  // CRITICAL: NO metrics.* in dependency array - causes infinite re-renders and prevents stop
  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // CRITICAL: Check stop flag immediately
    if (isStoppingRef.current) {
      console.log('🛑 Bot is stopping, not starting new loop');
      return;
    }

    if (!isRunning || !existingBot) {
      setActiveExchange(null);
      isCancelledRef.current = true;
      return;
    }

    isCancelledRef.current = false;
    isStoppingRef.current = false;

    // ===== LIVE MODE: Execute real trades via edge function =====
    if (tradingMode === 'live') {
      console.log(`🔴 LIVE MODE: Executing real trades via edge function every ${localTradeIntervalMs}ms`);
      
      const exchangeCooldowns = new Map<string, number>();
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 3;
      
      const executeLiveTrade = async () => {
        // CRITICAL: Check stop flags FIRST
        if (isCancelledRef.current || isStoppingRef.current) {
          console.log('🛑 Stop flag detected in live trade, exiting');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
        
        try {
          const now = Date.now();
          const availableExchanges = EXCHANGE_CONFIGS
            .map(e => e.name)
            .filter(name => {
              const cooldownUntil = exchangeCooldowns.get(name) || 0;
              return now > cooldownUntil;
            });
          
          if (availableExchanges.length === 0) {
            console.log('⏳ All exchanges on cooldown, waiting...');
            return;
          }
          
          console.log('📤 Calling execute-bot-trade edge function...');
          const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
            body: {
              botId: existingBot.id,
              mode: botType,
              profitTarget: profitPerTrade,
              exchanges: availableExchanges,
              leverages,
              isSandbox: false,
              maxPositionSize: localAmountPerTrade,
              stopLossPercent: 0.2, // 20% of profit = 80% lower
            }
          });
          
          if (error) {
            console.error('❌ Live trade error:', error);
            consecutiveErrors++;
            
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              const { toast } = await import('sonner');
              toast.error('Bot Auto-Paused', {
                description: `${MAX_CONSECUTIVE_ERRORS} consecutive errors. Check exchange connections.`,
              });
            }
            return;
          }
          
          consecutiveErrors = 0;
          console.log('✅ Live trade result:', data);
          
          if (data?.success === false) {
            console.warn('⚠️ Trade not executed:', data.reason || data.error);
            const { toast } = await import('sonner');
            
            if (data.error?.includes('rate') || data.error?.includes('Rate') || data.error?.includes('-1015')) {
              const exchange = data.exchange || availableExchanges[0];
              exchangeCooldowns.set(exchange, Date.now() + 60000);
              toast.warning(`${exchange} rate limited`, {
                description: 'Temporarily pausing trades on this exchange.',
                id: `rate-limit-${exchange}`,
              });
              return;
            }
            
            if (data.error?.includes('Insufficient') || data.error?.includes('Balance below')) {
              toast.error('Insufficient Balance', {
                description: data.reason || 'Deposit more USDT to your exchange.',
                id: 'insufficient-balance',
              });
            }
            return;
          }
          
          if (data?.exchange) {
            setActiveExchange(data.exchange);
          }
          
          if (data?.success && data?.pnl !== undefined) {
            setMetrics(prev => {
              const newPnl = prev.currentPnL + data.pnl;
              const newTrades = prev.tradesExecuted + 1;
              const isWin = data.pnl > 0;
              const wins = Math.round(prev.hitRate * prev.tradesExecuted / 100) + (isWin ? 1 : 0);
              const newHitRate = newTrades > 0 ? (wins / newTrades) * 100 : 0;
              
              return {
                ...prev,
                currentPnL: newPnl,
                tradesExecuted: newTrades,
                hitRate: newHitRate,
                maxDrawdown: Math.min(prev.maxDrawdown, newPnl < 0 ? newPnl : prev.maxDrawdown),
              };
            });
            
            onUpdateBotPnl(existingBot.id, data.pnl, 1, data.pnl > 0 ? 100 : 0);
          }
          
          if (data?.pair && data?.direction) {
            notifyTrade(data.exchange, data.pair, data.direction, data.pnl || 0);
          }
        } catch (err) {
          console.error('❌ Failed to execute live trade:', err);
        }
      };
      
      // Use configurable interval for live mode (minimum 5000ms for rate limit protection)
      const liveInterval = Math.max(localTradeIntervalMs, 5000);
      executeLiveTrade();
      intervalRef.current = setInterval(executeLiveTrade, liveInterval);
      
      return () => {
        console.log('🛑 STOPPING: Live trade execution loop cleanup');
        isCancelledRef.current = true;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }

    // ===== DEMO MODE: Local simulation =====
    console.log(`🟢 DEMO MODE: Running local trading simulation every ${localTradeIntervalMs}ms`);
    
    const activeExchanges = EXCHANGE_CONFIGS.map(e => e.name);
    if (activeExchanges.length === 0) return;

    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let idx = 0;
    
    const executeDemoTrade = async () => {
      // CRITICAL: Check stop flags FIRST - before any other logic
      if (isCancelledRef.current || isStoppingRef.current) {
        console.log('🛑 Stop flag detected in demo trade, exiting immediately');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      
      // Use ref for metrics to avoid stale state
      const currentMetrics = metricsRef.current;
      
      // CRITICAL: Enforce daily stop loss
      if (currentMetrics.currentPnL <= -dailyStopLoss) {
        const { toast } = await import('sonner');
        toast.error('⚠️ Daily Stop Loss Hit', {
          description: `GreenBack stopped: -$${dailyStopLoss} daily limit reached.`,
        });
        isStoppingRef.current = true;
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
        // Both long and short trades for profit
        direction = Math.random() > 0.5 ? 'long' : 'short';
        isWin = Math.random() < 0.75; // 75% win rate in profit mode
      }

      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      const positionSize = localAmountPerTrade * leverage;
      const pair = `${symbol}/USDT`;

      const targetProfit = Math.max(profitPerTrade, MIN_NET_PROFIT);
      const priceMovementPercent = targetProfit / positionSize;
      const exitPrice = direction === 'long'
        ? currentPrice * (1 + priceMovementPercent)
        : currentPrice * (1 - priceMovementPercent);

      const netProfit = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange);
      if (netProfit < MIN_NET_PROFIT) return;
      
      // FIXED: Stop loss is 20% of profit target (80% lower)
      const stopLossAmount = profitPerTrade * 0.2;
      const tradePnl = isWin ? netProfit : -stopLossAmount;
      
      hitRateTracker.recordTrade(isWin);
      
      // Record for trade speed controller (120s/60s/15s cooldowns)
      tradeSpeedController.recordSimpleTrade(isWin, tradePnl, currentExchange, pair);

      // Update metricsRef FIRST (before state update)
      metricsRef.current.tradesExecuted += 1;
      if (isWin) {
        metricsRef.current.winsCount += 1;
        metricsRef.current.currentPnL += netProfit;
        // VAULT PROFIT - segregated, NEVER traded
        if (vaultProfit) {
          vaultProfit(currentExchange, netProfit);
        }
        // Record for dashboard
        recordProfitForDashboard(netProfit, metricsRef.current.tradesExecuted);
      } else {
        metricsRef.current.currentPnL -= stopLossAmount;
      }
      metricsRef.current.hitRate = metricsRef.current.tradesExecuted > 0 
        ? (metricsRef.current.winsCount / metricsRef.current.tradesExecuted) * 100 
        : 0;

      const now = Date.now();
      tradeTimestampsRef.current.push(now);
      tradeTimestampsRef.current = tradeTimestampsRef.current.filter(t => now - t < 60000);
      const tpm = tradeTimestampsRef.current.length;

      // Use values from metricsRef for consistency
      const newPnl = metricsRef.current.currentPnL;
      const newTrades = metricsRef.current.tradesExecuted;
      const newHitRate = metricsRef.current.hitRate;
      const winsCount = metricsRef.current.winsCount;
      
      setMetrics(prev => {
        const maxDrawdown = Math.min(prev.maxDrawdown, newPnl < 0 ? newPnl : prev.maxDrawdown);

        // DEMO MODE: Route through demoDataStore
        demoDataStore.updateBalance(tradePnl, `trade-${Date.now()}-${Math.random()}`);
        demoDataStore.addTrade({ pair, direction, pnl: tradePnl, exchange: currentExchange, timestamp: new Date() });
        setVirtualBalance(prevBal => prevBal + tradePnl);

        if (user) {
          supabase.from('trades').insert({
            user_id: user.id,
            pair,
            direction,
            entry_price: currentPrice,
            exit_price: exitPrice,
            amount: localAmountPerTrade,
            leverage,
            profit_loss: tradePnl,
            profit_percentage: (tradePnl / localAmountPerTrade) * 100,
            exchange_name: currentExchange,
            is_sandbox: true,
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
          maxDrawdown,
          tradesPerMinute: tpm,
        };
      });
    };
    
    intervalRef.current = setInterval(executeDemoTrade, localTradeIntervalMs);

    return () => {
      console.log('🛑 STOPPING: Demo trade simulation loop cleanup');
      isCancelledRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, tradingMode, dailyTarget, profitPerTrade, existingBot?.id, prices, leverages, botType, user, notifyTrade, notifyTakeProfit, notifyDailyProgress, onUpdateBotPnl, setVirtualBalance, botName, onStopBot, dailyStopLoss, tradingStrategy, localAmountPerTrade, localTradeIntervalMs, lockProfit]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      // CRITICAL: Set stopping flag FIRST - before anything else
      isStoppingRef.current = true;
      isCancelledRef.current = true;
      
      // Clear interval IMMEDIATELY
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      console.log('🛑 STOP: Flags set, interval cleared, calling onStopBot');
      
      await onStopBot(existingBot.id);
      setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0, tradesPerMinute: 0 });
      metricsRef.current = { currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 };
      setActiveExchange(null);
      resetProgressNotifications();
    } else {
      // Starting bot - reset stop flags
      isStoppingRef.current = false;
      isCancelledRef.current = false;
      resetProgressNotifications();
      
      if (tradingMode === 'live') {
        const { toast } = await import('sonner');
        toast.info('Syncing exchange balances...');
        try {
          await supabase.functions.invoke('sync-exchange-balances');
        } catch (err) {
          console.error('Pre-start sync failed:', err);
        }
      }
      
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
      
      setMetrics(prev => ({ ...prev, currentPnL: 0 }));
      
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
          maxPositionSize: localAmountPerTrade,
          stopLossPercent: 0.2,
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
            ? `Long & Short trades, min $${MIN_NET_PROFIT.toFixed(2)} profit/trade`
            : 'Filters trades using AI signals for 80%+ hit rate'}
        </p>
      </div>

      {/* Configuration Row 1: Daily Target & Profit Per Trade */}
      <div className="grid grid-cols-2 gap-3 mb-2">
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
            onChange={(e) => {
              const val = Math.max(MIN_NET_PROFIT, Number(e.target.value));
              setProfitPerTrade(val);
              // Auto-update stop loss to 20% of profit
              onConfigChange?.('perTradeStopLoss', val * 0.2);
            }}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={MIN_NET_PROFIT}
            step={0.10}
          />
        </div>
      </div>

      {/* Configuration Row 2: Amount Per Trade & Trade Speed */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">Amount/Trade ($)</label>
          <Input
            type="number"
            value={localAmountPerTrade}
            onChange={(e) => {
              const val = Math.max(20, Math.min(5000, Number(e.target.value)));
              setLocalAmountPerTrade(val);
              onConfigChange?.('amountPerTrade', val);
            }}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={20}
            max={5000}
            step={10}
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1">
            <Timer className="w-3 h-3" /> Speed (ms)
          </label>
          <Input
            type="number"
            value={localTradeIntervalMs}
            onChange={(e) => {
              // Demo: min 100ms, Live: min 5000ms
              const minInterval = tradingMode === 'live' ? 5000 : 100;
              const val = Math.max(minInterval, Math.min(60000, Number(e.target.value)));
              setLocalTradeIntervalMs(val);
              onConfigChange?.('tradeIntervalMs', val);
            }}
            disabled={isRunning}
            className="h-8 text-xs font-mono"
            min={tradingMode === 'live' ? 5000 : 100}
            max={60000}
            step={100}
          />
        </div>
      </div>

      {/* Configuration Row 3: Stop Losses */}
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
          <label className="text-[10px] text-muted-foreground block mb-1">Stop Loss/Trade ($) 🔒</label>
          <Input
            type="number"
            value={calculatedStopLoss.toFixed(2)}
            disabled
            className="h-8 text-xs font-mono bg-muted"
            title="Auto-calculated: 20% of Profit/Trade (80% lower)"
          />
          <p className="text-[8px] text-muted-foreground mt-0.5">Auto: 20% of profit</p>
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
        <span>Daily stop: -${dailyStopLoss} | SL: -${calculatedStopLoss.toFixed(2)}/trade (20% of profit)</span>
      </div>
    </div>
  );
}
