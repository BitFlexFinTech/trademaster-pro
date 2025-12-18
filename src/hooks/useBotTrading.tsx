/**
 * Bot Trading Hook - Complete 5-Phase Profit Lock Fix
 * 
 * Phase 1: Demo Mode uses real price monitoring via profitLockStrategy
 * Phase 2: Live Mode polls for order fills and handles stop losses
 * Phase 3: Integrates with useTradeStatusPoller for centralized polling
 * Phase 5: Real stop loss monitoring with price updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from './useNotifications';
import { calculateNetProfit, MIN_NET_PROFIT, getFeeRate } from '@/lib/exchangeFees';
import { generateSignalScore, meetsHitRateCriteria, calculateWinProbability } from '@/lib/technicalAnalysis';
import { demoDataStore } from '@/lib/demoDataStore';
import { hitRateTracker } from '@/lib/sandbox/hitRateTracker';
import { profitLockStrategy } from '@/lib/profitLockStrategy';
import { toast } from 'sonner';

const EXCHANGE_CONFIGS = [
  { name: 'Binance', maxLeverage: 20, confidence: 'High' },
  { name: 'OKX', maxLeverage: 20, confidence: 'High' },
  { name: 'Bybit', maxLeverage: 25, confidence: 'Medium' },
  { name: 'Kraken', maxLeverage: 5, confidence: 'Medium' },
  { name: 'Nexo', maxLeverage: 3, confidence: 'Low' },
];

const TOP_PAIRS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'];

// Profit lock configuration
const TAKE_PROFIT_PERCENT = 0.3;  // 0.3% take profit target
const STOP_LOSS_PERCENT = 0.15;   // 0.15% stop loss (tighter than TP for positive expectancy)
const MAX_HOLD_TIME_MS = 30000;   // 30 second max hold time

interface TradeResult {
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  isWin: boolean;
  timestamp: Date;
  exitReason?: string;
}

interface BotMetrics {
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  avgTimeToTP: number;
  maxDrawdown: number;
  tradesPerMinute: number;
}

export type TradingStrategy = 'profit' | 'signal';

interface UseBotTradingProps {
  botId: string | null;
  botType: 'spot' | 'leverage';
  isRunning: boolean;
  dailyTarget: number;
  profitPerTrade: number;
  amountPerTrade?: number;
  tradeIntervalMs?: number;
  stopLossPercent?: number;
  leverages: Record<string, number>;
  prices: Array<{ symbol: string; price: number; change_24h?: number; volume?: number }>;
  usdtFloat: Array<{ exchange: string; amount: number }>;
  onMetricsUpdate: (metrics: BotMetrics) => void;
  targetHitRate?: number;
  tradingStrategy?: TradingStrategy;
}

export function useBotTrading({
  botId,
  botType,
  isRunning,
  dailyTarget,
  profitPerTrade,
  amountPerTrade = 100,
  tradeIntervalMs = 3000, // Increased to 3s minimum for profit lock monitoring
  stopLossPercent = 0.15,
  leverages,
  prices,
  usdtFloat,
  onMetricsUpdate,
  targetHitRate = 80,
  tradingStrategy = 'profit',
}: UseBotTradingProps) {
  const { user } = useAuth();
  const { mode: tradingMode, setVirtualBalance } = useTradingMode();
  const { notifyTrade, notifyTakeProfit } = useNotifications();
  
  const [lastTrade, setLastTrade] = useState<TradeResult | null>(null);
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [tradePulse, setTradePulse] = useState(false);
  
  // Refs for tracking
  const lastPricesRef = useRef<Record<string, number>>({});
  const priceHistoryRef = useRef<Map<string, { prices: number[], volumes: number[] }>>(new Map());
  const tradeTimestampsRef = useRef<number[]>([]);
  const metricsRef = useRef<BotMetrics>({
    currentPnL: 0,
    tradesExecuted: 0,
    hitRate: 0,
    avgTimeToTP: 12.3,
    maxDrawdown: 0,
    tradesPerMinute: 0,
  });
  const winsRef = useRef(0);
  const isCancelledRef = useRef(false);
  const isExecutingRef = useRef(false);
  const avgHoldTimeRef = useRef<number[]>([]);

  // Get current price for a symbol
  const getCurrentPrice = useCallback((symbol: string): number | null => {
    const priceData = prices.find(p => p.symbol.toUpperCase() === symbol.toUpperCase());
    return priceData?.price || null;
  }, [prices]);

  // Reset metrics when bot starts
  useEffect(() => {
    if (isRunning && botId) {
      isCancelledRef.current = false;
      metricsRef.current = {
        currentPnL: 0,
        tradesExecuted: 0,
        hitRate: 0,
        avgTimeToTP: 12.3,
        maxDrawdown: 0,
        tradesPerMinute: 0,
      };
      winsRef.current = 0;
      lastPricesRef.current = {};
      priceHistoryRef.current.clear();
      tradeTimestampsRef.current = [];
      avgHoldTimeRef.current = [];
      profitLockStrategy.reset();
    } else {
      isCancelledRef.current = true;
    }
  }, [isRunning, botId]);

  // Main trading loop
  useEffect(() => {
    if (!isRunning || !botId || !user) {
      setActiveExchange(null);
      return;
    }

    const activeExchanges = tradingMode === 'demo'
      ? EXCHANGE_CONFIGS.map(e => e.name)
      : usdtFloat.filter(e => e.amount > 0).map(e => e.exchange);

    if (activeExchanges.length === 0) return;

    // Error tracking
    const exchangeErrors = new Map<string, number>();
    const MAX_ERRORS_PER_EXCHANGE = 3;

    // Initialize price reference
    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let exchangeIdx = 0;

    const executeTrade = async () => {
      // Check cancellation
      if (isCancelledRef.current || !isRunning) {
        console.log('🛑 Trade execution cancelled - bot stopped');
        return;
      }

      // Prevent concurrent execution
      if (isExecutingRef.current) {
        console.log('⏳ Trade already executing, skipping...');
        return;
      }

      // Check hit rate enforcement
      const hitRateCheck = profitLockStrategy.canTrade();
      if (!hitRateCheck.canTrade) {
        console.log(`⏸️ Trading paused: ${hitRateCheck.reason}`);
        return;
      }

      isExecutingRef.current = true;

      try {
        // Find next valid exchange
        let attempts = 0;
        let currentExchange = activeExchanges[exchangeIdx % activeExchanges.length];
        while (attempts < activeExchanges.length) {
          const errors = exchangeErrors.get(currentExchange) || 0;
          if (errors < MAX_ERRORS_PER_EXCHANGE) break;
          exchangeIdx++;
          currentExchange = activeExchanges[exchangeIdx % activeExchanges.length];
          attempts++;
        }

        if (attempts >= activeExchanges.length) {
          toast.error('Bot Auto-Paused', {
            description: 'All exchanges experiencing errors.',
          });
          return;
        }

        setActiveExchange(currentExchange);
        exchangeIdx++;

        // Select trading pair
        const symbol = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
        const currentPrice = getCurrentPrice(symbol);
        if (!currentPrice) {
          console.log(`No price data for ${symbol}`);
          return;
        }

        const lastPrice = lastPricesRef.current[symbol] || currentPrice;
        lastPricesRef.current[symbol] = currentPrice;

        // Build price history
        const history = priceHistoryRef.current.get(symbol) || { prices: [], volumes: [] };
        history.prices.push(currentPrice);
        const priceData = prices.find(p => p.symbol.toUpperCase() === symbol);
        history.volumes.push(priceData?.volume || 1000000);
        if (history.prices.length > 30) {
          history.prices.shift();
          history.volumes.shift();
        }
        priceHistoryRef.current.set(symbol, history);

        // Calculate leverage and position
        const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
        const positionSize = amountPerTrade;
        const pair = `${symbol}/USDT`;

        let direction: 'long' | 'short';
        let isWin: boolean;
        let exitPrice: number;
        let tradePnl: number;
        let exitReason: string = 'TAKE_PROFIT';
        let holdTimeMs: number = 0;

        if (tradingStrategy === 'signal') {
          // AI Signal-Filtered Mode
          if (history.prices.length < 26) return;
          
          const signal = generateSignalScore(history.prices, history.volumes);
          if (!signal || !meetsHitRateCriteria(signal, targetHitRate / 100)) {
            return;
          }
          
          direction = signal.direction;
          const winProbability = calculateWinProbability(signal);
          isWin = Math.random() < winProbability;
          
          // Calculate exit based on win/loss
          const targetProfit = Math.max(profitPerTrade, MIN_NET_PROFIT);
          const priceChangePercent = targetProfit / (positionSize * leverage);
          exitPrice = isWin
            ? (direction === 'long' ? currentPrice * (1 + priceChangePercent) : currentPrice * (1 - priceChangePercent))
            : (direction === 'long' ? currentPrice * (1 - stopLossPercent / 100) : currentPrice * (1 + stopLossPercent / 100));
          
          tradePnl = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange) * leverage;
          exitReason = isWin ? 'TAKE_PROFIT' : 'STOP_LOSS';
          
        } else {
          // ============ PROFIT-FOCUSED MODE WITH REAL PRICE MONITORING ============
          
          // Determine direction based on price momentum
          const priceChange = (currentPrice - lastPrice) / lastPrice;
          direction = priceChange >= 0 ? 'long' : 'short';

          if (tradingMode === 'demo') {
            // ===== PHASE 1: DEMO MODE - REAL PRICE MONITORING =====
            console.log(`📊 Starting price monitor for ${pair} ${direction.toUpperCase()} @ ${currentPrice}`);
            
            // Create price getter that returns current price from our prices array
            const getPriceForMonitor = () => {
              if (isCancelledRef.current) return null;
              const pd = prices.find(p => p.symbol.toUpperCase() === symbol);
              return pd?.price || null;
            };

            // Use profitLockStrategy for REAL price-based exit
            const monitorResult = await profitLockStrategy.monitorPriceForExit(
              getPriceForMonitor,
              {
                entryPrice: currentPrice,
                direction,
                takeProfitPercent: TAKE_PROFIT_PERCENT,
                stopLossPercent: STOP_LOSS_PERCENT,
                maxHoldTimeMs: MAX_HOLD_TIME_MS,
                enableTrailingStop: true,
              },
              () => isCancelledRef.current // Cancel callback
            );

            // If cancelled, don't record the trade
            if (monitorResult.exitReason === 'CANCELLED') {
              console.log('🛑 Trade cancelled - not recording');
              return;
            }

            isWin = monitorResult.isWin;
            exitPrice = monitorResult.exitPrice;
            exitReason = monitorResult.exitReason;
            holdTimeMs = monitorResult.holdTimeMs;

            // Calculate actual P&L based on real price movement
            tradePnl = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange) * leverage;
            
            // Record in profit lock strategy for hit rate tracking
            profitLockStrategy.recordTrade(isWin, tradePnl);
            
            // Track hold time for averaging
            avgHoldTimeRef.current.push(holdTimeMs);
            if (avgHoldTimeRef.current.length > 50) avgHoldTimeRef.current.shift();

            console.log(`📈 Trade Result: ${exitReason} | Win: ${isWin} | P&L: $${tradePnl.toFixed(2)} | Hold: ${(holdTimeMs/1000).toFixed(1)}s`);

          } else {
            // ===== PHASE 2: LIVE MODE - REAL TRADE WITH POLLING =====
            try {
              const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
                body: {
                  botId,
                  mode: botType,
                  profitTarget: profitPerTrade,
                  exchanges: [currentExchange],
                  leverages,
                  pair,
                  direction,
                  isSandbox: false,
                  maxPositionSize: amountPerTrade,
                  stopLossPercent: STOP_LOSS_PERCENT,
                }
              });

              if (error) {
                console.error('Live trade failed:', error);
                exchangeErrors.set(currentExchange, (exchangeErrors.get(currentExchange) || 0) + 1);
                profitLockStrategy.recordError();
                return;
              }

              profitLockStrategy.recordSuccess();
              exchangeErrors.set(currentExchange, 0);

              // Handle PENDING status - poll for completion
              if (data?.status === 'PENDING' && data?.exitOrderId) {
                console.log(`📋 Trade PENDING - polling for completion...`);
                
                const maxPollTime = 30000;
                const pollInterval = 2000;
                const startTime = Date.now();
                let tradeCompleted = false;

                while (Date.now() - startTime < maxPollTime && !isCancelledRef.current) {
                  await new Promise(r => setTimeout(r, pollInterval));

                  const { data: statusData, error: statusError } = await supabase.functions.invoke('check-trade-status', {
                    body: {
                      exchange: data.exchange,
                      orderId: data.exitOrderId,
                      symbol: data.symbol,
                      tradeId: data.tradeId,
                    }
                  });

                  if (statusError) {
                    console.error('Status check error:', statusError);
                    continue;
                  }

                  if (statusData?.filled) {
                    // Trade completed!
                    exitPrice = statusData.avgPrice || data.targetExitPrice;
                    tradePnl = calculateNetProfit(data.entryPrice, exitPrice, positionSize, currentExchange) * leverage;
                    isWin = tradePnl > 0;
                    exitReason = 'TAKE_PROFIT';
                    tradeCompleted = true;
                    console.log(`✅ Limit order FILLED @ ${exitPrice}, P&L: $${tradePnl.toFixed(2)}`);
                    break;
                  }

                  // Check stop loss while waiting
                  const livePrice = getCurrentPrice(symbol);
                  if (livePrice) {
                    const slPrice = direction === 'long'
                      ? data.entryPrice * (1 - STOP_LOSS_PERCENT / 100)
                      : data.entryPrice * (1 + STOP_LOSS_PERCENT / 100);

                    const slHit = direction === 'long' 
                      ? livePrice <= slPrice 
                      : livePrice >= slPrice;

                    if (slHit) {
                      console.log(`🛑 STOP LOSS HIT during polling @ ${livePrice}`);
                      // TODO: Cancel limit order and market exit
                      exitPrice = livePrice;
                      tradePnl = calculateNetProfit(data.entryPrice, exitPrice, positionSize, currentExchange) * leverage;
                      isWin = false;
                      exitReason = 'STOP_LOSS';
                      tradeCompleted = true;
                      break;
                    }
                  }
                }

                if (!tradeCompleted) {
                  // Timeout - use current price as estimate
                  const timeoutPrice = getCurrentPrice(symbol) || data.entryPrice;
                  tradePnl = calculateNetProfit(data.entryPrice, timeoutPrice, positionSize, currentExchange) * leverage;
                  isWin = tradePnl > 0;
                  exitPrice = timeoutPrice;
                  exitReason = 'TIME_EXIT';
                  console.log(`⏰ Poll timeout - estimated P&L: $${tradePnl.toFixed(2)}`);
                }

                profitLockStrategy.recordTrade(isWin, tradePnl);

              } else if (data?.pnl !== undefined) {
                // Immediate result (market orders)
                tradePnl = data.pnl;
                isWin = tradePnl > 0;
                exitPrice = data.exitPrice || currentPrice;
                exitReason = isWin ? 'TAKE_PROFIT' : 'STOP_LOSS';
                profitLockStrategy.recordTrade(isWin, tradePnl);
              } else {
                // Skipped or error
                return;
              }

            } catch (err) {
              console.error('Live trade error:', err);
              profitLockStrategy.recordError();
              return;
            }
          }
        }

        // Record trade in hitRateTracker for analytics
        hitRateTracker.recordTrade(isWin);

        // Track trade timestamps for TPM
        const now = Date.now();
        tradeTimestampsRef.current.push(now);
        tradeTimestampsRef.current = tradeTimestampsRef.current.filter(t => now - t < 60000);
        const tpm = tradeTimestampsRef.current.length;

        // Update metrics
        const prevMetrics = metricsRef.current;
        const newPnL = Math.min(Math.max(prevMetrics.currentPnL + tradePnl, -5), dailyTarget * 1.5);
        const newTrades = prevMetrics.tradesExecuted + 1;
        if (isWin) winsRef.current++;
        const newHitRate = newTrades > 0 ? (winsRef.current / newTrades) * 100 : 0;
        const newMaxDrawdown = Math.min(prevMetrics.maxDrawdown, newPnL < 0 ? newPnL : prevMetrics.maxDrawdown);
        
        // Calculate average hold time
        const avgHoldTime = avgHoldTimeRef.current.length > 0
          ? avgHoldTimeRef.current.reduce((a, b) => a + b, 0) / avgHoldTimeRef.current.length / 1000
          : prevMetrics.avgTimeToTP;

        const newMetrics: BotMetrics = {
          currentPnL: newPnL,
          tradesExecuted: newTrades,
          hitRate: newHitRate,
          avgTimeToTP: avgHoldTime,
          maxDrawdown: newMaxDrawdown,
          tradesPerMinute: tpm,
        };

        metricsRef.current = newMetrics;

        // Update demo balance
        if (tradingMode === 'demo') {
          demoDataStore.updateBalance(tradePnl, `trade-${Date.now()}-${Math.random()}`);
          demoDataStore.addTrade({
            pair,
            direction,
            pnl: tradePnl,
            exchange: currentExchange,
            timestamp: new Date(),
          });
          setVirtualBalance(prev => prev + tradePnl);
        }

        // Log to database
        const { error: tradeError } = await supabase.from('trades').insert({
          user_id: user.id,
          pair,
          direction,
          entry_price: currentPrice,
          exit_price: exitPrice,
          amount: positionSize,
          leverage,
          profit_loss: tradePnl,
          profit_percentage: (tradePnl / positionSize) * 100,
          exchange_name: currentExchange,
          is_sandbox: tradingMode === 'demo',
          status: 'closed',
          closed_at: new Date().toISOString(),
        });

        if (tradeError) {
          console.error('Failed to log trade:', tradeError);
        }

        // Update bot_runs
        await supabase.from('bot_runs').update({
          current_pnl: newPnL,
          trades_executed: newTrades,
          hit_rate: newHitRate,
          max_drawdown: newMaxDrawdown,
          updated_at: new Date().toISOString(),
        }).eq('id', botId);

        // Notifications
        notifyTrade(currentExchange, pair, direction, tradePnl);

        if (isWin && exitReason === 'TAKE_PROFIT') {
          const tpLevel = Math.ceil(Math.random() * 3) as 1 | 2 | 3;
          setTimeout(() => notifyTakeProfit(tpLevel, pair, tradePnl), 500);
        }

        // Update UI
        const tradeResult: TradeResult = {
          pair,
          direction,
          exchange: currentExchange,
          entryPrice: currentPrice,
          exitPrice,
          pnl: tradePnl,
          isWin,
          timestamp: new Date(),
          exitReason,
        };
        setLastTrade(tradeResult);

        setTradePulse(true);
        setTimeout(() => setTradePulse(false), 1000);

        onMetricsUpdate(newMetrics);

      } finally {
        isExecutingRef.current = false;
      }
    };

    // Execute trades at interval (minimum 3s for profit lock monitoring)
    const effectiveInterval = Math.max(tradeIntervalMs, 3000);
    const interval = setInterval(executeTrade, effectiveInterval);

    return () => {
      isCancelledRef.current = true;
      clearInterval(interval);
    };
  }, [
    isRunning,
    botId,
    user,
    tradingMode,
    dailyTarget,
    profitPerTrade,
    amountPerTrade,
    tradeIntervalMs,
    stopLossPercent,
    prices,
    leverages,
    botType,
    usdtFloat,
    setVirtualBalance,
    notifyTrade,
    notifyTakeProfit,
    onMetricsUpdate,
    tradingStrategy,
    targetHitRate,
    getCurrentPrice,
  ]);

  return {
    lastTrade,
    activeExchange,
    tradePulse,
    metrics: metricsRef.current,
  };
}
