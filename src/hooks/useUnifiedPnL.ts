import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useTradingRealtimeState } from '@/hooks/useTradingRealtimeState';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

interface UnifiedPnLData {
  // All time
  totalRealized: number;
  totalUnrealized: number;
  
  // Today
  todayRealized: number;
  todayUnrealized: number;
  totalToday: number;
  
  // Session
  sessionProfit: number;
  dailyTarget: number;
  progressPercent: number;
  
  // Trade stats
  tradesCountToday: number;
  winsToday: number;
  lossesToday: number;
  winRate: number;
  
  // Breakdown by exchange
  byExchange: Record<string, { realized: number; unrealized: number }>;
  
  // Loading state
  isLoading: boolean;
}

export function useUnifiedPnL(): UnifiedPnLData {
  const { user } = useAuth();
  const { openTrades, isLoading: tradesLoading } = useTradingRealtimeState();
  const { getPrice } = useBinanceWebSocket();
  
  const [todayRealized, setTodayRealized] = useState(0);
  const [totalRealized, setTotalRealized] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(20);
  const [tradesCountToday, setTradesCountToday] = useState(0);
  const [winsToday, setWinsToday] = useState(0);
  const [lossesToday, setLossesToday] = useState(0);
  const [byExchangeRealized, setByExchangeRealized] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch closed trades data
  useEffect(() => {
    if (!user?.id) return;

    const fetchClosedTrades = async () => {
      setIsLoading(true);
      
      // Get today's date at midnight
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      // Fetch today's closed trades
      const { data: todayTrades, error: todayError } = await supabase
        .from('trades')
        .select('profit_loss, exchange_name, status')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', todayIso);

      if (!todayError && todayTrades) {
        const realized = todayTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        const wins = todayTrades.filter(t => (t.profit_loss || 0) > 0).length;
        const losses = todayTrades.filter(t => (t.profit_loss || 0) < 0).length;
        
        setTodayRealized(realized);
        setTradesCountToday(todayTrades.length);
        setWinsToday(wins);
        setLossesToday(losses);
        
        // Group by exchange
        const byExchange: Record<string, number> = {};
        todayTrades.forEach(t => {
          const ex = t.exchange_name || 'unknown';
          byExchange[ex] = (byExchange[ex] || 0) + (t.profit_loss || 0);
        });
        setByExchangeRealized(byExchange);
      }

      // Fetch all-time realized P&L
      const { data: allTrades, error: allError } = await supabase
        .from('trades')
        .select('profit_loss')
        .eq('user_id', user.id)
        .eq('status', 'closed');

      if (!allError && allTrades) {
        const total = allTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        setTotalRealized(total);
      }

      // Fetch daily target from config
      const { data: config } = await supabase
        .from('bot_config')
        .select('daily_target')
        .eq('user_id', user.id)
        .single();

      if (config?.daily_target) {
        setDailyTarget(config.daily_target);
      }

      setIsLoading(false);
    };

    fetchClosedTrades();

    // Subscribe to trade changes
    const channel = supabase
      .channel(`unified-pnl-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchClosedTrades();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Calculate unrealized P&L from open positions with live prices
  const { todayUnrealized, byExchangeUnrealized } = useMemo(() => {
    let unrealized = 0;
    const byExchange: Record<string, number> = {};

    openTrades.forEach(trade => {
      const symbol = trade.pair.replace('/', '');
      const currentPrice = getPrice(symbol) || trade.entryPrice;
      
      const priceDiff = trade.direction === 'long'
        ? currentPrice - trade.entryPrice
        : trade.entryPrice - currentPrice;
      
      const percentChange = (priceDiff / trade.entryPrice);
      const grossPnl = trade.positionSize * percentChange;
      const fees = trade.positionSize * 0.002; // 0.2% round trip
      const netPnl = grossPnl - fees;
      
      unrealized += netPnl;
      
      const ex = trade.exchange || 'unknown';
      byExchange[ex] = (byExchange[ex] || 0) + netPnl;
    });

    return { todayUnrealized: unrealized, byExchangeUnrealized: byExchange };
  }, [openTrades, getPrice]);

  // Combine exchange data
  const byExchange = useMemo(() => {
    const combined: Record<string, { realized: number; unrealized: number }> = {};
    
    Object.keys(byExchangeRealized).forEach(ex => {
      combined[ex] = { 
        realized: byExchangeRealized[ex] || 0, 
        unrealized: byExchangeUnrealized[ex] || 0 
      };
    });
    
    Object.keys(byExchangeUnrealized).forEach(ex => {
      if (!combined[ex]) {
        combined[ex] = { 
          realized: 0, 
          unrealized: byExchangeUnrealized[ex] || 0 
        };
      }
    });
    
    return combined;
  }, [byExchangeRealized, byExchangeUnrealized]);

  const totalToday = todayRealized + todayUnrealized;
  const sessionProfit = totalToday;
  const progressPercent = dailyTarget > 0 ? Math.min(100, (totalToday / dailyTarget) * 100) : 0;
  const winRate = tradesCountToday > 0 ? (winsToday / tradesCountToday) * 100 : 0;

  return {
    totalRealized,
    totalUnrealized: todayUnrealized,
    todayRealized,
    todayUnrealized,
    totalToday,
    sessionProfit,
    dailyTarget,
    progressPercent,
    tradesCountToday,
    winsToday,
    lossesToday,
    winRate,
    byExchange,
    isLoading: isLoading || tradesLoading,
  };
}
