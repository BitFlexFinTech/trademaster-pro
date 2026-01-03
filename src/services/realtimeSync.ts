// ============================================
// Real-Time Sync Engine
// Syncs data from Supabase every 100ms
// ============================================

import { useBotStore } from '@/stores/botStore';
import { supabase } from '@/integrations/supabase/client';

class RealtimeSyncEngine {
  private syncIntervalId: NodeJS.Timeout | null = null;
  private metricsIntervalId: NodeJS.Timeout | null = null;
  private marketIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private syncIntervalMs = 100; // 100ms for real-time feel
  private marketSyncIntervalMs = 200; // 200ms for market data

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

    // Sync metrics every 100ms (positions, capital)
    this.metricsIntervalId = setInterval(() => {
      this.syncMetrics();
    }, this.syncIntervalMs);

    // Sync market data every 200ms
    this.marketIntervalId = setInterval(() => {
      this.syncMarketData();
    }, this.marketSyncIntervalMs);

    // Full data sync every 5 seconds
    this.syncIntervalId = setInterval(() => {
      this.fullSync();
    }, 5000);

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

    if (this.marketIntervalId) {
      clearInterval(this.marketIntervalId);
      this.marketIntervalId = null;
    }
  }

  /**
   * Initial data sync on startup
   */
  private async initialSync() {
    console.log('[RealtimeSync] Running initial sync');
    try {
      await useBotStore.getState().syncAllData();
    } catch (error) {
      console.error('[RealtimeSync] Initial sync failed:', error);
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
   * Sync metrics - capital utilization, execution speed
   */
  private syncMetrics() {
    if (!this.isRunning) return;

    const store = useBotStore.getState();
    
    // Recalculate capital utilization
    store.calculateCapitalUtilization();
  }

  /**
   * Sync market data - prices, volumes
   */
  private async syncMarketData() {
    if (!this.isRunning) return;

    const store = useBotStore.getState();
    const positions = store.positions;

    if (positions.length === 0) return;

    // Update position prices from market data
    // This would typically come from a WebSocket connection
    // For now, we'll just mark the scan as active
    store.updateMarketData({
      isScanning: true,
      pairsScanned: positions.length,
    });
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
      syncInterval: this.syncIntervalMs,
      marketSyncInterval: this.marketSyncIntervalMs,
    };
  }
}

// Export singleton instance
export const syncEngine = new RealtimeSyncEngine();
