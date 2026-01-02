import { useEffect, useState, useRef, useCallback } from 'react';

export interface BinanceTickerData {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  lastUpdated: number;
  // NEW: Enhanced trading data
  highPrice: number;
  lowPrice: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
}

// Serializable ticker for passing to edge functions
export interface SerializableTicker {
  price: number;
  priceChangePercent: number;
  volume: number;
  lastUpdated: number;
  bidPrice: number;
  askPrice: number;
  spread: number;
}

// Connection status state machine
export type WebSocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface WebSocketState {
  status: WebSocketStatus;
  reconnectAttempt: number;
  lastHeartbeat: number;
  latencyMs: number;
}

// Top trading pairs to stream - expanded for better coverage
const STREAM_SYMBOLS = [
  'btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt',
  'dogeusdt', 'adausdt', 'avaxusdt', 'dotusdt', 'maticusdt',
  'linkusdt', 'uniusdt', 'ltcusdt', 'atomusdt', 'nearusdt',
  'aptusdt', 'arbusdt', 'opusdt', 'shibusdt', 'xlmusdt'
];

const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

// 3-tier exponential backoff: 1s → 5s → 30s max
const RECONNECT_DELAYS = [1000, 5000, 30000];
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 second heartbeat
const PRICE_FRESHNESS_MS = 5000; // Prices older than 5s considered stale

export function useBinanceWebSocket() {
  const [tickers, setTickers] = useState<Map<string, BinanceTickerData>>(new Map());
  const [wsState, setWsState] = useState<WebSocketState>({
    status: 'disconnected',
    reconnectAttempt: 0,
    lastHeartbeat: 0,
    latencyMs: 0,
  });
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPongRef = useRef<number>(Date.now());

  // Get reconnection delay using 3-tier exponential backoff
  const getReconnectDelay = useCallback((attempt: number): number => {
    const tier = Math.min(attempt, RECONNECT_DELAYS.length - 1);
    const baseDelay = RECONNECT_DELAYS[tier];
    // Add jitter (±20%) to prevent thundering herd
    const jitter = baseDelay * 0.2 * (Math.random() - 0.5) * 2;
    return Math.round(baseDelay + jitter);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setWsState(prev => ({ ...prev, status: 'connecting' }));

    try {
      const streams = STREAM_SYMBOLS.map(s => `${s}@ticker`).join('/');
      const wsUrl = `${BINANCE_WS_URL}/${streams}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (import.meta.env.DEV) console.log('[BinanceWS] ⚡ Connected - real-time prices active');
        setWsState({
          status: 'connected',
          reconnectAttempt: 0,
          lastHeartbeat: Date.now(),
          latencyMs: 0,
        });
        setError(null);
        lastPongRef.current = Date.now();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Update last pong time on any message (acts as implicit pong)
          lastPongRef.current = Date.now();
          
          if (data.e === '24hrTicker') {
            const ticker: BinanceTickerData = {
              symbol: data.s,
              price: parseFloat(data.c),
              priceChange: parseFloat(data.p),
              priceChangePercent: parseFloat(data.P),
              volume: parseFloat(data.v) * parseFloat(data.c),
              lastUpdated: Date.now(),
              // Enhanced trading data
              highPrice: parseFloat(data.h),
              lowPrice: parseFloat(data.l),
              bidPrice: parseFloat(data.b),
              askPrice: parseFloat(data.a),
              spread: parseFloat(data.c) > 0 
                ? ((parseFloat(data.a) - parseFloat(data.b)) / parseFloat(data.c)) * 100 
                : 0,
            };

            setTickers(prev => {
              const updated = new Map(prev);
              updated.set(ticker.symbol, ticker);
              return updated;
            });
          }
        } catch (err) {
          // Silent parse errors
        }
      };

      ws.onerror = () => {
        setWsState(prev => ({ ...prev, status: 'error' }));
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        if (import.meta.env.DEV) console.log('[BinanceWS] Closed:', event.code);
        wsRef.current = null;

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        setWsState(prev => {
          const nextAttempt = prev.reconnectAttempt + 1;
          
          if (nextAttempt <= MAX_RECONNECT_ATTEMPTS) {
            const delay = getReconnectDelay(nextAttempt);
            if (import.meta.env.DEV) {
              console.log(`[BinanceWS] Reconnecting in ${delay}ms (attempt ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})`);
            }
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
            
            return { ...prev, status: 'reconnecting', reconnectAttempt: nextAttempt };
          } else {
            setError('Max reconnection attempts reached');
            return { ...prev, status: 'error', reconnectAttempt: nextAttempt };
          }
        });
      };
    } catch (err) {
      setError('Failed to create WebSocket');
      setWsState(prev => ({ ...prev, status: 'error' }));
    }
  }, [getReconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setWsState(prev => ({ ...prev, status: 'disconnected' }));
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

  // NEW: Get trading-ready data for a symbol with freshness check
  const getTradingData = useCallback((symbol: string): {
    price: number;
    momentum: number;
    volume: number;
    spread: number;
    isFresh: boolean;
    lastUpdated: number;
  } | null => {
    const normalized = symbol.toUpperCase().replace('/', '');
    const ticker = tickers.get(normalized);
    if (!ticker) return null;
    
    return {
      price: ticker.price,
      momentum: ticker.priceChangePercent,
      volume: ticker.volume,
      spread: ticker.spread,
      isFresh: Date.now() - ticker.lastUpdated < PRICE_FRESHNESS_MS,
      lastUpdated: ticker.lastUpdated,
    };
  }, [tickers]);

  // NEW: Get all prices as serializable object for edge function
  const getSerializablePrices = useCallback((): Record<string, SerializableTicker> => {
    const result: Record<string, SerializableTicker> = {};
    tickers.forEach((ticker, symbol) => {
      result[symbol] = {
        price: ticker.price,
        priceChangePercent: ticker.priceChangePercent,
        volume: ticker.volume,
        lastUpdated: ticker.lastUpdated,
        bidPrice: ticker.bidPrice,
        askPrice: ticker.askPrice,
        spread: ticker.spread,
      };
    });
    return result;
  }, [tickers]);

  // Convert tickers map to array for compatibility
  const tickersArray = Array.from(tickers.values());

  // Connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // 30-second heartbeat check
  useEffect(() => {
    if (wsState.status !== 'connected') return;

    heartbeatIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastPong = now - lastPongRef.current;
      
      // Update heartbeat timestamp and latency
      setWsState(prev => ({
        ...prev,
        lastHeartbeat: now,
        latencyMs: Math.min(timeSinceLastPong, 1000),
      }));
      
      // If no message received in 60s, connection is likely dead
      if (timeSinceLastPong > 60000 && wsRef.current) {
        if (import.meta.env.DEV) console.log('[BinanceWS] Heartbeat timeout, reconnecting...');
        wsRef.current.close();
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [wsState.status]);

  return {
    tickers: tickersArray,
    tickersMap: tickers,
    isConnected: wsState.status === 'connected',
    status: wsState.status,
    wsState,
    error,
    getPrice,
    getTicker,
    getTradingData,
    getSerializablePrices,
    connect,
    disconnect,
  };
}
