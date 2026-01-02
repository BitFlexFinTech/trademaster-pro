import { useState, useEffect, useRef, useCallback } from 'react';
import { useBinanceWebSocket } from './useBinanceWebSocket';

interface TradePnLData {
  currentPrice: number;
  pnl: number;
  progressPercent: number;
  latencyMs: number;
  lastUpdate: number;
}

interface UseRealtimeTradePnLProps {
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  positionSize: number;
  targetProfit: number;
  enabled?: boolean;
  updateIntervalMs?: number;
}

export function useRealtimeTradePnL({
  pair,
  direction,
  entryPrice,
  positionSize,
  targetProfit,
  enabled = true,
  updateIntervalMs = 500,
}: UseRealtimeTradePnLProps): TradePnLData {
  const { getPrice, wsState, isConnected } = useBinanceWebSocket();
  const [data, setData] = useState<TradePnLData>({
    currentPrice: entryPrice,
    pnl: 0,
    progressPercent: 0,
    latencyMs: 0,
    lastUpdate: Date.now(),
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPriceRef = useRef<number>(entryPrice);

  const calculatePnL = useCallback(() => {
    const symbol = pair.replace('/', '');
    const currentPrice = getPrice(symbol);
    
    if (!currentPrice || currentPrice === 0) {
      return; // Keep previous values if no price available
    }

    const priceDiff = direction === 'long'
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;
    
    const percentChange = (priceDiff / entryPrice) * 100;
    const grossPnl = positionSize * (percentChange / 100);
    
    // Subtract estimated fees (0.2% round-trip: 0.1% entry + 0.1% exit)
    const fees = positionSize * 0.002;
    const netPnl = grossPnl - fees;
    
    const progressPercent = Math.min(100, Math.max(0, (netPnl / targetProfit) * 100));

    setData({
      currentPrice,
      pnl: netPnl,
      progressPercent,
      latencyMs: wsState.latencyMs || 0,
      lastUpdate: Date.now(),
    });

    lastPriceRef.current = currentPrice;
  }, [pair, direction, entryPrice, positionSize, targetProfit, getPrice, wsState.latencyMs]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial calculation
    calculatePnL();

    // Set up interval for updates
    intervalRef.current = setInterval(calculatePnL, updateIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, updateIntervalMs, calculatePnL]);

  return data;
}
