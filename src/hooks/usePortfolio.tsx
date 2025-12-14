import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useRealtimePrices } from './useRealtimePrices';
import { generateDemoPortfolio, calculateDemoPortfolioValue } from '@/lib/demoPortfolio';

interface Holding {
  symbol: string;
  quantity: number;
  value: number;
  percent: number;
  averageBuyPrice: number;
}

interface PortfolioData {
  totalValue: number;
  change24h: number;
  changePercent: number;
  holdings: Holding[];
}

export function usePortfolio() {
  const { user } = useAuth();
  const { mode: tradingMode, virtualBalance, resetTrigger } = useTradingMode();
  const { prices } = useRealtimePrices();
  
  const [portfolio, setPortfolio] = useState<PortfolioData>({
    totalValue: 0,
    change24h: 0,
    changePercent: 0,
    holdings: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchPortfolio = useCallback(async () => {
    // Demo mode - use synthetic portfolio based on virtualBalance + real prices
    if (tradingMode === 'demo') {
      setLoading(true);
      
      // Generate demo holdings from virtual balance with real prices
      const demoHoldings = generateDemoPortfolio(virtualBalance, prices);
      const { totalValue, change24h, changePercent } = calculateDemoPortfolioValue(virtualBalance, prices);
      
      setPortfolio({
        totalValue,
        change24h,
        changePercent,
        holdings: demoHoldings,
      });
      
      setLoading(false);
      return;
    }

    // Live mode - fetch from database
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch user holdings
      const { data: holdings, error: holdingsError } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('user_id', user.id);

      if (holdingsError) throw holdingsError;

      // Use real-time prices from hook instead of fetching again
      const priceMap = new Map(prices.map(p => [p.symbol, { price: p.price, change: p.change_24h }]));
      
      let totalValue = 0;
      let totalChange = 0;
      const calculatedHoldings: Holding[] = [];

      holdings?.forEach(holding => {
        const priceData = priceMap.get(holding.asset_symbol);
        if (priceData) {
          const value = holding.quantity * priceData.price;
          const changeAmount = value * (priceData.change || 0) / 100;
          totalValue += value;
          totalChange += changeAmount;
          
          calculatedHoldings.push({
            symbol: holding.asset_symbol,
            quantity: holding.quantity,
            value,
            percent: 0, // Will calculate after total
            averageBuyPrice: holding.average_buy_price || 0,
          });
        }
      });

      // Calculate percentages
      calculatedHoldings.forEach(h => {
        h.percent = totalValue > 0 ? Math.round((h.value / totalValue) * 100) : 0;
      });

      // Sort by value descending
      calculatedHoldings.sort((a, b) => b.value - a.value);

      setPortfolio({
        totalValue,
        change24h: totalChange,
        changePercent: totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0,
        holdings: calculatedHoldings.slice(0, 5), // Top 5
      });
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
    }
  }, [user, tradingMode, virtualBalance, prices]);

  // Refetch when mode, virtualBalance, prices, or resetTrigger changes
  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio, resetTrigger]);

  return { portfolio, loading, refetch: fetchPortfolio, tradingMode };
}
