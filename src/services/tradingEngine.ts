// ============================================
// Trading Execution Engine
// Fast execution loop running every 50ms
// Uses AI pair analyzer for real market analysis
// ============================================

import { useBotStore } from '@/stores/botStore';
import { supabase } from '@/integrations/supabase/client';
import { findBestOpportunity, getTopOpportunities } from '@/lib/pairAnalyzer';
import { tradeFlowLogger } from '@/lib/tradeFlowLogger';
import type { ScannerOpportunity } from '@/stores/types';

class TradingEngine {
  private executionIntervalMs = 50; // 50ms = 20 trades/second capacity
  private executionIntervalId: NodeJS.Timeout | null = null;
  private scanIntervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private minIdleFundsForDeployment = 50; // $50 minimum to deploy
  private maxPositions = 5;
  private lastScanLogTime = 0;

  /**
   * Start the trading engine execution loop
   */
  async start() {
    if (this.isRunning) {
      console.log('[TradingEngine] Already running');
      return;
    }

    console.log('[TradingEngine] 🚀 Starting trading engine');
    console.log('[TradingEngine] Execution interval: 50ms, Scan interval: 200ms');
    this.isRunning = true;
    
    // Update store and auto-enable deployment
    const state = useBotStore.getState();
    useBotStore.setState({ 
      isTrading: true,
      autoDeployConfig: { ...state.autoDeployConfig, enabled: true },
      marketData: { ...state.marketData, isScanning: true }
    });
    console.log('[TradingEngine] ✅ Auto-enabled capital deployment');

    // Start the execution loop
    this.executionIntervalId = setInterval(() => {
      this.executeLoop();
    }, this.executionIntervalMs);

    // Start the market scanner loop (200ms)
    this.scanIntervalId = setInterval(() => {
      this.scanMarkets();
    }, 200);
    
    console.log('[TradingEngine] Engine started successfully');
  }

  /**
   * Stop the trading engine
   */
  stop() {
    console.log('[TradingEngine] 🛑 Stopping trading engine');
    this.isRunning = false;
    useBotStore.setState(state => ({ 
      isTrading: false,
      marketData: { ...state.marketData, isScanning: false }
    }));

    if (this.executionIntervalId) {
      clearInterval(this.executionIntervalId);
      this.executionIntervalId = null;
    }

    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }
    
    console.log('[TradingEngine] Engine stopped');
  }

  /**
   * Main execution loop - runs every 50ms
   */
  private async executeLoop() {
    if (!this.isRunning) return;

    const state = useBotStore.getState();
    const { capitalMetrics, positions, opportunities, deploymentQueue, autoDeployConfig } = state;

    // Clear stuck executing items (older than 10 seconds)
    const now = Date.now();
    const stuckItems = deploymentQueue.filter(o => 
      o.status === 'executing' && 
      o.createdAt && 
      (now - o.createdAt) > 10000
    );
    
    if (stuckItems.length > 0) {
      console.warn('[TradingEngine] ⚠️ Clearing', stuckItems.length, 'stuck executions');
      useBotStore.setState(s => ({
        deploymentQueue: s.deploymentQueue.filter(o => 
          !stuckItems.some(stuck => stuck.id === o.id)
        )
      }));
    }

    // Skip if already processing queue (that aren't stuck)
    const hasExecutingItems = deploymentQueue.some(o => 
      o.status === 'executing' && 
      o.createdAt && 
      (now - o.createdAt) <= 10000
    );
    if (hasExecutingItems) return;

    // Use auto-deploy config if enabled, otherwise use defaults
    const minIdleFunds = autoDeployConfig?.enabled 
      ? autoDeployConfig.minIdleFunds 
      : this.minIdleFundsForDeployment;
    const maxPos = autoDeployConfig?.enabled 
      ? autoDeployConfig.maxPositions 
      : this.maxPositions;
    const minConfidence = autoDeployConfig?.enabled 
      ? autoDeployConfig.minConfidence 
      : 0.75;

    // Check if auto-deploy is enabled
    if (!autoDeployConfig?.enabled) {
      return;
    }

    // Check if we can deploy idle funds
    if (capitalMetrics.idleFunds >= minIdleFunds) {
      // Filter opportunities by confidence
      const qualifiedOpps = opportunities.filter(o => o.confidence >= minConfidence);
      
      if (positions.length < maxPos && qualifiedOpps.length > 0) {
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

    // Start flow logging
    const tradeId = `trade_${Date.now()}`;
    tradeFlowLogger.startFlow(tradeId);
    tradeFlowLogger.log('ANALYZE', {
      symbol: opportunity.symbol,
      direction: opportunity.direction,
      confidence: opportunity.confidence.toFixed(2),
      exchange: opportunity.exchange,
      volatility: opportunity.volatility?.toFixed(4) || 'N/A',
    });

    console.log('[TradingEngine] ⚡ Deploying $', amount.toFixed(2), 'to', opportunity.symbol, 
      'direction:', opportunity.direction, 'confidence:', opportunity.confidence.toFixed(2));

    // Mark as executing
    const queueId = `deploy_${Date.now()}`;
    useBotStore.getState().addToQueue({
      id: queueId,
      symbol: opportunity.symbol,
      exchange: opportunity.exchange,
      side: opportunity.direction === 'long' ? 'buy' : 'sell',
      type: 'market',
      amount,
      status: 'executing',
      createdAt: startTime
    });

    tradeFlowLogger.log('EXECUTE', {
      queueId,
      amount: amount.toFixed(2),
      positionSize: `$${amount.toFixed(2)}`
    });

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user?.id) {
        tradeFlowLogger.log('ERROR', { reason: 'No active session' });
        console.error('[TradingEngine] ❌ Not authenticated');
        return;
      }

      // FIXED: Calculate position size dynamically based on target profit and expected move
      // Read from bot config if available, else use dynamic calculation
      const activeBots = state.bots.filter(b => b.status === 'running');
      const botAmountPerTrade = activeBots[0]?.amountPerTrade || 100; // Use 100 as default, not 333
      const positionSize = Math.min(amount, botAmountPerTrade);

      // Execute the trade via edge function
      const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
        body: {
          userId: session.session.user.id,
          symbol: opportunity.symbol,
          exchange: opportunity.exchange,
          direction: opportunity.direction,
          amount: positionSize,
          leverage: 1,
          targetProfit: 1.00,
        }
      });

      const duration = Date.now() - startTime;

      if (error) {
        tradeFlowLogger.log('ERROR', { 
          error: error.message,
          executionTime: `${duration}ms`
        });
        console.error('[TradingEngine] ❌ Trade execution failed:', error);
        state.recordExecution(queueId, duration, false);
      } else {
        tradeFlowLogger.log('COMPLETE', { 
          success: true,
          executionTime: `${duration}ms`,
          response: data
        });
        console.log('[TradingEngine] ✅ Trade executed in', duration, 'ms');
        state.recordExecution(queueId, duration, true);

        // Update capital metrics
        state.calculateCapitalUtilization();

        // Remove used opportunity
        state.clearOpportunities();

        // Refresh positions
        await state.syncPositions();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      tradeFlowLogger.log('ERROR', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: `${duration}ms`
      });
      console.error('[TradingEngine] ❌ Deploy error:', error);
      state.recordExecution(queueId, duration, false);
    } finally {
      // Clear the queue item
      useBotStore.setState(s => ({
        deploymentQueue: s.deploymentQueue.filter(o => o.id !== queueId)
      }));
    }
  }

  /**
   * Scan markets for opportunities using AI pair analyzer
   */
  private async scanMarkets() {
    if (!this.isRunning) return;

    const state = useBotStore.getState();
    const { marketData, autoDeployConfig } = state;
    
    // Ensure scanning status is set
    if (!marketData.isScanning) {
      useBotStore.setState(s => ({
        marketData: { ...s.marketData, isScanning: true }
      }));
    }

    try {
      const { prices, changes24h, volumes } = marketData;
      
      // Skip if no market data from WebSocket
      if (Object.keys(prices).length === 0) {
        // Fallback to basic pairs for initial scanning
        const fallbackPairs = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
        useBotStore.setState(s => ({ 
          marketData: {
            ...s.marketData,
            pairsScanned: fallbackPairs.length,
            isScanning: true,
          }
        }));
        return;
      }

      // Use preferred exchange from config (multi-exchange support)
      const preferredExchange = autoDeployConfig.preferredExchanges[0] || 'Binance';

      // Use AI pair analyzer for real analysis
      const topOpportunities = getTopOpportunities(
        prices,
        changes24h,
        volumes,
        5, // Get top 5 opportunities
        autoDeployConfig.excludePairs,
        preferredExchange
      );

      // Log scan results periodically (every 5 seconds)
      const now = Date.now();
      if (now - this.lastScanLogTime > 5000 && topOpportunities.length > 0) {
        this.lastScanLogTime = now;
        console.log('[TradingEngine] 🔍 Market scan:', {
          pairsScanned: Object.keys(prices).length,
          opportunitiesFound: topOpportunities.length,
          topPair: topOpportunities[0]?.symbol || 'none',
          topConfidence: topOpportunities[0]?.confidence?.toFixed(2) || 0,
        });
      }

      useBotStore.setState(s => ({ 
        marketData: {
          ...s.marketData,
          pairsScanned: Object.keys(prices).length,
          isScanning: true,
        }
      }));

      // Add opportunities to store
      topOpportunities.forEach(opp => {
        state.addOpportunity(opp);
      });

    } catch (error) {
      console.error('[TradingEngine] ❌ Market scan error:', error);
    }
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

// ===== Auto-Start Subscription =====
// Watch bot status and auto-start/stop trading engine
let autoStartSubscribed = false;

if (!autoStartSubscribed) {
  autoStartSubscribed = true;
  
  useBotStore.subscribe(
    state => state.bots,
    (bots) => {
      const hasRunningBot = bots.some(b => b.status === 'running');
      const { isTrading } = useBotStore.getState();
      
      if (hasRunningBot && !isTrading) {
        console.log('[TradingEngine] 🚀 Auto-starting: bot is running');
        tradingEngine.start();
      } else if (!hasRunningBot && isTrading) {
        console.log('[TradingEngine] 🛑 Auto-stopping: no bots running');
        tradingEngine.stop();
      }
    }
  );
}
