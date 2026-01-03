// ============================================
// Trading Execution Engine
// Fast execution loop running every 50ms
// ============================================

import { useBotStore } from '@/stores/botStore';
import { supabase } from '@/integrations/supabase/client';
import type { ScannerOpportunity } from '@/stores/types';

class TradingEngine {
  private executionIntervalMs = 50; // 50ms = 20 trades/second capacity
  private executionIntervalId: NodeJS.Timeout | null = null;
  private scanIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private minIdleFundsForDeployment = 50; // $50 minimum to deploy
  private maxPositions = 5;

  /**
   * Start the trading engine execution loop
   */
  async start() {
    if (this.isRunning) {
      console.log('[TradingEngine] Already running');
      return;
    }

    console.log('[TradingEngine] Starting execution loop');
    this.isRunning = true;
    useBotStore.setState({ isTrading: true });

    // Start the execution loop
    this.executionIntervalId = setInterval(() => {
      this.executeLoop();
    }, this.executionIntervalMs);

    // Start the market scanner loop (200ms)
    this.scanIntervalId = setInterval(() => {
      this.scanMarkets();
    }, 200);
  }

  /**
   * Stop the trading engine
   */
  stop() {
    console.log('[TradingEngine] Stopping execution loop');
    this.isRunning = false;
    useBotStore.setState({ isTrading: false });

    if (this.executionIntervalId) {
      clearInterval(this.executionIntervalId);
      this.executionIntervalId = null;
    }

    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }
  }

  /**
   * Main execution loop - runs every 50ms
   */
  private async executeLoop() {
    if (!this.isRunning) return;

    const state = useBotStore.getState();
    const { capitalMetrics, positions, opportunities, deploymentQueue } = state;

    // Skip if already processing queue
    if (deploymentQueue.some(o => o.status === 'executing')) {
      return;
    }

    // Check if we can deploy idle funds
    if (capitalMetrics.idleFunds >= this.minIdleFundsForDeployment) {
      if (positions.length < this.maxPositions && opportunities.length > 0) {
        await this.deployFundsImmediately(capitalMetrics.idleFunds);
      }
    }

    // Process pending orders in queue
    if (deploymentQueue.length > 0) {
      await state.processQueue();
    }
  }

  /**
   * Deploy idle funds immediately when opportunity is found
   */
  private async deployFundsImmediately(amount: number) {
    const startTime = Date.now();
    const state = useBotStore.getState();
    const opportunity = state.opportunities[0];

    if (!opportunity) {
      console.log('[TradingEngine] No opportunities to deploy funds');
      return;
    }

    console.log('[TradingEngine] Deploying $', amount.toFixed(2), 'to', opportunity.symbol);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        console.error('[TradingEngine] Not authenticated');
        return;
      }

      // Calculate position size (max $333 per trade for $1 profit)
      const positionSize = Math.min(amount, 333);

      // Execute the trade via edge function
      const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
        body: {
          userId: session.session.user.id,
          symbol: opportunity.symbol,
          exchange: opportunity.exchange,
          direction: opportunity.direction,
          amount: positionSize,
          leverage: 1, // Spot trading
          targetProfit: 1.00, // $1 target
        }
      });

      const duration = Date.now() - startTime;

      if (error) {
        console.error('[TradingEngine] Trade execution failed:', error);
        state.recordExecution(`deploy_${Date.now()}`, duration, false);
        return;
      }

      console.log('[TradingEngine] Trade executed in', duration, 'ms');
      state.recordExecution(`deploy_${Date.now()}`, duration, true);

      // Update capital metrics
      state.calculateCapitalUtilization();

      // Remove used opportunity
      state.clearOpportunities();

      // Refresh positions
      await state.syncPositions();

    } catch (error) {
      const duration = Date.now() - startTime;
      state.recordExecution(`deploy_${Date.now()}`, duration, false);
      console.error('[TradingEngine] Deploy error:', error);
    }
  }

  /**
   * Scan markets for opportunities
   */
  private async scanMarkets() {
    if (!this.isRunning) return;

    const state = useBotStore.getState();
    
    // Update scanning status
    state.updateMarketData({ isScanning: true });

    try {
      // Simulate market scanning with top pairs
      const topPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
      
      state.updateMarketData({ 
        pairsScanned: topPairs.length,
        isScanning: true,
      });

      // Generate sample opportunities based on market conditions
      // In production, this would use real market data
      const opportunity = this.findBestOpportunity(topPairs);
      
      if (opportunity) {
        state.addOpportunity(opportunity);
      }

    } catch (error) {
      console.error('[TradingEngine] Market scan error:', error);
    }
  }

  /**
   * Find the best trading opportunity
   */
  private findBestOpportunity(pairs: string[]): ScannerOpportunity | null {
    // This is a simplified implementation
    // In production, this would analyze real market data
    const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
    const confidence = 0.7 + Math.random() * 0.25; // 70-95% confidence
    
    // Only return opportunity if confidence is high enough
    if (confidence < 0.75) return null;

    return {
      symbol: randomPair,
      exchange: 'Binance',
      timeframe: '1m',
      direction: Math.random() > 0.5 ? 'long' : 'short',
      confidence,
      volatility: 0.1 + Math.random() * 0.5,
      expectedDurationMs: 30000 + Math.random() * 60000,
      priority: confidence * 100,
      timestamp: Date.now(),
    };
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      executionInterval: this.executionIntervalMs,
      minIdleFunds: this.minIdleFundsForDeployment,
      maxPositions: this.maxPositions,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<{
    executionIntervalMs: number;
    minIdleFunds: number;
    maxPositions: number;
  }>) {
    if (config.executionIntervalMs) this.executionIntervalMs = config.executionIntervalMs;
    if (config.minIdleFunds) this.minIdleFundsForDeployment = config.minIdleFunds;
    if (config.maxPositions) this.maxPositions = config.maxPositions;
  }
}

// Export singleton instance
export const tradingEngine = new TradingEngine();
