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
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!isConnected || tickersMap.size === 0) {
      return;
    }
    
    // Clear any pending update to avoid stacking
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
    }
    
    // Throttle updates to every 100ms for performance
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    
    const doUpdate = () => {
      lastUpdateRef.current = Date.now();
      
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
    };
    
    if (timeSinceLastUpdate >= 100) {
      // Immediate update if enough time has passed
      doUpdate();
    } else {
      // Schedule update to respect throttle
      pendingUpdateRef.current = setTimeout(doUpdate, 100 - timeSinceLastUpdate);
    }
    
    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [tickersMap, isConnected, updateMarketData, updatePositionPrices]);
  
  return {
    isConnected,
    pairsCount: tickersMap.size,
    wsState,
  };
}
