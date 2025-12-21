import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

export interface FuturesPosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  liquidationPrice: number;
  liquidationDistance: number;
  leverage: number;
  marginType: string;
  positionSide: 'LONG' | 'SHORT' | 'BOTH';
  isolatedMargin: number;
  notional: number;
}

export interface FuturesAccountData {
  totalMarginBalance: number;
  availableBalance: number;
  totalUnrealizedProfit: number;
  positions: FuturesPosition[];
}

interface UseJarvisFuturesPositionsReturn {
  longPosition: FuturesPosition | null;
  shortPosition: FuturesPosition | null;
  allPositions: FuturesPosition[];
  marginBalance: number;
  availableBalance: number;
  totalUnrealizedPnL: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

export function useJarvisFuturesPositions(
  pollingInterval: number = 5000,
  enabled: boolean = true
): UseJarvisFuturesPositionsReturn {
  const { user } = useAuth();
  const { getPrice } = useBinanceWebSocket();
  
  const [longPosition, setLongPosition] = useState<FuturesPosition | null>(null);
  const [shortPosition, setShortPosition] = useState<FuturesPosition | null>(null);
  const [allPositions, setAllPositions] = useState<FuturesPosition[]>([]);
  const [marginBalance, setMarginBalance] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [totalUnrealizedPnL, setTotalUnrealizedPnL] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session');
        setIsLoading(false);
        return;
      }

      const response = await supabase.functions.invoke('binance-futures-positions', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      if (!data.success) {
        if (data.error === 'No Binance connection found') {
          // Not an error, just no connection
          setError(null);
          setAllPositions([]);
          setLongPosition(null);
          setShortPosition(null);
        } else {
          setError(data.error);
        }
        setIsLoading(false);
        return;
      }

      // Update account data
      setMarginBalance(data.totalMarginBalance || 0);
      setAvailableBalance(data.availableBalance || 0);
      setTotalUnrealizedPnL(data.totalUnrealizedProfit || 0);
      
      // Process positions
      const positions: FuturesPosition[] = data.positions || [];
      setAllPositions(positions);
      
      // Find LONG and SHORT positions (hedge mode)
      // In hedge mode, positionSide will be 'LONG' or 'SHORT'
      // In one-way mode, positionSide is 'BOTH' and we determine by positionAmt sign
      const long = positions.find(p => 
        p.positionSide === 'LONG' || (p.positionSide === 'BOTH' && p.positionAmt > 0)
      ) || null;
      
      const short = positions.find(p => 
        p.positionSide === 'SHORT' || (p.positionSide === 'BOTH' && p.positionAmt < 0)
      ) || null;
      
      // Update positions with real-time prices if available
      if (long) {
        const symbol = long.symbol.toLowerCase();
        const livePrice = getPrice(symbol);
        if (livePrice > 0) {
          long.markPrice = livePrice;
          // Recalculate unrealized PnL
          const priceDiff = livePrice - long.entryPrice;
          long.unrealizedProfit = priceDiff * Math.abs(long.positionAmt);
          // Recalculate liquidation distance
          if (long.liquidationPrice > 0) {
            long.liquidationDistance = ((livePrice - long.liquidationPrice) / livePrice) * 100;
          }
        }
      }
      
      if (short) {
        const symbol = short.symbol.toLowerCase();
        const livePrice = getPrice(symbol);
        if (livePrice > 0) {
          short.markPrice = livePrice;
          // Recalculate unrealized PnL (short profits when price goes down)
          const priceDiff = short.entryPrice - livePrice;
          short.unrealizedProfit = priceDiff * Math.abs(short.positionAmt);
          // Recalculate liquidation distance
          if (short.liquidationPrice > 0) {
            short.liquidationDistance = ((short.liquidationPrice - livePrice) / livePrice) * 100;
          }
        }
      }
      
      setLongPosition(long);
      setShortPosition(short);
      setError(null);
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('[useJarvisFuturesPositions] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
    }
  }, [user, getPrice]);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled || !user) {
      setIsLoading(false);
      return;
    }

    fetchPositions();
    
    pollingRef.current = setInterval(fetchPositions, pollingInterval);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, user, pollingInterval, fetchPositions]);

  return {
    longPosition,
    shortPosition,
    allPositions,
    marginBalance,
    availableBalance,
    totalUnrealizedPnL,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchPositions,
  };
}
