import { useEffect, useRef, useCallback } from 'react';
import { useBinanceWebSocket } from './useBinanceWebSocket';

export interface OpenPosition {
  id: string;
  symbol: string;
  pair: string;
  entryPrice: number;
  amount: number;
  direction: 'long' | 'short';
  exchange: string;
  leverage?: number;
  openedAt?: number;
}

interface UseWebSocketPositionMonitorProps {
  openPositions: OpenPosition[];
  profitTarget?: number;
  onProfitTargetHit: (position: OpenPosition, currentPrice: number, profit: number) => void;
  enabled?: boolean;
  feeRate?: number;
}

// Calculate net profit including fees
function calculateNetProfit(
  position: OpenPosition,
  currentPrice: number,
  feeRate: number = 0.001
): number {
  const { entryPrice, amount, direction, leverage = 1 } = position;
  
  const priceDiff = direction === 'long'
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  
  const priceChangePercent = priceDiff / entryPrice;
  const grossProfit = amount * priceChangePercent * leverage;
  const totalFees = amount * feeRate * 2; // Entry + exit fees
  
  return grossProfit - totalFees;
}

export function useWebSocketPositionMonitor({
  openPositions,
  profitTarget = 1.00,
  onProfitTargetHit,
  enabled = true,
  feeRate = 0.001,
}: UseWebSocketPositionMonitorProps) {
  const { tickersMap, isConnected, getTradingData } = useBinanceWebSocket();
  
  // Track which positions we've already triggered closes for (prevent duplicates)
  const triggeredPositionsRef = useRef<Set<string>>(new Set());
  const lastCheckTimeRef = useRef<number>(0);
  const checksPerSecondRef = useRef<number>(0);
  const lastSecondRef = useRef<number>(0);

  // Reset triggered positions when positions list changes
  useEffect(() => {
    const currentIds = new Set(openPositions.map(p => p.id));
    // Remove any triggered positions that are no longer in the list
    triggeredPositionsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        triggeredPositionsRef.current.delete(id);
      }
    });
  }, [openPositions]);

  // Monitor positions on every WebSocket tick
  useEffect(() => {
    if (!enabled || !isConnected || openPositions.length === 0) {
      return;
    }

    // Track checks per second for metrics
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    if (currentSecond !== lastSecondRef.current) {
      console.log(`[WS Position Monitor] ${checksPerSecondRef.current} checks last second`);
      checksPerSecondRef.current = 0;
      lastSecondRef.current = currentSecond;
    }
    checksPerSecondRef.current++;
    lastCheckTimeRef.current = now;

    // Check each open position
    for (const position of openPositions) {
      // Skip if already triggered
      if (triggeredPositionsRef.current.has(position.id)) {
        continue;
      }

      const symbol = position.symbol || position.pair?.replace('/', '') || '';
      const tradingData = getTradingData(symbol);
      
      if (!tradingData || !tradingData.isFresh) {
        continue;
      }

      const currentPrice = tradingData.price;
      const netProfit = calculateNetProfit(position, currentPrice, feeRate);

      // Check if profit target hit
      if (netProfit >= profitTarget) {
        console.log(`%c🎯 INSTANT PROFIT TARGET HIT`, 'color: #00ff00; font-size: 14px; font-weight: bold');
        console.log(`   Position: ${position.id}`);
        console.log(`   Symbol: ${symbol}`);
        console.log(`   Entry: $${position.entryPrice.toFixed(4)} → Current: $${currentPrice.toFixed(4)}`);
        console.log(`   Net Profit: $${netProfit.toFixed(2)} (Target: $${profitTarget})`);
        console.log(`   Detection latency: ${Date.now() - tradingData.lastUpdated}ms from last WS update`);
        
        // Mark as triggered to prevent duplicate calls
        triggeredPositionsRef.current.add(position.id);
        
        // Fire callback
        onProfitTargetHit(position, currentPrice, netProfit);
      }
    }
  }, [tickersMap, openPositions, profitTarget, enabled, isConnected, feeRate, onProfitTargetHit, getTradingData]);

  // Get current profit for all positions (for UI display)
  const getPositionProfits = useCallback(() => {
    return openPositions.map(position => {
      const symbol = position.symbol || position.pair?.replace('/', '') || '';
      const tradingData = getTradingData(symbol);
      
      if (!tradingData) {
        return {
          ...position,
          currentPrice: 0,
          netProfit: 0,
          profitPercent: 0,
          isFresh: false,
          progressToTarget: 0,
          openedAt: position.openedAt,
        };
      }

      const netProfit = calculateNetProfit(position, tradingData.price, feeRate);
      const profitPercent = (netProfit / position.amount) * 100;
      const progressToTarget = Math.min(100, Math.max(0, (netProfit / profitTarget) * 100));
      
      return {
        ...position,
        currentPrice: tradingData.price,
        netProfit,
        profitPercent,
        isFresh: tradingData.isFresh,
        progressToTarget,
        openedAt: position.openedAt,
      };
    });
  }, [openPositions, getTradingData, feeRate, profitTarget]);

  return {
    isMonitoring: enabled && isConnected,
    isConnected,
    getPositionProfits,
    triggeredCount: triggeredPositionsRef.current.size,
    checksPerSecond: checksPerSecondRef.current,
  };
}
