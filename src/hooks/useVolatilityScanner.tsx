import { useState, useEffect, useCallback, useRef } from 'react';

interface PairVolatility {
  symbol: string;
  currentPrice: number;
  priceChange1m: number;
  volatilityPercent: number;
  momentum: 'up' | 'down' | 'neutral';
  momentumStrength: number;
  estimatedTimeToProfit: number; // seconds to hit $1 profit
  recommendedSize: number; // $200-$500
  profitPotentialScore: number; // 0-100
}

interface VolatilityScannerResult {
  pairs: PairVolatility[];
  loading: boolean;
  lastUpdate: Date;
  topPair: PairVolatility | null;
  refresh: () => void;
}

const SCAN_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT',
  'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT'
];

const TARGET_PROFIT = 1; // $1 profit target
const MIN_POSITION = 200;
const MAX_POSITION = 500;

export function useVolatilityScanner(): VolatilityScannerResult {
  const [pairs, setPairs] = useState<PairVolatility[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const priceHistoryRef = useRef<Map<string, number[]>>(new Map());
  
  const calculateVolatility = useCallback((priceHistory: number[]): number => {
    if (priceHistory.length < 2) return 0;
    const mean = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
    const variance = priceHistory.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / priceHistory.length;
    return Math.sqrt(variance) / mean * 100; // Return as percentage
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(SCAN_PAIRS)}`
      );
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      const newPairs: PairVolatility[] = data.map((ticker: any) => {
        const symbol = ticker.symbol;
        const currentPrice = parseFloat(ticker.lastPrice);
        const priceChange24h = parseFloat(ticker.priceChangePercent);
        const highPrice = parseFloat(ticker.highPrice);
        const lowPrice = parseFloat(ticker.lowPrice);
        
        // Update price history
        const history = priceHistoryRef.current.get(symbol) || [];
        history.push(currentPrice);
        if (history.length > 60) history.shift(); // Keep last 60 samples
        priceHistoryRef.current.set(symbol, history);
        
        // Calculate 1-minute price change from history
        const priceChange1m = history.length >= 2 
          ? ((currentPrice - history[0]) / history[0]) * 100
          : priceChange24h / 24 / 60;
        
        // Calculate volatility from high-low spread
        const volatilityPercent = ((highPrice - lowPrice) / currentPrice) * 100;
        
        // Determine momentum
        let momentum: 'up' | 'down' | 'neutral' = 'neutral';
        let momentumStrength = Math.abs(priceChange1m);
        if (priceChange1m > 0.05) momentum = 'up';
        else if (priceChange1m < -0.05) momentum = 'down';
        
        // Calculate recommended position size based on volatility
        // Higher volatility = smaller position needed for $1 profit
        const expectedMovePercent = Math.max(0.1, volatilityPercent / 24); // hourly volatility estimate
        let recommendedSize = TARGET_PROFIT / (expectedMovePercent / 100);
        recommendedSize = Math.max(MIN_POSITION, Math.min(MAX_POSITION, recommendedSize));
        
        // Estimate time to hit $1 profit
        const avgMovePerSecond = volatilityPercent / 86400; // Daily volatility spread across seconds
        const profitMoveNeeded = (TARGET_PROFIT / recommendedSize) * 100;
        const estimatedTimeToProfit = Math.round(profitMoveNeeded / avgMovePerSecond);
        
        // Calculate profit potential score (0-100)
        const volumeScore = Math.min(50, parseFloat(ticker.volume) / 1000000);
        const volatilityScore = Math.min(30, volatilityPercent * 5);
        const momentumScore = Math.min(20, momentumStrength * 10);
        const profitPotentialScore = Math.round(volumeScore + volatilityScore + momentumScore);
        
        return {
          symbol: symbol.replace('USDT', ''),
          currentPrice,
          priceChange1m,
          volatilityPercent,
          momentum,
          momentumStrength,
          estimatedTimeToProfit: Math.max(30, Math.min(600, estimatedTimeToProfit)), // 30s to 10min
          recommendedSize: Math.round(recommendedSize),
          profitPotentialScore,
        };
      });
      
      // Sort by profit potential score (highest first)
      newPairs.sort((a, b) => b.profitPotentialScore - a.profitPotentialScore);
      
      setPairs(newPairs);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Volatility scanner error:', error);
    } finally {
      setLoading(false);
    }
  }, [calculateVolatility]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchPrices();
  }, [fetchPrices]);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return {
    pairs,
    loading,
    lastUpdate,
    topPair: pairs[0] || null,
    refresh,
  };
}
