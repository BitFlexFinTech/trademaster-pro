// ============================================
// Real-Time Sync Engine
// Consolidated sync intervals for efficiency
// ============================================

import { useBotStore } from '@/stores/botStore';
import { supabase } from '@/integrations/supabase/client';

class RealtimeSyncEngine {
  private syncIntervalId: NodeJS.Timeout | null = null;
  private metricsIntervalId: NodeJS.Timeout | null = null;
  private historyIntervalId: NodeJS.Timeout | null = null;
  private tradeCleanupIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private metricsIntervalMs = 100; // 100ms for metrics recalculation

  /**
   * Start the real-time sync engine
   */
  start() {
    if (this.isRunning) {
      console.log('[RealtimeSync] Already running');
      return;
    }

    console.log('[RealtimeSync] Starting sync engine');
    this.isRunning = true;

    // Initial data load
    this.initialSync();

    // Sync metrics every 100ms (capital calculations, efficiency)
    // Note: WebSocket bridge handles real-time prices, not this engine
    this.metricsIntervalId = setInterval(() => {
      this.syncMetrics();
    }, this.metricsIntervalMs);

    // Full data sync every 5 seconds (database sync)
    this.syncIntervalId = setInterval(() => {
      this.fullSync();
    }, 5000);

    // Record capital history every minute
    this.historyIntervalId = setInterval(() => {
      useBotStore.getState().addCapitalHistoryPoint();
    }, 60000);
    
    // Clean up stuck trades every 30 seconds
    this.tradeCleanupIntervalId = setInterval(() => {
      this.cleanupStuckTrades();
    }, 30000);

    // Set up Supabase realtime subscriptions
    this.setupRealtimeSubscriptions();
  }

  /**
   * Stop the sync engine
   */
  stop() {
    console.log('[RealtimeSync] Stopping sync engine');
    this.isRunning = false;

    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    if (this.metricsIntervalId) {
      clearInterval(this.metricsIntervalId);
      this.metricsIntervalId = null;
    }

    if (this.historyIntervalId) {
      clearInterval(this.historyIntervalId);
      this.historyIntervalId = null;
    }
    
    if (this.tradeCleanupIntervalId) {
      clearInterval(this.tradeCleanupIntervalId);
      this.tradeCleanupIntervalId = null;
    }
  }

  /**
   * Initial data sync on startup
   */
  private async initialSync() {
    console.log('[RealtimeSync] Running initial sync with exchange balances');
    try {
      // Sync exchange balances FIRST
      await this.syncExchangeBalances();
      
      // Then sync bots and positions
      await useBotStore.getState().syncAllData();
      
      console.log('[RealtimeSync] Initial sync complete');
    } catch (error) {
      console.error('[RealtimeSync] Initial sync failed:', error);
    }
  }

  /**
   * Sync exchange balances from connected exchanges
   */
  private async syncExchangeBalances() {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;
      
      console.log('[RealtimeSync] Fetching exchange balances...');
      
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances', {
        body: { userId: session.session.user.id }
      });
      
      if (error) {
        console.warn('[RealtimeSync] Balance sync error (edge function may not exist):', error.message);
        return;
      }
      
      if (data?.balances && Array.isArray(data.balances)) {
        useBotStore.getState().setExchangeBalances(
          data.balances.map((b: { exchange: string; total: number; available: number; inPositions?: number }) => ({
            exchange: b.exchange,
            total: b.total,
            available: b.available,
            inPositions: b.inPositions || 0,
          }))
        );
        console.log('[RealtimeSync] Exchange balances synced:', data.balances.length, 'exchanges');
      }
    } catch (err) {
      console.warn('[RealtimeSync] Exchange balance sync failed:', err);
    }
  }

  /**
   * Full data sync from database
   */
  private async fullSync() {
    if (!this.isRunning) return;
    
    try {
      await useBotStore.getState().syncAllData();
    } catch (error) {
      console.error('[RealtimeSync] Full sync error:', error);
    }
  }

  /**
   * Sync metrics - capital utilization, execution speed, alerts, efficiency
   */
  private syncMetrics() {
    if (!this.isRunning) return;

    const store = useBotStore.getState();
    
    // Recalculate capital utilization
    store.calculateCapitalUtilization();
    
    // Check idle capital alerts
    store.checkIdleCapitalAlert();
    
    // Calculate capital efficiency score
    store.calculateEfficiencyScore();
  }

  /**
   * Clean up stuck trades that are open too long
   */
  private async cleanupStuckTrades() {
    if (!this.isRunning) return;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) return;
      
      // Call edge function to manage open trades
      const { error } = await supabase.functions.invoke('manage-open-trades', {
        body: { 
          userId: session.session.user.id,
          maxAgeHours: 24,
          forceClose: false 
        }
      });
      
      if (error && import.meta.env.DEV) {
        console.log('[RealtimeSync] Manage open trades (may not exist):', error.message);
      }
    } catch (err) {
      // Silent fail - edge function may not exist
    }
  }

  /**
   * Set up Supabase realtime subscriptions
   */
  private setupRealtimeSubscriptions() {
    // Subscribe to bot_runs changes
    supabase
      .channel('bot-store-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_runs',
        },
        (payload) => {
          console.log('[RealtimeSync] Bot run change:', payload.eventType);
          useBotStore.getState().syncBots();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload) => {
          console.log('[RealtimeSync] Trade change:', payload.eventType);
          useBotStore.getState().syncPositions();
        }
      )
      .subscribe();
  }

  /**
   * Check if engine is running
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      metricsInterval: this.metricsIntervalMs,
    };
  }
}

// Export singleton instance
export const syncEngine = new RealtimeSyncEngine();
