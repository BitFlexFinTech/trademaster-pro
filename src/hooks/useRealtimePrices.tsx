import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBinanceWebSocket, BinanceTickerData } from './useBinanceWebSocket';

export interface PriceData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  market_cap: number;
  last_updated: string;
}

export interface ArbitrageOpportunity {
  id: string;
  pair: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: number;
  sell_price: number;
  profit_percentage: number;
  volume_24h: number;
  expires_at: string;
}

// Convert Binance ticker to PriceData format
function binanceTickerToPriceData(ticker: BinanceTickerData): PriceData {
  return {
    symbol: ticker.symbol.replace('USDT', ''),
    price: ticker.price,
    change_24h: ticker.priceChangePercent,
    volume_24h: ticker.volume,
    market_cap: 0, // Not available from WebSocket, will merge from cache
    last_updated: new Date(ticker.lastUpdated).toISOString(),
  };
}

export function useRealtimePrices() {
  const [cachedPrices, setCachedPrices] = useState<PriceData[]>([]);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use Binance WebSocket for real-time price streaming
  const { 
    tickers: wsTickers, 
    isConnected: wsConnected, 
    error: wsError,
    getPrice,
    getTicker,
  } = useBinanceWebSocket();

  // Merge WebSocket prices with cached data (for market cap, etc.)
  const prices = useMemo(() => {
    if (wsTickers.length === 0) return cachedPrices;
    
    // Create a map of WS tickers for fast lookup
    const wsTickerMap = new Map(
      wsTickers.map(t => [t.symbol.replace('USDT', ''), binanceTickerToPriceData(t)])
    );
    
    // Merge: prefer WebSocket prices but keep cached market_cap
    return cachedPrices.map(cached => {
      const wsData = wsTickerMap.get(cached.symbol);
      if (wsData) {
        return {
          ...wsData,
          market_cap: cached.market_cap, // Keep market cap from cache
        };
      }
      return cached;
    });
  }, [cachedPrices, wsTickers]);

  const fetchPrices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('price_cache')
        .select('*')
        .order('market_cap', { ascending: false });

      if (error) throw error;
      setCachedPrices(data || []);
    } catch (err: any) {
      console.error('Error fetching prices:', err);
      setError(err.message);
    }
  }, []);

  const fetchOpportunities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('arbitrage_opportunities')
        .select('*')
        .order('profit_percentage', { ascending: false })
        .limit(50);

      if (error) throw error;
      setOpportunities(data || []);
    } catch (err: any) {
      console.error('Error fetching opportunities:', err);
      setError(err.message);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      // Call edge function to refresh prices from CoinGecko (for market cap data)
      const { error } = await supabase.functions.invoke('fetch-prices');
      if (error) {
        console.error('Error refreshing prices:', error);
      }
      
      // Fetch updated cached data
      await Promise.all([fetchPrices(), fetchOpportunities()]);
    } catch (err: any) {
      console.error('Error refreshing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchPrices, fetchOpportunities]);

  useEffect(() => {
    // Initial fetch of cached data (for market cap, etc.)
    Promise.all([fetchPrices(), fetchOpportunities()]).then(() => setLoading(false));

    // Subscribe to arbitrage opportunity updates
    const arbChannel = supabase
      .channel('arb-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'arbitrage_opportunities',
        },
        (payload) => {
          console.log('Arbitrage update:', payload);
          fetchOpportunities(); // Refetch all opportunities on change
        }
      )
      .subscribe();

    // Refresh cached data every 5 minutes (for market cap updates)
    const refreshInterval = setInterval(() => {
      fetchPrices();
    }, 300000);

    return () => {
      supabase.removeChannel(arbChannel);
      clearInterval(refreshInterval);
    };
  }, [fetchPrices, fetchOpportunities]);

  // Combine WebSocket error with general error
  const combinedError = wsError || error;

  return { 
    prices, 
    opportunities, 
    loading, 
    error: combinedError, 
    refreshData,
    // New WebSocket-specific exports
    wsConnected,
    getPrice,
    getTicker,
  };
}