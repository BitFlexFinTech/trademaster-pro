import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useRealtimePrices } from './useRealtimePrices';
import { generateDemoPortfolio, calculateDemoPortfolioValue } from '@/lib/demoPortfolio';
import { eventBus } from '@/lib/eventBus';

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
  availableUSDT: number;
}

export function usePortfolio() {
  const { user } = useAuth();
  // Use syncTrigger for data refresh (does NOT reset P&L)
  const { mode: tradingMode, virtualBalance, syncTrigger, lastSyncTime, demoAllocation, exchangeBalances } = useTradingMode();
  const { prices } = useRealtimePrices();
  
  const [portfolio, setPortfolio] = useState<PortfolioData>({
    totalValue: 0,
    change24h: 0,
    changePercent: 0,
    holdings: [],
    availableUSDT: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const fetchingRef = useRef(false);

  const fetchPortfolio = useCallback(async () => {
    if (fetchingRef.current) {
      if (import.meta.env.DEV) console.log('Portfolio fetch already in progress, skipping...');
      return;
    }
    fetchingRef.current = true;
    
    try {
      // Demo mode - use synthetic portfolio based on virtualBalance + real prices
      if (tradingMode === 'demo') {
        setLoading(true);
        
        const demoHoldings = generateDemoPortfolio(virtualBalance, prices);
        const { totalValue, change24h, changePercent } = calculateDemoPortfolioValue(virtualBalance, prices);
        const availableUSDT = virtualBalance * (demoAllocation.USDT / 100);
        
        setPortfolio({
          totalValue,
          change24h,
          changePercent,
          holdings: demoHoldings,
          availableUSDT,
        });
        
        setLoading(false);
        return;
      }

      // Live mode - use exchangeBalances from context (single source of truth)
      if (!user) {
        setLoading(false);
        return;
      }

      // Use exchangeBalances from TradingModeContext for consistency
      if (exchangeBalances.length > 0) {
        const totalValue = exchangeBalances.reduce((sum, b) => sum + b.totalValue, 0);
        const availableUSDT = exchangeBalances.reduce((sum, b) => sum + b.usdtBalance, 0);
        
        // Fetch detailed holdings for display
        const { data: holdings, error: holdingsError } = await supabase
          .from('portfolio_holdings')
          .select('*')
          .eq('user_id', user.id);

        if (holdingsError) throw holdingsError;

        const priceMap = new Map(prices.map(p => [p.symbol, { price: p.price, change: p.change_24h }]));
        
        let totalChange = 0;
        const calculatedHoldings: Holding[] = [];

        holdings?.forEach(holding => {
          if (['USDT', 'USDC', 'USD'].includes(holding.asset_symbol)) {
            calculatedHoldings.push({
              symbol: holding.asset_symbol,
              quantity: holding.quantity,
              value: holding.quantity,
              percent: 0,
              averageBuyPrice: 1,
            });
          } else {
            const priceData = priceMap.get(holding.asset_symbol);
            if (priceData) {
              const value = holding.quantity * priceData.price;
              const changeAmount = value * (priceData.change || 0) / 100;
              totalChange += changeAmount;
              
              calculatedHoldings.push({
                symbol: holding.asset_symbol,
                quantity: holding.quantity,
                value,
                percent: 0,
                averageBuyPrice: holding.average_buy_price || 0,
              });
            }
          }
        });

        calculatedHoldings.forEach(h => {
          h.percent = totalValue > 0 ? Math.round((h.value / totalValue) * 100) : 0;
        });

        calculatedHoldings.sort((a, b) => b.value - a.value);

        setPortfolio({
          totalValue,
          change24h: totalChange,
          changePercent: totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0,
          holdings: calculatedHoldings.slice(0, 5),
          availableUSDT,
        });
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [user, tradingMode, virtualBalance, prices, demoAllocation, exchangeBalances]);

  // Refetch when syncTrigger changes (not resetTrigger - that would reset P&L)
  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio, syncTrigger]);

  // Subscribe to real-time trade events for immediate portfolio updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to trades table changes (INSERT, UPDATE with status='closed')
    const tradesChannel = supabase
      .channel('portfolio-trades-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch on any trade change, especially when status changes to 'closed'
          if (payload.eventType === 'UPDATE' && (payload.new as any)?.status === 'closed') {
            console.log('[PORTFOLIO] Trade closed, refreshing portfolio...');
            fetchPortfolio();
          } else if (payload.eventType === 'INSERT') {
            fetchPortfolio();
          }
        }
      )
      .subscribe();

    // Subscribe to trading-events broadcast channel for trade_closed events
    const eventsChannel = supabase
      .channel('portfolio-trading-events')
      .on('broadcast', { event: 'trade_closed' }, () => {
        console.log('[PORTFOLIO] trade_closed broadcast received');
        fetchPortfolio();
        // Emit portfolio_updated event for other components
        eventBus.emit('portfolio_updated', {});
      })
      .on('broadcast', { event: 'balance_synced' }, () => {
        console.log('[PORTFOLIO] balance_synced broadcast received');
        fetchPortfolio();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [user, fetchPortfolio]);

  return { portfolio, loading, refetch: fetchPortfolio, tradingMode, lastSyncTime };
}
