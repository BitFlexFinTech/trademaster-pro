import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface OpenTrade {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  positionSize: number;
  targetProfit: number;
  openedAt: Date;
  holdingForProfit: boolean;
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
}

export interface AuditEvent {
  id: string;
  action: string;
  symbol: string;
  exchange: string;
  success: boolean;
  netPnl: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface TradingRealtimeState {
  openTrades: OpenTrade[];
  recentClosedTrades: ClosedTrade[];
  auditEvents: AuditEvent[];
  totalOpenPnL: number;
  totalRealizedPnL: number;
  openTradesCount: number;
  closedTradesCount: number;
  isLoading: boolean;
  lastUpdate: Date;
}

const MAX_RECENT_TRADES = 50;
const MAX_AUDIT_EVENTS = 50;

/**
 * Unified real-time trading state hook.
 * Single source of truth for all trading components.
 * Fetches initial state and subscribes to real-time updates.
 */
export function useTradingRealtimeState() {
  const { user } = useAuth();
  const [state, setState] = useState<TradingRealtimeState>({
    openTrades: [],
    recentClosedTrades: [],
    auditEvents: [],
    totalOpenPnL: 0,
    totalRealizedPnL: 0,
    openTradesCount: 0,
    closedTradesCount: 0,
    isLoading: true,
    lastUpdate: new Date(),
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Fetch initial state from database
  const fetchInitialState = useCallback(async () => {
    if (!user?.id) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      // Fetch all trades in parallel
      const [openTradesResult, closedTradesResult, auditResult] = await Promise.all([
        // Open trades
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'open')
          .order('created_at', { ascending: false }),
        
        // Recent closed trades (today)
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('closed_at', today.toISOString())
          .order('closed_at', { ascending: false })
          .limit(MAX_RECENT_TRADES),
        
        // Recent audit events
        supabase
          .from('profit_audit_log')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', today.toISOString())
          .order('created_at', { ascending: false })
          .limit(MAX_AUDIT_EVENTS),
      ]);

      const openTrades: OpenTrade[] = (openTradesResult.data || []).map(t => ({
        id: t.id,
        pair: t.pair,
        direction: t.direction as 'long' | 'short',
        exchange: t.exchange_name || 'Unknown',
        entryPrice: t.entry_price,
        positionSize: t.amount,
        targetProfit: t.target_profit_usd || 1,
        openedAt: new Date(t.created_at),
        holdingForProfit: t.holding_for_profit || false,
      }));

      const recentClosedTrades: ClosedTrade[] = (closedTradesResult.data || []).map(t => ({
        id: t.id,
        pair: t.pair,
        direction: t.direction as 'long' | 'short',
        exchange: t.exchange_name || 'Unknown',
        entryPrice: t.entry_price,
        exitPrice: t.exit_price || t.entry_price,
        positionSize: t.amount,
        profitLoss: t.profit_loss || 0,
        closedAt: new Date(t.closed_at || t.created_at),
      }));

      const auditEvents: AuditEvent[] = (auditResult.data || []).map(a => ({
        id: a.id,
        action: a.action,
        symbol: a.symbol,
        exchange: a.exchange,
        success: a.success || false,
        netPnl: a.net_pnl,
        errorMessage: a.error_message,
        createdAt: new Date(a.created_at),
      }));

      const totalRealizedPnL = recentClosedTrades.reduce((sum, t) => sum + t.profitLoss, 0);

      setState({
        openTrades,
        recentClosedTrades,
        auditEvents,
        totalOpenPnL: 0, // Will be updated by price feed
        totalRealizedPnL,
        openTradesCount: openTrades.length,
        closedTradesCount: recentClosedTrades.length,
        isLoading: false,
        lastUpdate: new Date(),
      });

      console.log(`[useTradingRealtimeState] Loaded ${openTrades.length} open, ${recentClosedTrades.length} closed trades`);
    } catch (error) {
      console.error('[useTradingRealtimeState] Error fetching initial state:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user?.id]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    fetchInitialState();

    // Subscribe to trades table changes
    const tradesChannel = supabase
      .channel('trading-realtime-trades')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        console.log('[useTradingRealtimeState] Trade INSERT:', trade.pair, trade.status);
        
        if (trade.status === 'open') {
          const newTrade: OpenTrade = {
            id: trade.id,
            pair: trade.pair,
            direction: trade.direction,
            exchange: trade.exchange_name || 'Unknown',
            entryPrice: trade.entry_price,
            positionSize: trade.amount,
            targetProfit: trade.target_profit_usd || 1,
            openedAt: new Date(trade.created_at),
            holdingForProfit: trade.holding_for_profit || false,
          };
          
          setState(prev => ({
            ...prev,
            openTrades: [newTrade, ...prev.openTrades],
            openTradesCount: prev.openTradesCount + 1,
            lastUpdate: new Date(),
          }));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        const oldTrade = payload.old as any;
        console.log('[useTradingRealtimeState] Trade UPDATE:', trade.pair, oldTrade.status, '->', trade.status);
        
        // Trade closed
        if (trade.status === 'closed' && oldTrade.status === 'open') {
          const closedTrade: ClosedTrade = {
            id: trade.id,
            pair: trade.pair,
            direction: trade.direction,
            exchange: trade.exchange_name || 'Unknown',
            entryPrice: trade.entry_price,
            exitPrice: trade.exit_price || trade.entry_price,
            positionSize: trade.amount,
            profitLoss: trade.profit_loss || 0,
            closedAt: new Date(trade.closed_at || new Date()),
          };
          
          setState(prev => ({
            ...prev,
            openTrades: prev.openTrades.filter(t => t.id !== trade.id),
            recentClosedTrades: [closedTrade, ...prev.recentClosedTrades].slice(0, MAX_RECENT_TRADES),
            openTradesCount: prev.openTradesCount - 1,
            closedTradesCount: prev.closedTradesCount + 1,
            totalRealizedPnL: prev.totalRealizedPnL + (trade.profit_loss || 0),
            lastUpdate: new Date(),
          }));
        } else if (trade.status === 'open') {
          // Update existing open trade (e.g., holding_for_profit changed)
          setState(prev => ({
            ...prev,
            openTrades: prev.openTrades.map(t => 
              t.id === trade.id 
                ? { ...t, holdingForProfit: trade.holding_for_profit || false }
                : t
            ),
            lastUpdate: new Date(),
          }));
        }
      })
      .subscribe();

    // Subscribe to audit log changes
    const auditChannel = supabase
      .channel('trading-realtime-audit')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'profit_audit_log',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const audit = payload.new as any;
        console.log('[useTradingRealtimeState] Audit INSERT:', audit.action, audit.symbol);
        
        const newEvent: AuditEvent = {
          id: audit.id,
          action: audit.action,
          symbol: audit.symbol,
          exchange: audit.exchange,
          success: audit.success || false,
          netPnl: audit.net_pnl,
          errorMessage: audit.error_message,
          createdAt: new Date(audit.created_at),
        };
        
        setState(prev => ({
          ...prev,
          auditEvents: [newEvent, ...prev.auditEvents].slice(0, MAX_AUDIT_EVENTS),
          lastUpdate: new Date(),
        }));
      })
      .subscribe();

    // Subscribe to broadcast events for instant cross-component sync
    const broadcastChannel = supabase
      .channel('trading-realtime-broadcast')
      .on('broadcast', { event: 'trade_opened' }, (payload) => {
        console.log('[useTradingRealtimeState] Broadcast trade_opened:', payload);
        // Refetch to ensure consistency
        fetchInitialState();
      })
      .on('broadcast', { event: 'trade_closed' }, (payload) => {
        console.log('[useTradingRealtimeState] Broadcast trade_closed:', payload);
        // Refetch to ensure consistency
        fetchInitialState();
      })
      .on('broadcast', { event: 'balance_synced' }, (payload) => {
        console.log('[useTradingRealtimeState] Broadcast balance_synced:', payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [user?.id, fetchInitialState]);

  const refresh = useCallback(() => {
    fetchInitialState();
  }, [fetchInitialState]);

  return {
    ...state,
    refresh,
  };
}
