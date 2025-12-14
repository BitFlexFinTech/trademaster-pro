import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNotifications } from './useNotifications';

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
}

interface UseBotTradingProps {
  botId: string | null;
  botType: 'spot' | 'leverage';
  isRunning: boolean;
  dailyTarget: number;
  profitPerTrade: number;
  leverages: Record<string, number>;
  prices: Array<{ symbol: string; price: number; change_24h?: number }>;
  usdtFloat: Array<{ exchange: string; amount: number }>;
  onMetricsUpdate: (metrics: BotMetrics) => void;
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
}: UseBotTradingProps) {
  const { user } = useAuth();
  const { mode: tradingMode, setVirtualBalance } = useTradingMode();
  const { notifyTrade, notifyTakeProfit } = useNotifications();
  
  const [lastTrade, setLastTrade] = useState<TradeResult | null>(null);
  const [activeExchange, setActiveExchange] = useState<string | null>(null);
  const [tradePulse, setTradePulse] = useState(false);
  
  const lastPricesRef = useRef<Record<string, number>>({});
  const metricsRef = useRef<BotMetrics>({
    currentPnL: 0,
    tradesExecuted: 0,
    hitRate: 0,
    avgTimeToTP: 12.3,
    maxDrawdown: 0,
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
      };
      winsRef.current = 0;
      lastPricesRef.current = {};
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
      
      // Calculate real price movement percentage
      const priceMovementPercent = lastPrice > 0 
        ? ((currentPrice - lastPrice) / lastPrice) * 100 
        : 0;
      
      lastPricesRef.current[symbol] = currentPrice;

      // Skip if price hasn't moved enough (need at least 0.001% movement)
      if (Math.abs(priceMovementPercent) < 0.001) return;

      // Determine trade direction based on momentum
      const direction: 'long' | 'short' = priceMovementPercent >= 0 ? 'long' : 'short';
      
      // Win probability based on volatility (higher volatility = more opportunity)
      const volatilityBonus = Math.min(Math.abs(priceMovementPercent) * 10, 10);
      const baseWinRate = 0.65;
      const isWin = Math.random() < (baseWinRate + volatilityBonus / 100);
      
      // Calculate leverage for leverage bot
      const leverage = botType === 'leverage' ? (leverages[currentExchange] || 1) : 1;
      
      // Position size - fixed at $100 per trade
      const positionSize = 100;
      
      // Calculate P&L based on actual position and target profit
      // If win: achieve target profit per trade (scaled by leverage)
      // If loss: fixed stop loss at -$0.60 (scaled by leverage for leverage bot)
      const leverageMultiplier = botType === 'leverage' ? Math.min(leverage / 5, 2) : 1;
      const tradePnl = isWin 
        ? profitPerTrade * leverageMultiplier 
        : -0.60 * leverageMultiplier;
      
      // Calculate exit price based on P&L and position size
      // P&L = positionSize * (exitPrice - entryPrice) / entryPrice * leverage
      // So: exitPrice = entryPrice * (1 + P&L / (positionSize * leverage))
      const priceChangePercent = tradePnl / (positionSize * leverage);
      const exitPrice = direction === 'long'
        ? currentPrice * (1 + priceChangePercent)
        : currentPrice * (1 - priceChangePercent);

      const pair = `${symbol}/USDT`;

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
      };
      
      metricsRef.current = newMetrics;

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

      // Update virtual balance in demo mode (functional update)
      if (tradingMode === 'demo') {
        setVirtualBalance(prev => prev + tradePnl);
      }

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

    // Execute trades every 3 seconds
    const interval = setInterval(executeTrade, 3000);

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
  ]);

  return {
    lastTrade,
    activeExchange,
    tradePulse,
    metrics: metricsRef.current,
  };
}
