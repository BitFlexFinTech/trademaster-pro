import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

// ============ Types ============
export interface OpenPosition {
  id: string;
  pair: string;
  symbol: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  positionSize: number;
  targetProfit: number;
  openedAt: Date;
  holdingForProfit: boolean;
  leverage?: number;
  // Real-time fields
  currentPrice?: number;
  unrealizedPnL?: number;
  progressPercent?: number;
}

export interface ClosedTrade {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  profitLoss: number;
  closedAt: Date;
  openedAt?: Date;
  holdDurationMs?: number;
  executionSpeedMs?: number;
}

export interface TradingMetrics {
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  openPositionsCount: number;
  closedTradesCount: number;
  winRate: number;
  avgHoldTime: number;
  avgExecutionSpeed: number;
}

interface TradingDataContextValue {
  // Data
  openPositions: OpenPosition[];
  recentTrades: ClosedTrade[];
  metrics: TradingMetrics;
  
  // Status
  isLoading: boolean;
  isConnected: boolean;
  lastUpdate: Date;
  
  // Monitoring mode
  monitoringMode: 'websocket' | 'polling';
  setMonitoringMode: (mode: 'websocket' | 'polling') => void;
  wsLatency: number;
  pollingLatency: number;
  
  // Actions
  refresh: () => void;
}

const defaultMetrics: TradingMetrics = {
  totalUnrealizedPnL: 0,
  totalRealizedPnL: 0,
  openPositionsCount: 0,
  closedTradesCount: 0,
  winRate: 0,
  avgHoldTime: 0,
  avgExecutionSpeed: 0,
};

const TradingDataContext = createContext<TradingDataContextValue | null>(null);

export function TradingDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { getPrice, isConnected: wsConnected, latencyMetrics } = useBinanceWebSocket();
  
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [recentTrades, setRecentTrades] = useState<ClosedTrade[]>([]);
  const [metrics, setMetrics] = useState<TradingMetrics>(defaultMetrics);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [monitoringMode, setMonitoringMode] = useState<'websocket' | 'polling'>('websocket');
  const [wsLatency, setWsLatency] = useState(0);
  const [pollingLatency, setPollingLatency] = useState(0);
  
  const priceUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    try {
      const [openResult, closedResult] = await Promise.all([
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'open')
          .eq('is_sandbox', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .eq('is_sandbox', false)
          .gte('closed_at', today.toISOString())
          .order('closed_at', { ascending: false })
          .limit(100),
      ]);

      const positions: OpenPosition[] = (openResult.data || []).map(t => ({
        id: t.id,
        pair: t.pair,
        symbol: t.pair.replace('/', ''),
        direction: t.direction as 'long' | 'short',
        exchange: t.exchange_name || 'Unknown',
        entryPrice: t.entry_price,
        positionSize: t.amount,
        targetProfit: t.target_profit_usd || 1,
        openedAt: new Date(t.created_at),
        holdingForProfit: t.holding_for_profit || false,
        leverage: t.leverage || 1,
      }));

      const trades: ClosedTrade[] = (closedResult.data || []).map(t => {
        const openedAt = new Date(t.created_at);
        const closedAt = new Date(t.closed_at || t.created_at);
        return {
          id: t.id,
          pair: t.pair,
          direction: t.direction as 'long' | 'short',
          exchange: t.exchange_name || 'Unknown',
          entryPrice: t.entry_price,
          exitPrice: t.exit_price || t.entry_price,
          positionSize: t.amount,
          profitLoss: t.profit_loss || 0,
          closedAt,
          openedAt,
          holdDurationMs: closedAt.getTime() - openedAt.getTime(),
        };
      });

      setOpenPositions(positions);
      setRecentTrades(trades);
      
      // Calculate metrics
      const wins = trades.filter(t => t.profitLoss > 0);
      const totalPnL = trades.reduce((sum, t) => sum + t.profitLoss, 0);
      const avgHold = trades.length > 0 
        ? trades.reduce((sum, t) => sum + (t.holdDurationMs || 0), 0) / trades.length 
        : 0;
      
      setMetrics({
        totalUnrealizedPnL: 0,
        totalRealizedPnL: totalPnL,
        openPositionsCount: positions.length,
        closedTradesCount: trades.length,
        winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
        avgHoldTime: avgHold,
        avgExecutionSpeed: 0,
      });
      
      setIsLoading(false);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[TradingDataContext] Fetch error:', error);
      setIsLoading(false);
    }
  }, [user?.id]);

  // Update positions with real-time prices
  const updatePrices = useCallback(() => {
    if (monitoringMode !== 'websocket' || openPositions.length === 0) return;
    
    const startTime = Date.now();
    
    setOpenPositions(prev => prev.map(pos => {
      const currentPrice = getPrice(pos.symbol) || pos.entryPrice;
      const priceDiff = pos.direction === 'long'
        ? currentPrice - pos.entryPrice
        : pos.entryPrice - currentPrice;
      const percentChange = (priceDiff / pos.entryPrice) * 100;
      const grossPnl = pos.positionSize * (percentChange / 100) * (pos.leverage || 1);
      const fees = pos.positionSize * 0.002;
      const netPnl = grossPnl - fees;
      const progressPercent = Math.min(100, Math.max(0, (netPnl / pos.targetProfit) * 100));

      return {
        ...pos,
        currentPrice,
        unrealizedPnL: netPnl,
        progressPercent,
      };
    }));
    
    setWsLatency(Date.now() - startTime);
    
    // Update total unrealized P&L in metrics
    setMetrics(prev => ({
      ...prev,
      totalUnrealizedPnL: openPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0),
    }));
  }, [openPositions, getPrice, monitoringMode]);

  // WebSocket price updates (every 100ms)
  useEffect(() => {
    if (monitoringMode === 'websocket' && wsConnected) {
      priceUpdateRef.current = setInterval(updatePrices, 100);
    }
    return () => {
      if (priceUpdateRef.current) clearInterval(priceUpdateRef.current);
    };
  }, [monitoringMode, wsConnected, updatePrices]);

  // Polling mode (every 3s)
  useEffect(() => {
    if (monitoringMode === 'polling') {
      const poll = async () => {
        const startTime = Date.now();
        await fetchData();
        setPollingLatency(Date.now() - startTime);
      };
      pollingRef.current = setInterval(poll, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [monitoringMode, fetchData]);

  // Initial fetch and realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    
    fetchData();
    
    const channel = supabase
      .channel('trading-data-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchData();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  // Update latency from WebSocket hook
  useEffect(() => {
    if (latencyMetrics?.wsAvgLatencyMs) {
      setWsLatency(latencyMetrics.wsAvgLatencyMs);
    }
  }, [latencyMetrics]);

  return (
    <TradingDataContext.Provider value={{
      openPositions,
      recentTrades,
      metrics,
      isLoading,
      isConnected: wsConnected,
      lastUpdate,
      monitoringMode,
      setMonitoringMode,
      wsLatency,
      pollingLatency,
      refresh: fetchData,
    }}>
      {children}
    </TradingDataContext.Provider>
  );
}

export function useTradingData() {
  const context = useContext(TradingDataContext);
  if (!context) {
    throw new Error('useTradingData must be used within TradingDataProvider');
  }
  return context;
}
