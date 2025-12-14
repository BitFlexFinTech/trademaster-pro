import { useState, useEffect, useRef, useMemo } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign, Clock, TrendingUp, Sparkles, Banknote, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useNotifications } from '@/hooks/useNotifications';
import { useTradingMode, MAX_USDT_ALLOCATION } from '@/contexts/TradingModeContext';
import { useAuth } from '@/hooks/useAuth';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast as sonnerToast } from 'sonner';
import { HitRateGauge } from '@/components/bots/HitRateGauge';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';

interface LastTrade {
  pair: string;
  direction: 'long' | 'short';
  pnl: number;
  exchange: string;
  timestamp: number;
}

export function GreenBackWidget() {
  const { bots, stats, startBot, stopBot, updateBotPnl, refetch, getSpotBot, getLeverageBot } = useBotRuns();
  const { prices } = useRealtimePrices();
  const { notifyTrade, notifyTakeProfit } = useNotifications();
  const { mode: tradingMode, virtualBalance, setVirtualBalance, resetTrigger } = useTradingMode();
  const { user } = useAuth();
  const { connectedExchangeNames, hasConnections } = useConnectedExchanges();
  
  // Find BOTH spot and leverage bots
  const spotBot = getSpotBot();
  const leverageBot = getLeverageBot();
  const anyBotRunning = !!spotBot || !!leverageBot;
  const runningBotCount = (spotBot ? 1 : 0) + (leverageBot ? 1 : 0);

  // Combined metrics from both bots
  const combinedPnL = (spotBot?.currentPnl || 0) + (leverageBot?.currentPnl || 0);
  const combinedTrades = (spotBot?.tradesExecuted || 0) + (leverageBot?.tradesExecuted || 0);
  const combinedHitRate = combinedTrades > 0 
    ? ((spotBot?.tradesExecuted || 0) * (spotBot?.hitRate || 0) + (leverageBot?.tradesExecuted || 0) * (leverageBot?.hitRate || 0)) / combinedTrades
    : 0;

  const dailyTarget = (spotBot?.dailyTarget || 40) + (leverageBot?.dailyTarget || 0);
  const profitPerTrade = spotBot?.profitPerTrade || leverageBot?.profitPerTrade || 1;

  // Get active exchanges based on mode - connected for Live, all for Demo
  const activeExchangeConfigs = useMemo(() => {
    if (tradingMode === 'live' && hasConnections) {
      return EXCHANGE_CONFIGS.filter(ex => connectedExchangeNames.includes(ex.name));
    }
    return EXCHANGE_CONFIGS;
  }, [tradingMode, connectedExchangeNames, hasConnections]);

  // Calculate required hit rate for daily target
  const requiredHitRate = useMemo(() => {
    const lossPerTrade = 0.60;
    const expectedTradesPerDay = 100; // Conservative estimate
    if (expectedTradesPerDay <= 0 || (profitPerTrade + lossPerTrade) === 0) return 95;
    const profitNeededPerTrade = dailyTarget / expectedTradesPerDay;
    const rate = (profitNeededPerTrade + lossPerTrade) / (profitPerTrade + lossPerTrade);
    return Math.max(0, Math.min(100, rate * 100));
  }, [dailyTarget, profitPerTrade]);

  const [metrics, setMetrics] = useState({
    currentPnL: combinedPnL,
    tradesExecuted: combinedTrades,
    hitRate: combinedHitRate,
    avgTimeToTP: 12.3,
  });

  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [isExecutingTrade, setIsExecutingTrade] = useState(false);
  const [lastTrade, setLastTrade] = useState<LastTrade | null>(null);
  const [tradePulse, setTradePulse] = useState(false);
  const lastPricesRef = useRef<Record<string, number>>({});

  // Listen to reset trigger - reset local state
  useEffect(() => {
    if (resetTrigger > 0) {
      setMetrics({
        currentPnL: 0,
        tradesExecuted: 0,
        hitRate: 0,
        avgTimeToTP: 12.3,
      });
      setLastTrade(null);
      setActiveExchange(null);
      lastPricesRef.current = {};
      refetch();
    }
  }, [resetTrigger, refetch]);

  // Sync metrics from database
  useEffect(() => {
    setMetrics({
      currentPnL: combinedPnL,
      tradesExecuted: combinedTrades,
      hitRate: combinedHitRate,
      avgTimeToTP: 12.3,
    });
  }, [combinedPnL, combinedTrades, combinedHitRate]);

  // ===== TRADING LOGIC =====
  // LIVE MODE: No local simulation - data comes from edge function via Realtime
  // DEMO MODE: Local simulation for fast trading
  useEffect(() => {
    if (!anyBotRunning) {
      setActiveExchange(null);
      return;
    }

    const activeBot = spotBot || leverageBot;
    if (!activeBot) return;

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
              botId: activeBot.id,
              mode: activeBot.mode || 'spot',
              profitTarget: profitPerTrade,
              exchanges: activeExchangeConfigs.map(e => e.name),
              leverages: { Binance: 5, OKX: 5, Bybit: 5, Kraken: 2, Nexo: 2 },
              isSandbox: false,
              maxPositionSize: 100,
            }
          });
          
          if (error) {
            console.error('❌ Live trade error:', error);
            return;
          }
          
          console.log('✅ Live trade result:', data);
          
          if (data?.exchange) {
            setActiveExchange(data.exchange);
          }
          
          if (data?.pair && data?.direction) {
            setTradePulse(true);
            setTimeout(() => setTradePulse(false), 600);
            setLastTrade({
              pair: data.pair,
              direction: data.direction,
              pnl: data.pnl || 0,
              exchange: data.exchange,
              timestamp: Date.now(),
            });
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
        isCancelled = true;
        clearInterval(interval);
      };
    }

    // ===== DEMO MODE: Local simulation =====
    console.log('🟢 DEMO MODE: Running local trading simulation');
    
    const activeExchangeNames = activeExchangeConfigs.map(e => e.name);

    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let idx = 0;
    const interval = setInterval(async () => {
      // CRITICAL: Enforce daily stop loss at -$5
      if (metrics.currentPnL <= -5) {
        sonnerToast.error('⚠️ Daily Stop Loss Hit', {
          description: 'GreenBack stopped: -$5 daily limit reached.',
        });
        const botToStop = spotBot || leverageBot;
        if (botToStop) await stopBot(botToStop.id);
        return;
      }

      const currentExchange = activeExchangeNames[idx % activeExchangeNames.length];
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

      const direction: 'long' | 'short' = priceChange >= 0 ? 'long' : 'short';
      const isWin = Math.random() < 0.70;
      const tradePnl = isWin ? profitPerTrade : -0.60;
      const pair = `${symbol}/USDT`;

      setTradePulse(true);
      setTimeout(() => setTradePulse(false), 600);
      setLastTrade({ pair, direction, pnl: tradePnl, exchange: currentExchange, timestamp: Date.now() });

      setMetrics(prev => {
        const newPnl = Math.min(Math.max(prev.currentPnL + tradePnl, -5), dailyTarget * 1.5);
        const newTrades = prev.tradesExecuted + 1;
        const wins = Math.round(prev.hitRate * prev.tradesExecuted / 100) + (isWin ? 1 : 0);
        const newHitRate = newTrades > 0 ? (wins / newTrades) * 100 : 0;

        const positionSize = 100;
        const leverage = leverageBot ? 5 : 1;
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
            leverage: leverageBot ? 5 : 1,
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

        if (newPnl >= dailyTarget && prev.currentPnL < dailyTarget) {
          sonnerToast.success('🎯 Daily Target Reached!', {
            description: `GreenBack hit $${dailyTarget} target! Bot continues running.`,
          });
        }

        // DEMO MODE: Update virtual balance
        setVirtualBalance(prev => prev + tradePnl);
        updateBotPnl(activeBot.id, newPnl, newTrades, newHitRate);

        return {
          ...prev,
          currentPnL: newPnl,
          tradesExecuted: newTrades,
          hitRate: newHitRate,
        };
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [anyBotRunning, dailyTarget, profitPerTrade, spotBot, leverageBot, prices, notifyTrade, notifyTakeProfit, tradingMode, updateBotPnl, setVirtualBalance, user, stopBot, metrics.currentPnL, activeExchangeConfigs]);

  const handleStartSpot = async () => {
    if (spotBot) {
      await stopBot(spotBot.id);
    } else {
      await startBot('GreenBack Spot', 'spot', 40, 1);
    }
    refetch();
  };

  const handleStartLeverage = async () => {
    if (leverageBot) {
      await stopBot(leverageBot.id);
    } else {
      await startBot('GreenBack Leverage', 'leverage', 40, 1);
    }
    refetch();
  };

  const handleWithdrawProfits = async () => {
    if (metrics.currentPnL <= 0) return;
    setWithdrawing(true);
    try {
      const botId = spotBot?.id || leverageBot?.id;
      const { data, error } = await supabase.functions.invoke('withdraw-bot-profits', {
        body: { botId }
      });
      if (error) throw error;
      
      setMetrics(prev => ({ ...prev, currentPnL: 0 }));
      sonnerToast.success(`💰 Withdrew $${data?.withdrawnAmount?.toFixed(2) || metrics.currentPnL.toFixed(2)}`);
      refetch();
    } catch (err) {
      console.error('Withdraw failed:', err);
      sonnerToast.error('Withdrawal failed. Try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  // Manual trade execution for Live mode
  const handleExecuteTradeNow = async () => {
    if (!anyBotRunning || tradingMode !== 'live') return;
    const activeBot = spotBot || leverageBot;
    if (!activeBot) return;
    
    setIsExecutingTrade(true);
    
    try {
      sonnerToast.info('Executing trade...');
      
      const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
        body: {
          botId: activeBot.id,
          mode: activeBot.mode || 'spot',
          profitTarget: profitPerTrade,
          exchanges: activeExchangeConfigs.map(e => e.name),
          leverages: { Binance: 5, OKX: 5, Bybit: 5, Kraken: 2, Nexo: 2 },
          isSandbox: false,
          maxPositionSize: 100,
        }
      });
      
      if (error) throw error;
      
      if (data?.exchange) {
        setActiveExchange(data.exchange);
      }
      
      if (data?.pair && data?.direction) {
        setTradePulse(true);
        setTimeout(() => setTradePulse(false), 600);
        setLastTrade({
          pair: data.pair,
          direction: data.direction,
          pnl: data.pnl || 0,
          exchange: data.exchange,
          timestamp: Date.now(),
        });
        notifyTrade(data.exchange, data.pair, data.direction, data.pnl || 0);
      }
      
      sonnerToast.success(`Trade Executed: ${data.pair} ${data.direction}`, {
        description: `P&L: $${(data.pnl || 0).toFixed(2)} on ${data.exchange}`,
      });
    } catch (err) {
      console.error('Manual trade execution failed:', err);
      sonnerToast.error('Trade execution failed');
    } finally {
      setIsExecutingTrade(false);
    }
  };

  const progressPercent = (metrics.currentPnL / dailyTarget) * 100;

  // Calculate suggested USDT allocation using real prices - CAPPED at $5000
  const calculateAllocation = (confidence: 'High' | 'Medium' | 'Low'): number => {
    const avgVolatility = prices.length > 0
      ? prices.slice(0, 10).reduce((sum, p) => sum + Math.abs(p.change_24h || 0), 0) / Math.min(prices.length, 10) / 24
      : 0.5;
    const avgMovePercent = Math.max(avgVolatility / 100, 0.001);
    const rawBase = (dailyTarget / profitPerTrade) / avgMovePercent * (tradingMode === 'demo' ? 1.3 : 1.5);
    // Cap total at MAX_USDT_ALLOCATION ($5000)
    const cappedBase = Math.min(rawBase, MAX_USDT_ALLOCATION);
    const totalBase = cappedBase / activeExchangeConfigs.length;
    if (confidence === 'High') return Math.round(totalBase * 1.5);
    if (confidence === 'Medium') return Math.round(totalBase);
    return Math.round(totalBase * 0.6);
  };

  // AI-generated insights based on metrics
  const getAIInsight = (): string => {
    if (!anyBotRunning && stats.totalTrades === 0) {
      return "Start Spot or Leverage bot to begin automated scalping across exchanges.";
    }
    if (runningBotCount === 2) {
      return `Both bots running: Combined ${metrics.hitRate.toFixed(0)}% hit rate across ${metrics.tradesExecuted} trades.`;
    }
    if (metrics.hitRate >= 70) {
      return `Excellent performance with ${metrics.hitRate.toFixed(0)}% hit rate. Consider starting both bots.`;
    }
    if (metrics.currentPnL >= dailyTarget) {
      return "Daily target achieved! Bot continues running for additional profits.";
    }
    return `${metrics.tradesExecuted} trades executed. Targeting $${dailyTarget}/day profit.`;
  };

  return (
    <div className={cn(
      "card-terminal p-4 h-full flex flex-col transition-all duration-300",
      tradePulse && lastTrade && lastTrade.pnl >= 0 && "animate-trade-pulse",
      tradePulse && lastTrade && lastTrade.pnl < 0 && "animate-trade-pulse-loss"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={cn("relative", anyBotRunning && "animate-glow rounded-full")}>
            <Zap className="w-5 h-5 text-primary" />
            {anyBotRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <span className="font-semibold text-foreground">GreenBack Bots</span>
            {anyBotRunning && activeExchange && (
              <Badge variant="outline" className="ml-2 text-[9px] animate-slide-in">
                <span className="w-1 h-1 bg-primary rounded-full mr-1 animate-pulse" />
                {activeExchange}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={tradingMode === 'demo' ? 'secondary' : 'destructive'} className="text-[8px]">
            {tradingMode === 'demo' ? 'DEMO' : 'LIVE'}
          </Badge>
          {runningBotCount > 0 && (
            <Badge variant="default" className="text-[10px] bg-primary/20 text-primary">
              {runningBotCount} Active
            </Badge>
          )}
        </div>
      </div>

      {/* Bot Status Indicators */}
      <div className="grid grid-cols-2 gap-2 mb-3 flex-shrink-0">
        <div className={cn(
          "flex items-center justify-between p-2 rounded border transition-all duration-300",
          spotBot ? "bg-primary/10 border-primary/30" : "bg-secondary/50 border-border/50"
        )}>
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", spotBot ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
            <span className="text-xs font-medium">Spot</span>
          </div>
          {spotBot && (
            <span className="text-[10px] font-mono text-primary animate-number-pop">
              +${spotBot.currentPnl?.toFixed(2) || '0.00'}
            </span>
          )}
        </div>
        <div className={cn(
          "flex items-center justify-between p-2 rounded border transition-all duration-300",
          leverageBot ? "bg-warning/10 border-warning/30" : "bg-secondary/50 border-border/50"
        )}>
          <div className="flex items-center gap-2">
            <span className={cn("w-2 h-2 rounded-full", leverageBot ? "bg-warning animate-pulse" : "bg-muted-foreground")} />
            <span className="text-xs font-medium">Leverage</span>
          </div>
          {leverageBot && (
            <span className="text-[10px] font-mono text-warning animate-number-pop">
              +${leverageBot.currentPnl?.toFixed(2) || '0.00'}
            </span>
          )}
        </div>
      </div>

      {/* Last Trade Indicator */}
      {lastTrade && Date.now() - lastTrade.timestamp < 5000 && (
        <div className={cn(
          "flex items-center gap-2 p-2 rounded mb-3 text-xs animate-slide-in flex-shrink-0",
          lastTrade.pnl >= 0 ? "bg-primary/10 border border-primary/30" : "bg-destructive/10 border border-destructive/30"
        )}>
          {lastTrade.direction === 'long' ? (
            <ArrowUpRight className={cn("w-4 h-4", lastTrade.pnl >= 0 ? "text-primary" : "text-destructive")} />
          ) : (
            <ArrowDownRight className={cn("w-4 h-4", lastTrade.pnl >= 0 ? "text-primary" : "text-destructive")} />
          )}
          <span className="text-foreground font-medium">{lastTrade.pair}</span>
          <span className="text-muted-foreground">{lastTrade.exchange}</span>
          <span className={cn("font-mono font-bold ml-auto", lastTrade.pnl >= 0 ? "text-primary" : "text-destructive")}>
            {lastTrade.pnl >= 0 ? '+' : ''}${lastTrade.pnl.toFixed(2)}
          </span>
        </div>
      )}

      {/* Compact Hit Rate Gauge - Always visible when bots running */}
      {anyBotRunning && (
        <div className="mb-3 flex-shrink-0 p-2 bg-secondary/30 rounded-lg border border-border/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-muted-foreground">Hit Rate</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[8px]',
                metrics.hitRate >= 95 ? 'border-primary text-primary' :
                metrics.hitRate >= 90 ? 'border-yellow-500 text-yellow-500' :
                'border-destructive text-destructive'
              )}
            >
              {metrics.hitRate >= 95 ? 'ON TARGET' : metrics.hitRate >= 90 ? 'WARNING' : 'CRITICAL'}
            </Badge>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'text-xl font-bold font-mono',
              metrics.hitRate >= 95 ? 'text-primary' :
              metrics.hitRate >= 90 ? 'text-yellow-500' :
              'text-destructive'
            )}>
              {metrics.hitRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-muted-foreground">
              / {requiredHitRate.toFixed(0)}% req
            </span>
          </div>
          {/* Mini gauge bar */}
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                metrics.hitRate >= 95 ? 'bg-primary' :
                metrics.hitRate >= 90 ? 'bg-yellow-500' :
                'bg-destructive'
              )}
              style={{ width: `${Math.min((metrics.hitRate / 100) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-3 flex-shrink-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Daily Progress</span>
          <span className={cn("font-mono transition-all", tradePulse && "animate-number-pop")}>
            <span className={metrics.currentPnL >= 0 ? "text-primary" : "text-destructive"}>
              ${metrics.currentPnL.toFixed(2)}
            </span>
            <span className="text-muted-foreground"> / ${dailyTarget}</span>
          </span>
        </div>
        <div className="relative">
          <Progress value={Math.min(progressPercent, 100)} className="h-2" />
          {progressPercent >= 100 && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0 animate-progress-glow" />
          )}
        </div>
        {progressPercent >= 100 && (
          <p className="text-[10px] text-primary mt-1 animate-pulse">🎯 Target reached! Bots continue running.</p>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 flex-shrink-0">
        <div className="bg-secondary/50 p-2 rounded text-center">
          <DollarSign className="w-3 h-3 mx-auto text-primary mb-1" />
          <p className={cn('text-sm font-bold font-mono transition-all', metrics.currentPnL >= 0 ? 'text-primary' : 'text-destructive', tradePulse && 'animate-number-pop')}>
            ${metrics.currentPnL.toFixed(2)}
          </p>
          <p className="text-[9px] text-muted-foreground">Combined P&L</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <Activity className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
          <p className={cn("text-sm font-bold text-foreground font-mono", tradePulse && "animate-number-pop")}>
            {metrics.tradesExecuted}
          </p>
          <p className="text-[9px] text-muted-foreground">Trades</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <Target className="w-3 h-3 mx-auto text-primary mb-1" />
          <p className="text-sm font-bold text-primary font-mono">{metrics.hitRate.toFixed(0)}%</p>
          <p className="text-[9px] text-muted-foreground">Hit Rate</p>
        </div>
        <div className="bg-secondary/50 p-2 rounded text-center">
          <Clock className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm font-bold text-foreground font-mono">{metrics.avgTimeToTP.toFixed(1)}s</p>
          <p className="text-[9px] text-muted-foreground">Avg TP</p>
        </div>
      </div>

      {/* AI Insight */}
      <div className="bg-secondary/30 border border-border/50 rounded p-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[10px] font-medium text-muted-foreground">AI INSIGHT</span>
        </div>
        <p className="text-xs text-foreground">{getAIInsight()}</p>
      </div>

      {/* Recommended USDT Allocation - Show when no bots running */}
      {!anyBotRunning && (
        <div className="flex-1 min-h-0 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">RECOMMENDED USDT ALLOCATION</span>
            </div>
            {/* USDT Cap Indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground font-mono">
                ${activeExchangeConfigs.reduce((sum, ex) => sum + calculateAllocation(ex.confidence), 0).toLocaleString()} / ${MAX_USDT_ALLOCATION.toLocaleString()}
              </span>
              <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                {(() => {
                  const totalAlloc = activeExchangeConfigs.reduce((sum, ex) => sum + calculateAllocation(ex.confidence), 0);
                  const capPercent = (totalAlloc / MAX_USDT_ALLOCATION) * 100;
                  return (
                    <div 
                      className={cn(
                        "h-full transition-all rounded-full",
                        capPercent >= 100 ? "bg-destructive" : capPercent >= 80 ? "bg-warning" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(capPercent, 100)}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          </div>
          <ScrollArea className="h-full max-h-[100px]">
            <div className="bg-secondary/30 rounded overflow-hidden text-[10px]">
              <div className="grid grid-cols-4 gap-1 px-2 py-1.5 bg-muted/50 text-muted-foreground font-medium">
                <span>Exchange</span>
                <span>USDT</span>
                <span>Confidence</span>
                <span>Notes</span>
              </div>
              {activeExchangeConfigs.map(ex => (
                <div key={ex.name} className="grid grid-cols-4 gap-1 px-2 py-1.5 border-t border-border/50">
                  <span className="text-foreground">{ex.name}</span>
                  <span className="font-mono text-primary">${calculateAllocation(ex.confidence)}</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      'text-[8px] w-fit h-4',
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
          </ScrollArea>
        </div>
      )}

      {/* Cumulative Stats when running */}
      {anyBotRunning && (
        <div className="flex-1 min-h-0 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary/30 p-3 rounded">
              <p className="text-[10px] text-muted-foreground mb-1">Total Bot P&L</p>
              <p className={cn('text-lg font-bold font-mono', stats.totalPnl >= 0 ? 'text-primary' : 'text-destructive')}>
                ${stats.totalPnl.toFixed(2)}
              </p>
            </div>
            <div className="bg-secondary/30 p-3 rounded">
              <p className="text-[10px] text-muted-foreground mb-1">All-Time Trades</p>
              <p className="text-lg font-bold text-foreground font-mono">{stats.totalTrades}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mt-auto flex-shrink-0">
        <Button
          className={cn('flex-1 gap-1 text-xs', spotBot ? 'btn-outline-primary' : 'btn-primary')}
          onClick={handleStartSpot}
          size="sm"
        >
          {spotBot ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {spotBot ? 'Stop Spot' : 'Start Spot'}
        </Button>
        <Button
          className={cn('flex-1 gap-1 text-xs', leverageBot ? 'btn-outline-primary' : '')}
          variant={leverageBot ? "outline" : "secondary"}
          onClick={handleStartLeverage}
          size="sm"
        >
          {leverageBot ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {leverageBot ? 'Stop Lev' : 'Start Leverage'}
        </Button>
        {/* Manual Execute Trade Now button for Live mode */}
        {anyBotRunning && tradingMode === 'live' && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleExecuteTradeNow}
            disabled={isExecutingTrade}
          >
            {isExecutingTrade ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Trade
          </Button>
        )}
        {metrics.currentPnL > 0 && (
          <Button variant="outline" size="sm" className="gap-1" onClick={handleWithdrawProfits} disabled={withdrawing}>
            {withdrawing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
            ${metrics.currentPnL.toFixed(0)}
          </Button>
        )}
        <Link to="/bots">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Activity className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
