import { useEffect, useState, useRef, useCallback } from 'react';

export interface BinanceTickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  lastUpdated: number;
}

// Top trading pairs to stream
const STREAM_SYMBOLS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'avaxusdt', 'dotusdt', 'maticusdt',
  'linkusdt', 'uniusdt', 'ltcusdt', 'atomusdt', 'nearusdt',
  'aptusdt', 'arbusdt', 'opusdt', 'shibusdt', 'xlmusdt'
];

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

export function useBinanceWebSocket() {
  const [tickers, setTickers] = useState<Map<string, BinanceTickerData>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (import.meta.env.DEV) console.log('[BinanceWS] Already connected');
      return;
    }

    try {
      // Create combined stream URL for all symbols
      const streams = STREAM_SYMBOLS.map(s => `${s}@ticker`).join('/');
      const wsUrl = `${BINANCE_WS_URL}/${streams}`;
      
      if (import.meta.env.DEV) console.log('[BinanceWS] Connecting to:', wsUrl.slice(0, 100) + '...');
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (import.meta.env.DEV) console.log('[BinanceWS] Connected successfully');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle individual ticker updates from combined stream
          if (data.e === '24hrTicker') {
            const ticker: BinanceTickerData = {
              symbol: data.s, // e.g., "BTCUSDT"
              price: parseFloat(data.c), // Last price
              priceChange: parseFloat(data.p), // Price change
              priceChangePercent: parseFloat(data.P), // Price change percent
              volume: parseFloat(data.v) * parseFloat(data.c), // Volume in USDT
              lastUpdated: Date.now(),
            };

            setTickers(prev => {
              const updated = new Map(prev);
              updated.set(ticker.symbol, ticker);
              return updated;
            });
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error('[BinanceWS] Error parsing message:', err);
        }
      };

      ws.onerror = (event) => {
        if (import.meta.env.DEV) console.error('[BinanceWS] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (import.meta.env.DEV) console.log('[BinanceWS] Connection closed:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          if (import.meta.env.DEV) console.log(`[BinanceWS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else {
          setError('Max reconnection attempts reached');
        }
      };
    } catch (err) {
      if (import.meta.env.DEV) console.error('[BinanceWS] Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  // Get price for a specific symbol
  const getPrice = useCallback((symbol: string): number => {
    const normalized = symbol.toUpperCase().replace('/', '');
    return tickers.get(normalized)?.price || 0;
  }, [tickers]);

  // Get ticker data for a specific symbol
  const getTicker = useCallback((symbol: string): BinanceTickerData | undefined => {
    const normalized = symbol.toUpperCase().replace('/', '');
    return tickers.get(normalized);
  }, [tickers]);

  // Convert tickers map to array for compatibility
  const tickersArray = Array.from(tickers.values());

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Ping to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Binance WebSocket auto-handles pings, but we log connection status
        if (import.meta.env.DEV) console.log('[BinanceWS] Connection alive, tickers:', tickers.size);
      }
    }, 30000);

    return () => clearInterval(pingInterval);
  }, [isConnected, tickers.size]);

  return {
    tickers: tickersArray,
    tickersMap: tickers,
    isConnected,
    error,
    getPrice,
    getTicker,
    connect,
    disconnect,
  };
}
