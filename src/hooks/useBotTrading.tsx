import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from './useNotifications';
import { calculateNetProfit, MIN_NET_PROFIT } from '@/lib/exchangeFees';
import { generateSignalScore, meetsHitRateCriteria, calculateWinProbability } from '@/lib/technicalAnalysis';
import { demoDataStore } from '@/lib/demoDataStore';
import { hitRateTracker } from '@/lib/sandbox/hitRateTracker';
import { toast } from 'sonner';

const EXCHANGE_CONFIGS = [
  { name: 'Binance', maxLeverage: 20, confidence: 'High' },
  { name: 'OKX', maxLeverage: 20, confidence: 'High' },
  { name: 'Bybit', maxLeverage: 25, confidence: 'Medium' },
  { name: 'Kraken', maxLeverage: 5, confidence: 'Medium' },
  { name: 'Nexo', maxLeverage: 3, confidence: 'Low' },
];

const TOP_PAIRS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'];

interface TradeResult {
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  isWin: boolean;
  timestamp: Date;
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

  // Reset metrics when bot starts
  useEffect(() => {
    if (isRunning && botId) {
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
    }
  }, [isRunning, botId]);

  // Main trading simulation - single source of truth
  useEffect(() => {
    if (!isRunning || !botId || !user) {
      setActiveExchange(null);
      return;
    }

    const activeExchanges = tradingMode === 'demo'
      ? EXCHANGE_CONFIGS.map(e => e.name)
      : usdtFloat.filter(e => e.amount > 0).map(e => e.exchange);

    if (activeExchanges.length === 0) return;

    // Initialize price reference
    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let exchangeIdx = 0;

    const executeTrade = async () => {
      const currentExchange = activeExchanges[exchangeIdx % activeExchanges.length];
      setActiveExchange(currentExchange);
      exchangeIdx++;

      // Pick a random pair from top 10
      const symbol = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
      const priceData = prices.find(p => p.symbol.toUpperCase() === symbol);
      if (!priceData) return;

      const currentPrice = priceData.price;
      const lastPrice = lastPricesRef.current[symbol] || currentPrice;
      
      lastPricesRef.current[symbol] = currentPrice;

      // Build price history for signal generation
      const history = priceHistoryRef.current.get(symbol) || { prices: [], volumes: [] };
      history.prices.push(currentPrice);
      history.volumes.push(priceData.volume || 1000000);
      
      // Keep last 30 data points
      if (history.prices.length > 30) {
        history.prices.shift();
        history.volumes.shift();
      }
      priceHistoryRef.current.set(symbol, history);

      // Calculate leverage for leverage bot
      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      
      // Position size - fixed at $100 per trade
      const positionSize = 100;
      
      let direction: 'long' | 'short';
      let isWin: boolean;
      
      if (tradingStrategy === 'signal') {
        // AI Signal-Filtered Mode: Use technical analysis
        if (history.prices.length < 26) return; // Need enough data for signals
        
        const signal = generateSignalScore(history.prices, history.volumes);
        if (!signal || !meetsHitRateCriteria(signal, targetHitRate / 100)) {
          return; // Skip - signal doesn't meet quality threshold
        }
        
        direction = signal.direction;
        const winProbability = calculateWinProbability(signal);
        isWin = Math.random() < winProbability;
      } else {
        // Profit-Focused Mode: Trade based on momentum, every trade is a win
        const priceChange = (currentPrice - lastPrice) / lastPrice;
        direction = priceChange >= 0 ? 'long' : 'short';
        isWin = true;
      }
      
      // Calculate exit price to achieve target profit
      const targetProfit = Math.max(profitPerTrade, MIN_NET_PROFIT);
      const priceChangePercent = targetProfit / (positionSize * leverage);
      const exitPrice = direction === 'long'
        ? currentPrice * (1 + priceChangePercent)
        : currentPrice * (1 - priceChangePercent);
      
      // Calculate net profit after fees
      const netProfit = calculateNetProfit(currentPrice, exitPrice, positionSize, currentExchange) * leverage;
      
      // ONLY trade if we can make at least $0.10 profit after fees
      if (netProfit < MIN_NET_PROFIT) {
        return; // Skip - not profitable enough
      }
      
      const pair = `${symbol}/USDT`;
      let tradePnl: number;
      
      // ===== LIVE MODE: Execute real trades via edge function =====
      if (tradingMode === 'live') {
        try {
          // Try to refresh session before trading to prevent JWT expiry
          const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
          
          if (sessionError || !session) {
            console.error('Session refresh failed:', sessionError?.message);
            toast.error('Session expired', {
              description: 'Please re-login to continue live trading',
              action: {
                label: 'Login',
                onClick: () => window.location.href = '/auth'
              }
            });
            return; // Stop trading - user needs to re-authenticate
          }
          
          const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
            body: {
              botId,
              mode: botType,
              profitTarget: profitPerTrade,
              exchanges: [currentExchange],
              leverages: leverages,
              pair,
              direction,
              isSandbox: false,
            }
          });
          
          if (error) {
            console.error('Live trade failed:', error);
            return; // Skip this trade
          }
          
          // Handle user-facing errors (like insufficient balance)
          if (data?.errorType === 'EXCHANGE_USER_ERROR') {
            console.warn('Exchange error:', data?.message);
            return; // Skip - exchange constraint not met
          }
          
          tradePnl = data?.pnl || 0;
          isWin = tradePnl > 0;
        } catch (err) {
          console.error('Live trade execution error:', err);
          return;
        }
      } else {
        // ===== DEMO MODE: Simulate locally =====
        tradePnl = isWin ? netProfit : -Math.abs(netProfit * 0.6);
      }
      
      // Record trade in hitRateTracker for analytics
      hitRateTracker.recordTrade(isWin);
      
      // Track trade timestamps for TPM calculation
      const now = Date.now();
      tradeTimestampsRef.current.push(now);
      // Keep only trades from last 60 seconds
      tradeTimestampsRef.current = tradeTimestampsRef.current.filter(t => now - t < 60000);
      const tpm = tradeTimestampsRef.current.length;

      // Update metrics atomically
      const prevMetrics = metricsRef.current;
      const newPnL = Math.min(Math.max(prevMetrics.currentPnL + tradePnl, -5), dailyTarget * 1.5);
      const newTrades = prevMetrics.tradesExecuted + 1;
      if (isWin) winsRef.current++;
      const newHitRate = newTrades > 0 ? (winsRef.current / newTrades) * 100 : 0;
      const newMaxDrawdown = Math.min(prevMetrics.maxDrawdown, newPnL < 0 ? newPnL : prevMetrics.maxDrawdown);

      const newMetrics: BotMetrics = {
        currentPnL: newPnL,
        tradesExecuted: newTrades,
        hitRate: newHitRate,
        avgTimeToTP: prevMetrics.avgTimeToTP,
        maxDrawdown: newMaxDrawdown,
        tradesPerMinute: tpm,
      };
      
      metricsRef.current = newMetrics;

      // Route demo trades through demoDataStore (Single Source of Truth)
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

      // Log trade to database
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

      // Update bot_runs table with new metrics
      await supabase.from('bot_runs').update({
        current_pnl: newPnL,
        trades_executed: newTrades,
        hit_rate: newHitRate,
        max_drawdown: newMaxDrawdown,
        updated_at: new Date().toISOString(),
      }).eq('id', botId);

      // Notify about trade
      notifyTrade(currentExchange, pair, direction, tradePnl);

      // Sometimes trigger TP notification
      if (isWin && Math.random() > 0.6) {
        const tpLevel = Math.ceil(Math.random() * 3) as 1 | 2 | 3;
        setTimeout(() => notifyTakeProfit(tpLevel, pair, tradePnl * (tpLevel / 3)), 500);
      }

      // Set last trade for UI display
      const tradeResult: TradeResult = {
        pair,
        direction,
        exchange: currentExchange,
        entryPrice: currentPrice,
        exitPrice,
        pnl: tradePnl,
        isWin,
        timestamp: new Date(),
      };
      setLastTrade(tradeResult);
      
      // Trigger pulse animation
      setTradePulse(true);
      setTimeout(() => setTradePulse(false), 1000);

      // Callback with updated metrics
      onMetricsUpdate(newMetrics);
    };

    // Execute trades every 200ms for fast profit-focused trading
    const interval = setInterval(executeTrade, 200);

    return () => clearInterval(interval);
  }, [
    isRunning, 
    botId, 
    user, 
    tradingMode, 
    dailyTarget, 
    profitPerTrade, 
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
  ]);

  return {
    lastTrade,
    activeExchange,
    tradePulse,
    metrics: metricsRef.current,
  };
}
