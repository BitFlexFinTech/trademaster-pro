import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Holding {
  id: string;
  assetSymbol: string;
  quantity: number;
  averageBuyPrice: number;
  exchangeName: string | null;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

interface NewHolding {
  assetSymbol: string;
  quantity: number;
  averageBuyPrice: number;
  exchangeName?: string;
}

export function usePortfolioManagement() {
  const { user } = useAuth();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);

  const fetchHoldings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch holdings and prices in parallel
      const [holdingsRes, pricesRes] = await Promise.all([
        supabase
          .from('portfolio_holdings')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('price_cache')
          .select('symbol, price'),
      ]);

      if (holdingsRes.error) throw holdingsRes.error;

      const priceMap = new Map(
        (pricesRes.data || []).map(p => [p.symbol.toUpperCase(), p.price])
      );

      let total = 0;
      let pnlTotal = 0;

      const mappedHoldings: Holding[] = (holdingsRes.data || []).map(h => {
        const currentPrice = priceMap.get(h.asset_symbol.toUpperCase()) || 0;
        const value = h.quantity * currentPrice;
        const costBasis = h.quantity * (h.average_buy_price || 0);
        const pnl = value - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        total += value;
        pnlTotal += pnl;

        return {
          id: h.id,
          assetSymbol: h.asset_symbol,
          quantity: h.quantity,
          averageBuyPrice: h.average_buy_price || 0,
          exchangeName: h.exchange_name,
          currentPrice,
          value,
          pnl,
          pnlPercent,
        };
      });

      setHoldings(mappedHoldings);
      setTotalValue(total);
      setTotalPnl(pnlTotal);
    } catch (error) {
      console.error('Error fetching holdings:', error);
      toast.error('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addHolding = async (holding: NewHolding) => {
    if (!user) {
      toast.error('Please login to add holdings');
      return false;
    }

    try {
      const { error } = await supabase
        .from('portfolio_holdings')
        .insert({
          user_id: user.id,
          asset_symbol: holding.assetSymbol.toUpperCase(),
          quantity: holding.quantity,
          average_buy_price: holding.averageBuyPrice,
          exchange_name: holding.exchangeName || null,
        });

      if (error) throw error;
      
      toast.success(`Added ${holding.assetSymbol} to portfolio`);
      fetchHoldings();
      return true;
    } catch (error) {
      console.error('Error adding holding:', error);
      toast.error('Failed to add holding');
      return false;
    }
  };

  const updateHolding = async (id: string, updates: Partial<NewHolding>) => {
    if (!user) return false;

    try {
      const updateData: Record<string, any> = {};
      if (updates.assetSymbol) updateData.asset_symbol = updates.assetSymbol.toUpperCase();
      if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
      if (updates.averageBuyPrice !== undefined) updateData.average_buy_price = updates.averageBuyPrice;
      if (updates.exchangeName !== undefined) updateData.exchange_name = updates.exchangeName;

      const { error } = await supabase
        .from('portfolio_holdings')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('Holding updated');
      fetchHoldings();
      return true;
    } catch (error) {
      console.error('Error updating holding:', error);
      toast.error('Failed to update holding');
      return false;
    }
  };

  const deleteHolding = async (id: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('portfolio_holdings')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('Holding removed');
      fetchHoldings();
      return true;
    } catch (error) {
      console.error('Error deleting holding:', error);
      toast.error('Failed to delete holding');
      return false;
    }
  };

  useEffect(() => {
    fetchHoldings();
  }, [fetchHoldings]);

  return {
    holdings,
    loading,
    totalValue,
    totalPnl,
    addHolding,
    updateHolding,
    deleteHolding,
    refetch: fetchHoldings,
  };
}
