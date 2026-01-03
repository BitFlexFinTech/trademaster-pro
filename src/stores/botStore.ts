// ============================================
// Centralized Zustand Bot Store
// Single source of truth for all bot state
// ============================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import type { 
  BotState, 
  Bot, 
  Position, 
  MarketData, 
  Order,
  ScannerOpportunity,
  CapitalMetrics,
  ExecutionMetrics 
} from './types';

// Initial state values
const initialMarketData: MarketData = {
  prices: {},
  volumes: {},
  changes24h: {},
  pairsScanned: 0,
  lastUpdate: 0,
  isScanning: false,
};

const initialCapitalMetrics: CapitalMetrics = {
  totalCapital: 0,
  deployedCapital: 0,
  idleFunds: 0,
  utilization: 0,
  byExchange: {},
};

const initialExecutionMetrics: ExecutionMetrics = {
  avgExecutionTimeMs: 0,
  lastExecutionTimeMs: 0,
  tradesPerMinute: 0,
  successRate: 100,
  recentExecutions: [],
};

export const useBotStore = create<BotState>()(
  subscribeWithSelector((set, get) => ({
    // ===== Initial State =====
    bots: [],
    activeBotId: null,
    marketData: initialMarketData,
    capitalMetrics: initialCapitalMetrics,
    executionMetrics: initialExecutionMetrics,
    positions: [],
    opportunities: [],
    isTrading: false,
    isSyncing: false,
    lastSyncTime: 0,
    deploymentQueue: [],
    isLoading: true,
    error: null,

    // ===== Bot Management Actions =====
    updateBot: (id, data) => set(state => ({
      bots: state.bots.map(bot => 
        bot.id === id ? { ...bot, ...data, updatedAt: new Date().toISOString() } : bot
      )
    })),

    setActiveBot: (id) => set({ activeBotId: id }),

    addBot: (bot) => set(state => ({
      bots: [...state.bots, bot]
    })),

    removeBot: (id) => set(state => ({
      bots: state.bots.filter(bot => bot.id !== id),
      activeBotId: state.activeBotId === id ? null : state.activeBotId
    })),

    // ===== Data Sync Actions =====
    syncAllData: async () => {
      const state = get();
      if (state.isSyncing) return;
      
      set({ isSyncing: true });
      
      try {
        await Promise.all([
          get().syncBots(),
          get().syncPositions(),
        ]);
        
        get().calculateCapitalUtilization();
        
        set({ 
          lastSyncTime: Date.now(),
          isSyncing: false,
          error: null 
        });
      } catch (error) {
        console.error('[BotStore] Sync error:', error);
        set({ 
          isSyncing: false,
          error: error instanceof Error ? error.message : 'Sync failed'
        });
      }
    },

    syncBots: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;

      const { data: botRuns, error } = await supabase
        .from('bot_runs')
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[BotStore] Failed to fetch bots:', error);
        return;
      }

      const bots: Bot[] = (botRuns || []).map(run => ({
        id: run.id,
        name: run.bot_name,
        type: run.mode === 'leverage' ? 'leverage' : 'spot',
        status: run.status === 'running' ? 'running' : 'stopped',
        mode: run.is_sandbox ? 'demo' : 'live',
        dailyTarget: run.daily_target || 20,
        profitPerTrade: run.profit_per_trade || 1,
        amountPerTrade: 333,
        tradeIntervalMs: 60000,
        allocatedCapital: 1000,
        currentPnL: run.current_pnl || 0,
        tradesExecuted: run.trades_executed || 0,
        hitRate: run.hit_rate || 0,
        maxDrawdown: run.max_drawdown || 0,
        startedAt: run.started_at,
        stoppedAt: run.stopped_at,
        createdAt: run.created_at || new Date().toISOString(),
        updatedAt: run.updated_at || new Date().toISOString(),
      }));

      set({ bots, isLoading: false });
    },

    syncPositions: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;

      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', session.session.user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[BotStore] Failed to fetch positions:', error);
        return;
      }

      const positions: Position[] = (trades || []).map(trade => ({
        id: trade.id,
        symbol: trade.pair,
        exchange: trade.exchange_name || 'Binance',
        side: trade.direction as 'long' | 'short',
        entryPrice: trade.entry_price,
        entryValue: trade.amount,
        quantity: trade.amount / trade.entry_price,
        leverage: trade.leverage || 1,
        currentPrice: trade.entry_price, // Will be updated by market data sync
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        openedAt: trade.created_at,
        tradeId: trade.id,
      }));

      set({ positions });
    },

    // ===== Trading Engine Actions =====
    startTradingEngine: () => {
      console.log('[BotStore] Starting trading engine');
      set({ isTrading: true });
    },

    stopTradingEngine: () => {
      console.log('[BotStore] Stopping trading engine');
      set({ isTrading: false });
    },

    deployIdleFunds: async () => {
      const { capitalMetrics, opportunities, isTrading } = get();
      
      if (!isTrading || capitalMetrics.idleFunds < 50) {
        console.log('[BotStore] Skip deploy: not trading or insufficient funds');
        return;
      }

      const topOpportunity = opportunities[0];
      if (!topOpportunity) {
        console.log('[BotStore] No opportunities available');
        return;
      }

      console.log('[BotStore] Deploying idle funds:', capitalMetrics.idleFunds);
      
      // Create order and add to queue
      const order: Order = {
        id: `order_${Date.now()}`,
        symbol: topOpportunity.symbol,
        exchange: topOpportunity.exchange,
        side: topOpportunity.direction === 'long' ? 'buy' : 'sell',
        type: 'market',
        amount: Math.min(capitalMetrics.idleFunds, 333),
        status: 'pending',
        createdAt: Date.now(),
      };

      get().addToQueue(order);
      await get().processQueue();
    },

    // ===== Position Management Actions =====
    addPosition: (position) => set(state => ({
      positions: [...state.positions, position]
    })),

    updatePosition: (id, data) => set(state => ({
      positions: state.positions.map(pos =>
        pos.id === id ? { ...pos, ...data } : pos
      )
    })),

    removePosition: (id) => set(state => ({
      positions: state.positions.filter(pos => pos.id !== id)
    })),

    // ===== Market Data Actions =====
    updateMarketData: (data) => set(state => ({
      marketData: { ...state.marketData, ...data, lastUpdate: Date.now() }
    })),

    addOpportunity: (opportunity) => set(state => {
      const opportunities = [...state.opportunities, opportunity]
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10); // Keep top 10
      return { opportunities };
    }),

    clearOpportunities: () => set({ opportunities: [] }),

    // ===== Capital Metrics Actions =====
    updateCapitalMetrics: (metrics) => set(state => ({
      capitalMetrics: { ...state.capitalMetrics, ...metrics }
    })),

    calculateCapitalUtilization: () => {
      const { bots, positions } = get();
      
      const totalCapital = bots.reduce((sum, bot) => 
        sum + (bot.status === 'running' ? bot.allocatedCapital : 0), 0
      );
      
      const deployedCapital = positions.reduce((sum, pos) => 
        sum + pos.entryValue, 0
      );
      
      const idleFunds = Math.max(0, totalCapital - deployedCapital);
      const utilization = totalCapital > 0 
        ? (deployedCapital / totalCapital) * 100 
        : 0;

      set({
        capitalMetrics: {
          ...get().capitalMetrics,
          totalCapital,
          deployedCapital,
          idleFunds,
          utilization,
        }
      });
    },

    // ===== Execution Metrics Actions =====
    recordExecution: (tradeId, durationMs, success) => set(state => {
      const execution = { tradeId, durationMs, timestamp: Date.now(), success };
      const recentExecutions = [execution, ...state.executionMetrics.recentExecutions].slice(0, 50);
      
      const successfulExecutions = recentExecutions.filter(e => e.success);
      const avgExecutionTimeMs = successfulExecutions.length > 0
        ? successfulExecutions.reduce((sum, e) => sum + e.durationMs, 0) / successfulExecutions.length
        : 0;
      
      const oneMinuteAgo = Date.now() - 60000;
      const tradesLastMinute = recentExecutions.filter(e => e.timestamp > oneMinuteAgo).length;
      
      const successRate = recentExecutions.length > 0
        ? (successfulExecutions.length / recentExecutions.length) * 100
        : 100;

      return {
        executionMetrics: {
          avgExecutionTimeMs,
          lastExecutionTimeMs: durationMs,
          tradesPerMinute: tradesLastMinute,
          successRate,
          recentExecutions,
        }
      };
    }),

    // ===== Deployment Queue Actions =====
    addToQueue: (order) => set(state => ({
      deploymentQueue: [...state.deploymentQueue, order]
    })),

    removeFromQueue: (orderId) => set(state => ({
      deploymentQueue: state.deploymentQueue.filter(o => o.id !== orderId)
    })),

    processQueue: async () => {
      const { deploymentQueue, isTrading } = get();
      if (!isTrading || deploymentQueue.length === 0) return;

      const order = deploymentQueue[0];
      
      // Update order status
      set(state => ({
        deploymentQueue: state.deploymentQueue.map(o =>
          o.id === order.id ? { ...o, status: 'executing' as const } : o
        )
      }));

      const startTime = Date.now();

      try {
        // Call edge function to execute trade
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user?.id) throw new Error('Not authenticated');

        const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
          body: {
            userId: session.session.user.id,
            symbol: order.symbol,
            exchange: order.exchange,
            side: order.side,
            amount: order.amount,
            type: order.type,
          }
        });

        if (error) throw error;

        const duration = Date.now() - startTime;
        get().recordExecution(order.id, duration, true);
        get().removeFromQueue(order.id);

        console.log('[BotStore] Order executed:', order.id, 'in', duration, 'ms');
      } catch (error) {
        const duration = Date.now() - startTime;
        get().recordExecution(order.id, duration, false);
        
        // Mark as failed and remove
        set(state => ({
          deploymentQueue: state.deploymentQueue.map(o =>
            o.id === order.id ? { ...o, status: 'failed' as const } : o
          )
        }));
        
        setTimeout(() => get().removeFromQueue(order.id), 5000);
        
        console.error('[BotStore] Order execution failed:', error);
      }
    },

    // ===== Error Handling =====
    setError: (error) => set({ error }),
    setLoading: (loading) => set({ isLoading: loading }),
  }))
);

// ===== Subscriptions for Side Effects =====
// Auto-deploy idle funds when conditions are met
useBotStore.subscribe(
  state => ({ isTrading: state.isTrading, idleFunds: state.capitalMetrics.idleFunds }),
  async ({ isTrading, idleFunds }) => {
    if (isTrading && idleFunds > 100) {
      console.log('[BotStore] Auto-deploying idle funds:', idleFunds);
      // Delay slightly to batch updates
      setTimeout(() => useBotStore.getState().deployIdleFunds(), 100);
    }
  }
);
