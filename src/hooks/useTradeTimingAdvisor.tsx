import { useState, useEffect, useCallback, useRef } from 'react';

interface TimingSignal {
  symbol: string;
  signal: 'optimal' | 'good' | 'wait' | 'avoid';
  confidence: number;
  reason: string;
  direction: 'long' | 'short';
  countdown?: number; // seconds until next check
  momentum: number;
  orderBookImbalance: number; // positive = more bids, negative = more asks
}

interface TradeTimingAdvisorResult {
  signals: TimingSignal[];
  loading: boolean;
  lastUpdate: Date;
  bestSignal: TimingSignal | null;
  refresh: () => void;
}

const WATCH_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export function useTradeTimingAdvisor(): TradeTimingAdvisorResult {
  const [signals, setSignals] = useState<TimingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const priceHistoryRef = useRef<Map<string, number[]>>(new Map());

  const analyzeOrderBook = useCallback(async (symbol: string): Promise<number> => {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=5`
      );
      if (!response.ok) return 0;
      
      const data = await response.json();
      const bidVolume = data.bids.reduce((sum: number, [, qty]: string[]) => sum + parseFloat(qty), 0);
      const askVolume = data.asks.reduce((sum: number, [, qty]: string[]) => sum + parseFloat(qty), 0);
      
      // Return imbalance: positive = more buying pressure
      return (bidVolume - askVolume) / (bidVolume + askVolume);
    } catch {
      return 0;
    }
  }, []);

  const analyzeMomentum = useCallback((priceHistory: number[]): { momentum: number; direction: 'long' | 'short' } => {
    if (priceHistory.length < 3) return { momentum: 0, direction: 'long' };
    
    // Simple momentum calculation using recent price changes
    const recentPrices = priceHistory.slice(-10);
    const startPrice = recentPrices[0];
    const endPrice = recentPrices[recentPrices.length - 1];
    const momentum = ((endPrice - startPrice) / startPrice) * 100;
    
    return {
      momentum,
      direction: momentum >= 0 ? 'long' : 'short',
    };
  }, []);

  const determineSignal = useCallback((
    momentum: number, 
    orderBookImbalance: number
  ): { signal: TimingSignal['signal']; confidence: number; reason: string } => {
    const absMomentum = Math.abs(momentum);
    const absImbalance = Math.abs(orderBookImbalance);
    
    // Strong momentum + order book confirmation = optimal
    if (absMomentum > 0.1 && Math.sign(momentum) === Math.sign(orderBookImbalance) && absImbalance > 0.2) {
      return {
        signal: 'optimal',
        confidence: Math.min(95, 70 + absMomentum * 100 + absImbalance * 50),
        reason: 'Strong momentum with order book confirmation',
      };
    }
    
    // Good momentum or good order book
    if (absMomentum > 0.05 || absImbalance > 0.15) {
      return {
        signal: 'good',
        confidence: Math.min(80, 50 + absMomentum * 100 + absImbalance * 50),
        reason: absMomentum > absImbalance * 100 ? 'Momentum building' : 'Order book pressure',
      };
    }
    
    // Conflicting signals
    if (Math.sign(momentum) !== Math.sign(orderBookImbalance) && absImbalance > 0.1) {
      return {
        signal: 'avoid',
        confidence: 40,
        reason: 'Conflicting momentum and order flow',
      };
    }
    
    // Low activity
    return {
      signal: 'wait',
      confidence: Math.max(30, 60 - absMomentum * 100),
      reason: 'Waiting for clearer signal',
    };
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      // Fetch prices
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify(WATCH_PAIRS)}`
      );
      
      if (!response.ok) return;
      
      const prices = await response.json();
      
      // Analyze each pair
      const newSignals: TimingSignal[] = await Promise.all(
        prices.map(async (ticker: any) => {
          const symbol = ticker.symbol;
          const currentPrice = parseFloat(ticker.price);
          
          // Update price history
          const history = priceHistoryRef.current.get(symbol) || [];
          history.push(currentPrice);
          if (history.length > 30) history.shift();
          priceHistoryRef.current.set(symbol, history);
          
          // Analyze
          const { momentum, direction } = analyzeMomentum(history);
          const orderBookImbalance = await analyzeOrderBook(symbol);
          const { signal, confidence, reason } = determineSignal(momentum, orderBookImbalance);
          
          return {
            symbol: symbol.replace('USDT', ''),
            signal,
            confidence: Math.round(confidence),
            reason,
            direction,
            momentum,
            orderBookImbalance,
            countdown: signal === 'wait' ? 30 : undefined,
          };
        })
      );
      
      // Sort by confidence (highest first)
      newSignals.sort((a, b) => {
        const signalRank = { optimal: 4, good: 3, wait: 2, avoid: 1 };
        if (signalRank[a.signal] !== signalRank[b.signal]) {
          return signalRank[b.signal] - signalRank[a.signal];
        }
        return b.confidence - a.confidence;
      });
      
      setSignals(newSignals);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Trade timing advisor error:', error);
    } finally {
      setLoading(false);
    }
  }, [analyzeMomentum, analyzeOrderBook, determineSignal]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchSignals();
  }, [fetchSignals]);

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 3000); // Update every 3 seconds
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const bestSignal = signals.find(s => s.signal === 'optimal' || s.signal === 'good') || null;

  return {
    signals,
    loading,
    lastUpdate,
    bestSignal,
    refresh,
  };
}
