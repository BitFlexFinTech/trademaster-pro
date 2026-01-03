// ============================================
// WebSocket Bridge Hook
// Bridges real-time WebSocket prices to Zustand store
// Enables real-time position P&L and trading engine
// ============================================

import { useEffect, useRef } from 'react';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useBotStore } from '@/stores/botStore';

/**
 * Bridge WebSocket price data to the Zustand store
 * This enables:
 * - Real-time position P&L updates
 * - Trading engine market data access
 * - Capital metrics calculation
 */
export function useWebSocketBridge() {
  const { tickersMap, isConnected, wsState } = useBinanceWebSocket();
  const updateMarketData = useBotStore(state => state.updateMarketData);
  const updatePositionPrices = useBotStore(state => state.updatePositionPrices);
  const lastUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    // Throttle updates to every 100ms for performance
    const now = Date.now();
    if (now - lastUpdateRef.current < 100) return;
    lastUpdateRef.current = now;
    
    if (!isConnected || tickersMap.size === 0) {
      return;
    }
    
    // Convert ticker map to prices object
    const prices: Record<string, number> = {};
    const changes24h: Record<string, number> = {};
    const volumes: Record<string, number> = {};
    
    tickersMap.forEach((ticker, symbol) => {
      prices[symbol] = ticker.price;
      changes24h[symbol] = ticker.priceChangePercent;
      volumes[symbol] = ticker.volume * ticker.price; // Convert to USD volume
    });
    
    // Update market data in store
    updateMarketData({ 
      prices, 
      changes24h, 
      volumes, 
      pairsScanned: tickersMap.size,
      isScanning: true,
    });
    
    // Update position prices for real-time P&L
    updatePositionPrices(prices);
    
  }, [tickersMap, isConnected, updateMarketData, updatePositionPrices]);
  
  return {
    isConnected,
    pairsCount: tickersMap.size,
    wsState,
  };
}
