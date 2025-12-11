import { useState, useEffect, useCallback } from 'react';
import type { OHLCData } from '@/lib/indicators';

const BINANCE_SPOT_API = 'https://api.binance.com/api/v3';
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
};

export function useChartData(symbol: string, timeframe: string, contractType: 'spot' | 'perpetual' = 'spot') {
  const [data, setData] = useState<OHLCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Extract the base symbol (remove /USDT and PERP suffix)
  const getBaseSymbol = useCallback((displaySymbol: string) => {
    return displaySymbol.replace('/', '').replace(' PERP', '');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const binanceSymbol = getBaseSymbol(symbol);
      const interval = TIMEFRAME_MAP[timeframe] || '4h';
      
      // Use futures API for perpetual contracts, spot API for spot
      const apiBase = contractType === 'perpetual' ? BINANCE_FUTURES_API : BINANCE_SPOT_API;
      
      const response = await fetch(
        `${apiBase}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=200`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }
      
      const klines = await response.json();
      
      const ohlcData: OHLCData[] = klines.map((kline: any[]) => ({
        time: Math.floor(kline[0] / 1000), // Convert to seconds
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      }));
      
      setData(ohlcData);
      
      // Set current price from latest candle
      if (ohlcData.length > 0) {
        setCurrentPrice(ohlcData[ohlcData.length - 1].close);
      }
    } catch (err) {
      console.error('Chart data fetch error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, contractType, getBaseSymbol]);

  useEffect(() => {
    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // WebSocket for real-time updates
  useEffect(() => {
    const binanceSymbol = getBaseSymbol(symbol).toLowerCase();
    const wsInterval = TIMEFRAME_MAP[timeframe] || '4h';
    
    // Use different WebSocket endpoints for spot vs futures
    const wsUrl = contractType === 'perpetual'
      ? `wss://fstream.binance.com/ws/${binanceSymbol}@kline_${wsInterval}`
      : `wss://stream.binance.com:9443/ws/${binanceSymbol}@kline_${wsInterval}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.k) {
        const kline = message.k;
        const newCandle: OHLCData = {
          time: Math.floor(kline.t / 1000),
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
        };
        
        setCurrentPrice(newCandle.close);
        
        setData(prev => {
          if (prev.length === 0) return prev;
          
          const lastCandle = prev[prev.length - 1];
          if (lastCandle.time === newCandle.time) {
            // Update existing candle
            return [...prev.slice(0, -1), newCandle];
          } else if (newCandle.time > lastCandle.time) {
            // Add new candle
            return [...prev.slice(1), newCandle];
          }
          return prev;
        });
      }
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
    
    return () => {
      ws.close();
    };
  }, [symbol, timeframe, contractType, getBaseSymbol]);

  return { data, loading, error, currentPrice, refetch: fetchData };
}
