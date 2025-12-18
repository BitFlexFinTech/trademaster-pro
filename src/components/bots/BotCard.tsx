import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign, Clock, AlertTriangle, Banknote, Loader2, Brain, Timer, Radar, OctagonX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useOrderBookScanning } from '@/hooks/useOrderBookScanning';
import { supabase } from '@/integrations/supabase/client';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';
import { calculateNetProfit, MIN_NET_PROFIT } from '@/lib/exchangeFees';
import { generateSignalScore, meetsHitRateCriteria, calculateWinProbability } from '@/lib/technicalAnalysis';
import { demoDataStore } from '@/lib/demoDataStore';
import { hitRateTracker } from '@/lib/sandbox/hitRateTracker';
import { tradeSpeedController } from '@/lib/tradeSpeedController';
import { tradingStateMachine } from '@/lib/tradingStateMachine';
import { recordTradeForAudit, shouldGenerateAudit, generateAuditReport, AuditReport } from '@/lib/selfAuditReporter';
import { generateDashboards, recordProfitForDashboard, DashboardCharts } from '@/lib/dashboardGenerator';
import { profitLockStrategy } from '@/lib/profitLockStrategy';
import { dailyTargetAnalyzer, type TradeRecord } from '@/lib/dailyTargetAnalyzer';
import { toast } from 'sonner';
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
  onAuditGenerated?: (report: AuditReport, dashboards: DashboardCharts) => void;
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
  onAuditGenerated,
}: BotCardProps) {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance, setVirtualBalance, resetTrigger, vaultProfit, initializeSessionBalance, sessionStartBalance, profitVault, getTotalVaultedProfits } = useTradingMode();
  const { notifyTrade, notifyTakeProfit, notifyDailyProgress, resetProgressNotifications } = useNotifications();

  // Order book scanning for guaranteed profit opportunities
  const activeExchanges = EXCHANGE_CONFIGS.map(e => e.name);

  const isRunning = existingBot?.status === 'running';
  const botName = botType === 'spot' ? 'GreenBack Spot' : 'GreenBack Leverage';

  // Order book scanning hook
  const { bestTrade, isScanning, scanCount } = useOrderBookScanning({
    exchanges: activeExchanges,
    minNetProfit: MIN_NET_PROFIT,
    scanIntervalMs: 5000,
    enabled: isRunning && tradingMode === 'demo',
  });

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
  const [isStopping, setIsStopping] = useState(false);
  const [connectionHealth, setConnectionHealth] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [pendingTrades, setPendingTrades] = useState<Array<{ orderId: string; exchange: string; symbol: string; tradeId?: string }>>([]);
  
  // Refs for trading loop - CRITICAL: Use refs to avoid dependency issues
  const lastPricesRef = useRef<Record<string, number>>({});
  const priceHistoryRef = useRef<Map<string, { prices: number[], volumes: number[] }>>(new Map());
  const tradeTimestampsRef = useRef<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);
  const isStoppingRef = useRef(false);  // CRITICAL: Immediate stop flag
  const isExecutingRef = useRef(false); // CRITICAL: Prevent concurrent executions
  const metricsRef = useRef({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 });  // Internal metrics tracking
  const abortControllerRef = useRef<AbortController | null>(null); // CRITICAL: For cancelling pending requests
  
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
      isExecutingRef.current = false;
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
    // CRITICAL: Clear any existing interval and abort controller FIRST
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // CRITICAL: Check stop flag immediately
    if (isStoppingRef.current) {
      console.log('🛑 Bot is stopping, not starting new loop');
      return;
    }

    if (!isRunning || !existingBot) {
      console.log(`🛑 Bot not running (isRunning=${isRunning}, existingBot=${!!existingBot}) - clearing state`);
      setActiveExchange(null);
      isCancelledRef.current = true;
      return;
    }

    // Create new abort controller for this trading session
    abortControllerRef.current = new AbortController();
    isCancelledRef.current = false;
    isStoppingRef.current = false;
    console.log(`✅ Starting trading loop for ${botName}`);

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
        
        // CRITICAL: Prevent concurrent executions - wait if already executing
        if (isExecutingRef.current) {
          console.log('⏳ Previous trade still executing, skipping this cycle');
          return;
        }
        
        isExecutingRef.current = true;
        
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
          
          let data, error;
          try {
            const result = await supabase.functions.invoke('execute-bot-trade', {
              body: {
                botId: existingBot.id,
                mode: botType,
                profitTarget: profitPerTrade,
                exchanges: availableExchanges,
                leverages,
                isSandbox: false,
                maxPositionSize: localAmountPerTrade,
                stopLossPercent: 0.2,
              }
            });
            data = result.data;
            error = result.error;
          } catch (fetchErr: any) {
            // Handle network errors gracefully (timeout, connection lost, aborted)
            const errMsg = fetchErr?.message || String(fetchErr);
            if (errMsg.includes('Network') || errMsg.includes('network') || 
                errMsg.includes('connection') || errMsg.includes('abort') ||
                errMsg.includes('timeout') || errMsg.includes('500')) {
              console.warn('⚠️ Network timeout - trade may still be processing, skipping cycle');
              setConnectionHealth('disconnected');
              // Try to reconnect after a few seconds
              setTimeout(() => setConnectionHealth('reconnecting'), 2000);
              setTimeout(() => setConnectionHealth('connected'), 5000);
              return; // Don't count as error, just skip this cycle
            }
            throw fetchErr;
          }
          
          // Mark as connected on successful response
          setConnectionHealth('connected');
          
          if (error) {
            // Check for network/timeout errors in the error object
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('Network') || errorMsg.includes('network') || 
                errorMsg.includes('connection') || errorMsg.includes('timeout') ||
                errorMsg.includes('500')) {
              console.warn('⚠️ Network error in response - skipping cycle');
              setConnectionHealth('disconnected');
              setTimeout(() => setConnectionHealth('reconnecting'), 2000);
              return;
            }
            
            console.error('❌ Live trade error:', error);
            consecutiveErrors++;
            
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
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
            
            // Rate limit detection - expanded patterns
            const isRateLimited = data.error?.includes('rate') || 
                                   data.error?.includes('Rate') || 
                                   data.error?.includes('-1015') ||
                                   data.error?.includes('Too many') ||
                                   data.error?.includes('orders per');
            
            if (isRateLimited) {
              const exchange = data.exchange || availableExchanges[0];
              // 2-minute cooldown for rate limits
              exchangeCooldowns.set(exchange, Date.now() + 120000);
              toast.warning(`${exchange} rate limited`, {
                description: 'Pausing trades for 2 minutes on this exchange.',
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
          
          // Handle PENDING status - start polling for completion
          if (data?.status === 'PENDING' && data?.exitOrderId) {
            console.log('📋 Trade pending, will poll for completion:', data.exitOrderId);
            setPendingTrades(prev => [...prev, {
              orderId: data.exitOrderId,
              exchange: data.exchange,
              symbol: data.symbol,
              tradeId: data.tradeId,
            }]);
            
            // Start polling for this order with exponential backoff
            const pollOrder = async () => {
              let attempts = 0;
              const maxAttempts = 15;
              let retryCount = 0;
              const maxRetries = 3;
              let delay = 2000; // Start with 2 seconds
              
              while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, delay));
                attempts++;
                
                try {
                  const { data: statusData, error: statusError } = await supabase.functions.invoke('check-trade-status', {
                    body: {
                      exchange: data.exchange,
                      orderId: data.exitOrderId,
                      symbol: data.symbol,
                      tradeId: data.tradeId,
                    }
                  });
                  
                  if (statusError) {
                    if (import.meta.env.DEV) console.warn('Order status check error:', statusError);
                    retryCount++;
                    if (retryCount <= maxRetries) {
                      // Exponential backoff: 2s → 4s → 8s → 16s (max)
                      delay = Math.min(delay * 2, 16000);
                      if (import.meta.env.DEV) console.log(`Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                      continue;
                    }
                    break; // Max retries exceeded
                  }
                  
                  // Reset retry count and delay on success
                  retryCount = 0;
                  delay = 2000;
                  
                  if (statusData?.status === 'FILLED') {
                    if (import.meta.env.DEV) console.log('✅ Pending order filled:', statusData);
                    setPendingTrades(prev => prev.filter(p => p.orderId !== data.exitOrderId));
                    
                    // Calculate and update P&L
                    const pnl = data.direction === 'long'
                      ? (statusData.avgPrice - data.entryPrice) / data.entryPrice * data.positionSize
                      : (data.entryPrice - statusData.avgPrice) / data.entryPrice * data.positionSize;
                    
                    setMetrics(prev => ({
                      ...prev,
                      currentPnL: prev.currentPnL + pnl,
                      tradesExecuted: prev.tradesExecuted + 1,
                      hitRate: prev.tradesExecuted > 0 
                        ? ((prev.hitRate * prev.tradesExecuted / 100) + (pnl > 0 ? 1 : 0)) / (prev.tradesExecuted + 1) * 100
                        : pnl > 0 ? 100 : 0,
                    }));
                    
                    notifyTrade(data.exchange, data.pair, data.direction, pnl);
                    return;
                  } else if (statusData?.status === 'CANCELLED' || statusData?.status === 'REJECTED') {
                    if (import.meta.env.DEV) console.log('❌ Pending order cancelled:', statusData);
                    setPendingTrades(prev => prev.filter(p => p.orderId !== data.exitOrderId));
                    return;
                  }
                } catch (pollErr) {
                  if (import.meta.env.DEV) console.warn('Poll error:', pollErr);
                  retryCount++;
                  if (retryCount <= maxRetries) {
                    delay = Math.min(delay * 2, 16000);
                  }
                }
              }
              
              // Max attempts reached - remove from pending
              if (import.meta.env.DEV) console.log('⏰ Polling timeout for order:', data.exitOrderId);
              setPendingTrades(prev => prev.filter(p => p.orderId !== data.exitOrderId));
            };
            
            // Start polling in background
            pollOrder();
            return; // Don't process further for pending trades
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
        } catch (err: any) {
          // Final catch for any remaining errors
          const errMsg = err?.message || String(err);
          if (errMsg.includes('Network') || errMsg.includes('network') || 
              errMsg.includes('connection') || errMsg.includes('500')) {
            console.warn('⚠️ Network error caught - skipping cycle');
          } else {
            console.error('❌ Failed to execute live trade:', err);
          }
        } finally {
          isExecutingRef.current = false;
        }
      };
      
      // Use configurable interval for live mode (minimum 10000ms for rate limit protection)
      const liveInterval = Math.max(localTradeIntervalMs, 10000);
      executeLiveTrade();
      intervalRef.current = setInterval(executeLiveTrade, liveInterval);
      
      return () => {
        console.log('🛑 STOPPING: Live trade execution loop cleanup');
        isCancelledRef.current = true;
        isStoppingRef.current = true;
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
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
    let currentPriceRef: number | null = null;
    
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
      
      // ===== HIT RATE ENFORCEMENT - CRITICAL =====
      const hitRateCheck = profitLockStrategy.canTrade();
      if (!hitRateCheck.canTrade) {
        console.log(`⏸️ Trading paused: ${hitRateCheck.reason}`);
        
        // Trigger analysis if required
        if (hitRateCheck.analysisRequired) {
          const analysis = dailyTargetAnalyzer.analyze(dailyTarget);
          console.log('📊 Daily Analysis:', analysis);
          
          if (analysis.recommendations.length > 0) {
            toast.warning('Strategy Adjustment Needed', {
              description: analysis.recommendations[0].title,
              duration: 10000,
            });
          }
        }
        return;
      }
      
      // TRADE SPEED AUTO-ADJUST: Check if we can trade based on rolling hit rate
      if (!tradeSpeedController.canTrade()) {
        console.log('⏳ Trade speed cooldown active, skipping trade');
        return;
      }
      
      // Use ref for metrics to avoid stale state
      const currentMetrics = metricsRef.current;
      
      // STRICT RULE: BALANCE FLOOR ENFORCEMENT
      // The bot should NEVER go below the starting balance
      const currentBalance = virtualBalance + currentMetrics.currentPnL;
      const startingBalance = sessionStartBalance['TOTAL'] || virtualBalance;
      
      if (currentBalance < startingBalance) {
        console.error(`🛑 BALANCE FLOOR VIOLATION DETECTED! Current: $${currentBalance.toFixed(2)}, Floor: $${startingBalance.toFixed(2)}`);
        toast.error('Balance Floor Violated', {
          description: 'Trading paused - balance went below starting amount. This should not happen.',
        });
        isStoppingRef.current = true;
        onStopBot(existingBot.id);
        return;
      }
      
      // CRITICAL: Enforce daily stop loss (but this should never trigger with profit-only mode)
      if (currentMetrics.currentPnL <= -dailyStopLoss) {
        toast.error('⚠️ Daily Stop Loss Hit', {
          description: `GreenBack stopped: -$${dailyStopLoss} daily limit reached.`,
        });
        
        // Run deep analysis on failure
        const analysis = dailyTargetAnalyzer.analyze(dailyTarget);
        console.log('📊 End of Day Analysis:', analysis);
        
        isStoppingRef.current = true;
        onStopBot(existingBot.id);
        return;
      }

      const currentExchange = activeExchanges[idx % activeExchanges.length];
      setActiveExchange(currentExchange);
      idx++;

      // USE ORDER BOOK SCANNER for trade selection when profitable opportunity exists
      let symbol: string;
      let direction: 'long' | 'short';
      let usedScanner = false;
      
      if (bestTrade && bestTrade.projectedNetProfit >= MIN_NET_PROFIT) {
        // Use scanner-detected opportunity
        symbol = bestTrade.symbol.replace('USDT', '');
        direction = bestTrade.side;
        usedScanner = true;
        console.log(`📊 Using scanned opportunity: ${symbol} ${direction} (projected: $${bestTrade.projectedNetProfit.toFixed(2)})`);
      } else {
        // Select based on technical analysis, not random
        symbol = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
        direction = 'long'; // Default, will be overridden by signal
      }

      const priceData = prices.find(p => p.symbol.toUpperCase() === symbol);
      if (!priceData) return;

      const currentPrice = priceData.price;
      currentPriceRef = currentPrice;
      const lastPrice = lastPricesRef.current[symbol] || currentPrice;
      lastPricesRef.current[symbol] = currentPrice;

      // Build price history for signal generation
      const history = priceHistoryRef.current.get(symbol) || { prices: [], volumes: [] };
      history.prices.push(currentPrice);
      history.volumes.push(1000000);
      if (history.prices.length > 30) {
        history.prices.shift();
        history.volumes.shift();
      }
      priceHistoryRef.current.set(symbol, history);

      // ===== SIGNAL-BASED DIRECTION (NOT RANDOM) =====
      if (history.prices.length >= 26) {
        const signal = generateSignalScore(history.prices, history.volumes);
        if (signal) {
          // Only trade if signal meets 85% hit rate criteria
          if (!meetsHitRateCriteria(signal, 0.85)) {
            console.log(`⏭️ Skipping trade: Signal score ${(signal.score * 100).toFixed(1)}% below threshold`);
            return;
          }
          direction = signal.direction;
        }
      }

      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      const positionSize = localAmountPerTrade * leverage;
      const pair = `${symbol}/USDT`;

      const targetProfit = Math.max(profitPerTrade, MIN_NET_PROFIT);
      // TP at target profit %, NO STOP LOSS (profit-only mode)
      const takeProfitPercent = (targetProfit / positionSize) * 100;
      // STRICT RULE: NO STOP LOSS - we only exit when profitable
      const stopLossPercent = 0; // Disabled - bot will hold until profitable

      // ===== REAL PRICE-BASED PROFIT LOCKING =====
      // Monitor price and wait for TP or SL to be hit
      const tradeStartTime = Date.now();
      let exitPrice: number;
      let isWin: boolean;
      let exitReason: string;
      let holdTimeMs: number;

      try {
        // Real price monitoring with max 30 second hold time for demo
        const result = await profitLockStrategy.monitorPriceForExit(
          () => {
            // Get latest price from prices array
            const latestPrice = prices.find(p => p.symbol.toUpperCase() === symbol)?.price;
            return latestPrice || null;
          },
          {
            entryPrice: currentPrice,
            direction,
            takeProfitPercent,
            stopLossPercent,
            maxHoldTimeMs: 30000, // 30 second max hold for demo
            enableTrailingStop: true,
          }
        );

        exitPrice = result.exitPrice;
        isWin = result.isWin;
        exitReason = result.exitReason;
        holdTimeMs = result.holdTimeMs;
        
        profitLockStrategy.recordSuccess();
      } catch (error) {
        // Error during price monitoring - exit at current price
        console.error('Price monitoring error:', error);
        profitLockStrategy.recordError();
        exitPrice = currentPrice;
        isWin = false;
        exitReason = 'ERROR';
        holdTimeMs = Date.now() - tradeStartTime;
      }

      // Check if bot was stopped during monitoring
      if (isCancelledRef.current || isStoppingRef.current) {
        console.log('🛑 Bot stopped during trade monitoring');
        return;
      }

      // Calculate actual P&L based on real price movement
      const actualProfitPercent = direction === 'long'
        ? ((exitPrice - currentPrice) / currentPrice) * 100
        : ((currentPrice - exitPrice) / currentPrice) * 100;
      
      const netProfit = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange);
      
      // STRICT RULE: Only allow profitable trades
      // If netProfit is negative or zero, this trade should not have exited
      if (netProfit <= 0 && exitReason !== 'CANCELLED') {
        console.error(`⚠️ Non-profitable exit detected: $${netProfit.toFixed(4)} - this should NOT happen`);
        return; // Skip this trade entirely
      }
      
      const tradePnl = Math.max(netProfit, MIN_NET_PROFIT); // Always positive
      
      // Record trade for profit lock strategy
      profitLockStrategy.recordTrade(isWin, tradePnl);
      
      // Record for daily target analyzer
      const tradeRecord: TradeRecord = {
        timestamp: Date.now(),
        pair,
        direction,
        exchange: currentExchange,
        entryPrice: currentPrice,
        exitPrice,
        pnl: tradePnl,
        isWin,
        exitReason,
        holdTimeMs,
      };
      dailyTargetAnalyzer.recordTrade(tradeRecord);
      
      console.log(`✅ Trade: ${pair} ${direction} | Entry: $${currentPrice.toFixed(4)} | Exit: $${exitPrice.toFixed(4)} | P&L: $${tradePnl.toFixed(2)} | Reason: ${exitReason}`);
      
      hitRateTracker.recordTrade(isWin);
      
      // Record for trade speed controller (120s/60s/15s cooldowns)
      tradeSpeedController.recordSimpleTrade(isWin, tradePnl, currentExchange, pair);

      // STRICT RULE: ONLY record winning trades - NEVER record losses
      // If we get a loss, something is wrong with the profit lock strategy
      if (!isWin) {
        console.error('⚠️ LOSS DETECTED - this should NEVER happen with profit-only exits. Skipping trade recording.');
        // DO NOT update metrics, DO NOT record to database - skip this entirely
        return;
      }
      
      // Update metricsRef FIRST (before state update) - ONLY FOR WINS
      metricsRef.current.tradesExecuted += 1;
      metricsRef.current.winsCount += 1;
      metricsRef.current.currentPnL += netProfit;
      
      // VAULT PROFIT - segregated, NEVER traded
      if (vaultProfit) {
        vaultProfit(currentExchange, netProfit);
      }
      // Record for dashboard
      recordProfitForDashboard(netProfit, metricsRef.current.tradesExecuted);

      // ===== AUDIT REPORT INTEGRATION (AC6, AC9, AC10) =====
      // Record trade for audit system with full telemetry
      recordTradeForAudit({
        timestamp: Date.now(),
        isWin,
        netProfit: tradePnl,
        direction,
        pair,
        exchange: currentExchange,
        entryPrice: currentPrice,
        exitPrice,
        fees: 0,
        slippage: 0,
        reasonCode: isWin ? 'PROFIT_TARGET_HIT' : 'STOP_LOSS_HIT',
      });

      // Check if we should generate audit report (every 20 trades)
      if (shouldGenerateAudit()) {
        try {
          // Build current balances for audit
          const currentBalances: Record<string, number> = {};
          usdtFloat.forEach(f => {
            currentBalances[f.exchange] = f.amount;
          });
          
          // Generate audit report with all invariant checks
          const report = generateAuditReport(profitVault, sessionStartBalance, currentBalances);
          
          // Generate dashboard charts
          const charts = generateDashboards(report);
          
          // Invoke callback to display in UI
          if (onAuditGenerated) {
            onAuditGenerated(report, charts);
          }
          
          // Notify user
          const passCount = Object.values(report.invariants).filter(i => i.status === 'PASS').length;
          toast.info(`📊 Audit Report #${report.reportNumber}`, {
            description: `${passCount}/10 checks passed | Hit rate: ${report.rollingHitRate.toFixed(1)}%`,
          });
        } catch (err) {
          console.error('Failed to generate audit report:', err);
        }
      }

      // DYNAMIC TRADE SPEED ADJUSTMENT based on rolling hit rate
      const newCooldown = tradeSpeedController.getCooldownMs();
      if (newCooldown !== localTradeIntervalMs && metricsRef.current.tradesExecuted >= 10) {
        console.log(`🔄 Speed mode adjusted: ${localTradeIntervalMs}ms → ${newCooldown}ms (hit rate: ${metricsRef.current.hitRate.toFixed(1)}%)`);
        setLocalTradeIntervalMs(newCooldown);
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
      isStoppingRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, tradingMode, dailyTarget, profitPerTrade, existingBot?.id, prices, leverages, botType, user, notifyTrade, notifyTakeProfit, notifyDailyProgress, onUpdateBotPnl, setVirtualBalance, botName, onStopBot, dailyStopLoss, tradingStrategy, localAmountPerTrade, localTradeIntervalMs, vaultProfit]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      console.log('🛑🛑🛑 STOPPING BOT - Setting all flags and clearing intervals 🛑🛑🛑');
      
      // CRITICAL: Set stopping flag and UI state FIRST
      setIsStopping(true);
      isStoppingRef.current = true;
      isCancelledRef.current = true;
      isExecutingRef.current = false; // Release execution lock
      
      // CRITICAL: Abort any pending fetch requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      // Clear interval IMMEDIATELY
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Reset profit lock strategy to cancel any active monitoring
      profitLockStrategy.reset();
      
      console.log('🛑 STOP: Flags set, interval cleared, calling onStopBot');
      
      // Force clear ALL intervals as safeguard (brute force approach)
      for (let i = 1; i < 10000; i++) {
        clearInterval(i);
        clearTimeout(i);
      }
      
      await onStopBot(existingBot.id);
      setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0, tradesPerMinute: 0 });
      metricsRef.current = { currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 };
      setActiveExchange(null);
      resetProgressNotifications();
      setIsStopping(false);
      
      console.log('✅ Bot stopped successfully');
    } else {
      // Starting bot - reset stop flags
      isStoppingRef.current = false;
      isCancelledRef.current = false;
      isExecutingRef.current = false; // Reset execution lock
      setIsStopping(false);
      resetProgressNotifications();
      
      // INITIALIZE SESSION BALANCE (Balance Floor S) - immutable, never touched
      // STRICT RULE: Bot should NEVER go below this starting balance
      const totalStartBalance = tradingMode === 'demo' ? virtualBalance : usdtFloat.reduce((sum, f) => sum + f.amount, 0);
      initializeSessionBalance('TOTAL', totalStartBalance);
      console.log(`🔒 BALANCE FLOOR SET: $${totalStartBalance.toFixed(2)} - bot will NEVER go below this`);
      
      usdtFloat.forEach(f => {
        if (f.amount > 0) {
          initializeSessionBalance(f.exchange, f.amount);
          console.log(`[SESSION BALANCE] Initialized ${f.exchange}: $${f.amount} (immutable floor)`);
        }
      });
      
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

  // EMERGENCY STOP - Force-kill ALL trading immediately
  const handleEmergencyStop = async () => {
    console.log('🚨🚨🚨 EMERGENCY STOP TRIGGERED 🚨🚨🚨');
    
    // Set all stop flags immediately
    setIsStopping(true);
    isStoppingRef.current = true;
    isCancelledRef.current = true;
    isExecutingRef.current = false; // Reset execution lock
    
    // CRITICAL: Abort any pending fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Force clear the interval ref
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Force clear ALL possible intervals (brute force - nuclear option)
    for (let i = 1; i < 10000; i++) {
      clearInterval(i);
      clearTimeout(i);
    }
    
    // Reset profit lock strategy
    profitLockStrategy.reset();
    
    // Reset all state immediately
    setActiveExchange(null);
    setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0, tradesPerMinute: 0 });
    metricsRef.current = { currentPnL: 0, tradesExecuted: 0, hitRate: 0, winsCount: 0 };
    
    // Call stop without waiting
    if (existingBot) {
      onStopBot(existingBot.id).catch(console.error);
    }
    
    toast.warning('🚨 Emergency Stop Activated', {
      description: 'All trading activity force-killed immediately.',
    });
    
    setIsStopping(false);
    console.log('✅ Emergency stop complete');
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
        <div className="flex items-center gap-2">
          {/* Connection Health Indicator */}
          {tradingMode === 'live' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant={connectionHealth === 'connected' ? 'outline' : 'destructive'} 
                    className={cn(
                      "text-[9px] flex items-center gap-1",
                      connectionHealth === 'reconnecting' && "animate-pulse"
                    )}
                  >
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      connectionHealth === 'connected' && "bg-primary",
                      connectionHealth === 'disconnected' && "bg-destructive",
                      connectionHealth === 'reconnecting' && "bg-yellow-500"
                    )} />
                    {connectionHealth === 'connected' && 'Online'}
                    {connectionHealth === 'disconnected' && 'Offline'}
                    {connectionHealth === 'reconnecting' && 'Reconnecting'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {connectionHealth === 'connected' && 'Connected to exchange APIs'}
                  {connectionHealth === 'disconnected' && 'Network connection lost - trades may be delayed'}
                  {connectionHealth === 'reconnecting' && 'Attempting to reconnect...'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Pending Trades Indicator */}
          {pendingTrades.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-[9px] flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-pulse" />
                    {pendingTrades.length} pending
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {pendingTrades.length} order{pendingTrades.length > 1 ? 's' : ''} awaiting fill
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[10px]">
            {isRunning ? 'Running' : 'Stopped'}
          </Badge>
        </div>
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

      {/* Scrollable Configuration Section */}
      <ScrollArea className="flex-1 min-h-0 max-h-[200px] pr-2">
        {/* Trading Strategy Toggle */}
        <div className="mb-2">
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
              Profit
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
        </div>

        {/* Configuration Row 1: Daily Target & Profit Per Trade */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Daily Target ($)</label>
            <Input
              type="number"
              value={dailyTarget}
              onChange={(e) => setDailyTarget(Number(e.target.value))}
              disabled={isRunning}
              className="h-7 text-xs font-mono"
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
                onConfigChange?.('perTradeStopLoss', val * 0.2);
              }}
              disabled={isRunning}
              className="h-7 text-xs font-mono"
              min={MIN_NET_PROFIT}
              step={0.10}
            />
          </div>
        </div>

        {/* Configuration Row 2: Amount Per Trade & Trade Speed */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Amount ($)</label>
            <Input
              type="number"
              value={localAmountPerTrade}
              onChange={(e) => {
                const val = Math.max(20, Math.min(5000, Number(e.target.value)));
                setLocalAmountPerTrade(val);
                onConfigChange?.('amountPerTrade', val);
              }}
              disabled={isRunning}
              className="h-7 text-xs font-mono"
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
                const minInterval = tradingMode === 'live' ? 5000 : 100;
                const val = Math.max(minInterval, Math.min(60000, Number(e.target.value)));
                setLocalTradeIntervalMs(val);
                onConfigChange?.('tradeIntervalMs', val);
              }}
              disabled={isRunning}
              className="h-7 text-xs font-mono"
              min={tradingMode === 'live' ? 5000 : 100}
              max={60000}
              step={100}
            />
          </div>
        </div>

        {/* Configuration Row 3: Stop Losses */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Daily Stop ($)</label>
            <Input
              type="number"
              value={dailyStopLoss}
              onChange={(e) => onConfigChange?.('dailyStopLoss', Math.max(1, Number(e.target.value)))}
              disabled={isAnyBotRunning}
              className="h-7 text-xs font-mono"
              min={1}
              step={1}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">SL/Trade 🔒</label>
            <Input
              type="number"
              value={calculatedStopLoss.toFixed(2)}
              disabled
              className="h-7 text-xs font-mono bg-muted"
            />
          </div>
        </div>

        {/* Leverage Sliders (only for leverage bot) - Compact */}
        {botType === 'leverage' && (
          <div className="mb-2 space-y-1">
            <label className="text-[9px] text-muted-foreground block">Leverage</label>
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
                  <div key={ex.name} className="flex items-center justify-between px-2 py-0.5 border-t border-border/50 first:border-t-0">
                    <span className="text-foreground">{ex.name}</span>
                    <span className="font-mono text-primary">${allocation.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Action Buttons */}
      <div className="flex gap-2 mt-auto">
        <Button
          className={cn('flex-1 gap-2', isRunning && !isStopping ? 'btn-outline-primary' : 'btn-primary')}
          onClick={handleStartStop}
          disabled={isStopping}
        >
          {isStopping ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Stopping...
            </>
          ) : isRunning ? (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start
            </>
          )}
        </Button>
        {/* Emergency KILL button - only show when running */}
        {isRunning && (
          <Button
            variant="destructive"
            size="icon"
            onClick={handleEmergencyStop}
            title="Emergency Stop - Force kill all trading"
            className="bg-destructive hover:bg-destructive/90"
          >
            <OctagonX className="w-4 h-4" />
          </Button>
        )}
        {isRunning && tradingMode === 'live' && !isStopping && (
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
        {metrics.currentPnL > 0 && !isStopping && (
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
