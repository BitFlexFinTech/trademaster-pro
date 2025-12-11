import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useRealtimePrices() {
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('price_cache')
        .select('*')
        .order('market_cap', { ascending: false });

      if (error) throw error;
      setPrices(data || []);
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
      // Call edge function to refresh prices from CoinGecko
      const { error } = await supabase.functions.invoke('fetch-prices');
      if (error) {
        console.error('Error refreshing prices:', error);
      }
      
      // Fetch updated data
      await Promise.all([fetchPrices(), fetchOpportunities()]);
    } catch (err: any) {
      console.error('Error refreshing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchPrices, fetchOpportunities]);

  useEffect(() => {
    // Initial fetch
    Promise.all([fetchPrices(), fetchOpportunities()]).then(() => setLoading(false));

    // Subscribe to real-time price updates
    const priceChannel = supabase
      .channel('price-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'price_cache',
        },
        (payload) => {
          console.log('Price update:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setPrices((prev) => {
              const existing = prev.findIndex((p) => p.symbol === (payload.new as PriceData).symbol);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = payload.new as PriceData;
                return updated;
              }
              return [...prev, payload.new as PriceData];
            });
          }
        }
      )
      .subscribe();

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

    // Auto-refresh every 60 seconds
    const refreshInterval = setInterval(() => {
      refreshData();
    }, 60000);

    return () => {
      supabase.removeChannel(priceChannel);
      supabase.removeChannel(arbChannel);
      clearInterval(refreshInterval);
    };
  }, [fetchPrices, fetchOpportunities, refreshData]);

  return { prices, opportunities, loading, error, refreshData };
}