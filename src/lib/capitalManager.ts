/**
 * Zero-Idle Capital Manager
 * Ensures 100% capital utilization across all connected exchanges
 * NOW WITH AUTO-EXECUTION: Deploys idle capital automatically when opportunities are found
 */

import { supabase } from '@/integrations/supabase/client';
import { continuousMarketScanner, type ScanOpportunity } from './continuousMarketScanner';

export interface ExchangeCapital {
  name: string;
  total: number;
  deployed: number;
  idle: number;
  utilizationPercent: number;
  positionCount: number;
  lastUpdated: number;
}

export interface Position {
  id: string;
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  entryPrice: number;
  entryValue: number;
  entryTime: number;
  profitTarget: number;
  expectedDuration: number;
  confidence: number;
}

export interface AutoDeployConfig {
  enabled: boolean;
  botId: string;
  mode: 'spot' | 'leverage';
  leverages: Record<string, number>;
  profitTarget: number;
  maxPositionSize: number;
}

class CapitalManager {
  private capitalStatus: Map<string, ExchangeCapital> = new Map();
  private activePositions: Map<string, Position[]> = new Map();
  private isMonitoring: boolean = false;
  private autoDeployConfig: AutoDeployConfig | null = null;
  private lastDeployAttempt: number = 0;
  private readonly MIN_IDLE_THRESHOLD = 50; // $50 minimum to deploy
  private readonly CHECK_INTERVAL_MS = 2000; // Check every 2s
  private readonly DEPLOY_COOLDOWN_MS = 5000; // 5s between deploy attempts

  /**
   * Configure auto-deployment of idle capital
   */
  setAutoDeployConfig(config: AutoDeployConfig | null): void {
    this.autoDeployConfig = config;
    if (config?.enabled) {
      console.log('🚀 Auto-deploy enabled:', config);
    } else {
      console.log('🛑 Auto-deploy disabled');
    }
  }

  /**
   * Start capital monitoring
   */
  start(onCapitalUpdate?: (status: ExchangeCapital[]) => void): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    console.log('💰 Starting zero-idle capital monitor...');

    this.monitorLoop(onCapitalUpdate);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;
    this.autoDeployConfig = null;
    console.log('🛑 Capital manager stopped');
  }

  /**
   * Update exchange balance
   */
  updateBalance(exchange: string, balance: number): void {
    const current = this.capitalStatus.get(exchange) || {
      name: exchange,
      total: 0,
      deployed: 0,
      idle: 0,
      utilizationPercent: 0,
      positionCount: 0,
      lastUpdated: 0,
    };

    const positions = this.activePositions.get(exchange) || [];
    const deployed = positions.reduce((sum, p) => sum + p.entryValue, 0);
    const idle = Math.max(0, balance - deployed);

    this.capitalStatus.set(exchange, {
      ...current,
      total: balance,
      deployed,
      idle,
      utilizationPercent: balance > 0 ? (deployed / balance) * 100 : 0,
      positionCount: positions.length,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Sync open trades from database to capital manager
   */
  async syncOpenTrades(userId: string): Promise<void> {
    try {
      const { data: openTrades, error } = await supabase
        .from('trades')
        .select('id, pair, exchange_name, entry_price, amount, direction, created_at, leverage')
        .eq('user_id', userId)
        .eq('status', 'open');

      if (error) {
        console.warn('Failed to sync open trades:', error);
        return;
      }

      if (!openTrades || openTrades.length === 0) {
        console.log('📊 No open trades to sync');
        return;
      }

      console.log(`📊 Syncing ${openTrades.length} open trades to capital manager`);

      // Group by exchange and track positions
      for (const trade of openTrades) {
        const exchange = trade.exchange_name || 'Binance';
        const position: Position = {
          id: trade.id,
          symbol: trade.pair,
          exchange,
          side: (trade.direction as 'long' | 'short') || 'long',
          entryPrice: trade.entry_price,
          entryValue: trade.amount,
          entryTime: new Date(trade.created_at).getTime(),
          profitTarget: 1.00,
          expectedDuration: 300,
          confidence: 0.8,
        };

        // Add to active positions if not already tracked
        const existing = this.getPositions(exchange, trade.pair);
        if (!existing.find(p => p.id === trade.id)) {
          this.trackPosition(exchange, position);
        }
      }

      // Recalculate capital status for all exchanges
      for (const [exchange, capital] of this.capitalStatus.entries()) {
        this.updateBalance(exchange, capital.total);
      }

      console.log('✅ Capital manager synced with open trades');
    } catch (e) {
      console.warn('Failed to sync open trades:', e);
    }
  }

  /**
   * Track new position
   */
  trackPosition(exchange: string, position: Position): void {
    const positions = this.activePositions.get(exchange) || [];
    positions.push(position);
    this.activePositions.set(exchange, positions);

    // Update capital status
    const current = this.capitalStatus.get(exchange);
    if (current) {
      current.deployed += position.entryValue;
      current.idle = Math.max(0, current.total - current.deployed);
      current.positionCount = positions.length;
      current.utilizationPercent = current.total > 0 ? (current.deployed / current.total) * 100 : 0;
    }
    
    console.log(`📈 Tracked position: ${position.symbol} on ${exchange} ($${position.entryValue.toFixed(2)})`);
  }

  /**
   * Remove closed position
   */
  removePosition(exchange: string, positionId: string): Position | null {
    const positions = this.activePositions.get(exchange) || [];
    const index = positions.findIndex(p => p.id === positionId);
    
    if (index === -1) return null;

    const [removed] = positions.splice(index, 1);
    this.activePositions.set(exchange, positions);

    // Update capital status
    const current = this.capitalStatus.get(exchange);
    if (current) {
      current.deployed = Math.max(0, current.deployed - removed.entryValue);
      current.idle = current.total - current.deployed;
      current.positionCount = positions.length;
      current.utilizationPercent = current.total > 0 ? (current.deployed / current.total) * 100 : 0;
    }

    console.log(`📉 Removed position: ${removed.symbol} on ${exchange}`);
    return removed;
  }

  /**
   * Get positions for exchange and symbol
   */
  getPositions(exchange: string, symbol?: string): Position[] {
    const positions = this.activePositions.get(exchange) || [];
    if (symbol) {
      return positions.filter(p => p.symbol === symbol);
    }
    return positions;
  }

  /**
   * Get all capital status
   */
  getCapitalStatus(): ExchangeCapital[] {
    return Array.from(this.capitalStatus.values());
  }

  /**
   * Get total idle capital across all exchanges
   */
  getTotalIdleCapital(): number {
    return Array.from(this.capitalStatus.values())
      .reduce((sum, ex) => sum + ex.idle, 0);
  }

  /**
   * Get best opportunity for an exchange with idle capital
   */
  getBestQualifiedOpportunity(exchange: string): ScanOpportunity | null {
    const opportunities = continuousMarketScanner.getAllOpportunities();
    
    // Filter for this exchange and sort by confidence
    const available = opportunities
      .filter(opp => 
        opp.exchange === exchange &&
        (opp.qualification.expectedDuration || 300) < 300 &&
        opp.qualification.confidence > 0.7
      )
      .sort((a, b) => b.qualification.confidence - a.qualification.confidence);

    return available[0] || null;
  }

  /**
   * Calculate optimal position size
   */
  calculatePositionSize(
    availableCapital: number,
    opportunity: ScanOpportunity
  ): number {
    // Use confidence to scale position size
    // Higher confidence = larger position
    const confidenceMultiplier = 0.5 + (opportunity.qualification.confidence * 0.5);
    const baseSize = Math.min(availableCapital * 0.8, 500); // Max $500 per trade
    return Math.max(50, baseSize * confidenceMultiplier); // Min $50
  }

  /**
   * Execute a trade to deploy idle capital
   */
  async executeOpportunity(
    exchange: string,
    opportunity: ScanOpportunity,
    positionSize: number
  ): Promise<boolean> {
    if (!this.autoDeployConfig?.enabled || !this.autoDeployConfig.botId) {
      console.log('⚠️ Auto-deploy not configured');
      return false;
    }

    // Cooldown check
    if (Date.now() - this.lastDeployAttempt < this.DEPLOY_COOLDOWN_MS) {
      return false;
    }
    this.lastDeployAttempt = Date.now();

    try {
      console.log(`🚀 Auto-deploying $${positionSize.toFixed(2)} to ${opportunity.symbol} on ${exchange}`);

      const { data, error } = await supabase.functions.invoke('execute-bot-trade', {
        body: {
          botId: this.autoDeployConfig.botId,
          mode: this.autoDeployConfig.mode,
          profitTarget: this.autoDeployConfig.profitTarget,
          exchanges: [exchange],
          leverages: this.autoDeployConfig.leverages,
          isSandbox: false,
          maxPositionSize: positionSize,
          stopLossPercent: 0,
          forcePair: opportunity.symbol, // Force specific pair
          forceDirection: opportunity.signal.direction, // Force direction from signal
        }
      });

      if (error) {
        console.error('❌ Auto-deploy failed:', error);
        return false;
      }

      if (data?.success && data?.tradeId) {
        // Track the new position
        const position: Position = {
          id: data.tradeId,
          symbol: opportunity.symbol,
          exchange,
          side: opportunity.signal.direction as 'long' | 'short',
          entryPrice: data.entryPrice || opportunity.signal.entryPrice,
          entryValue: positionSize,
          entryTime: Date.now(),
          profitTarget: this.autoDeployConfig.profitTarget,
          expectedDuration: opportunity.qualification.expectedDuration || 300,
          confidence: opportunity.qualification.confidence,
        };

        this.trackPosition(exchange, position);
        console.log(`✅ Auto-deployed: ${opportunity.symbol} on ${exchange}`);
        return true;
      }

      return false;
    } catch (e) {
      console.error('Auto-deploy error:', e);
      return false;
    }
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop(
    onCapitalUpdate?: (status: ExchangeCapital[]) => void
  ): Promise<void> {
    while (this.isMonitoring) {
      try {
        const status = this.getCapitalStatus();

        // Check each exchange for idle capital
        for (const exchange of status) {
          if (exchange.idle > this.MIN_IDLE_THRESHOLD) {
            // Find best opportunity
            const opportunity = this.getBestQualifiedOpportunity(exchange.name);

            if (opportunity && this.autoDeployConfig?.enabled) {
              const positionSize = this.calculatePositionSize(exchange.idle, opportunity);
              
              console.log(`💰 ${exchange.name}: $${exchange.idle.toFixed(2)} idle → deploying $${positionSize.toFixed(2)} to ${opportunity.symbol}`);
              
              // Execute the trade
              await this.executeOpportunity(exchange.name, opportunity, positionSize);
            } else if (exchange.idle > this.MIN_IDLE_THRESHOLD) {
              // Just log if auto-deploy disabled
              console.log(`⚠️ ${exchange.name}: $${exchange.idle.toFixed(2)} idle - waiting for opportunity`);
            }
          }
        }

        // Notify callback
        if (onCapitalUpdate) {
          onCapitalUpdate(status);
        }

        await this.sleep(this.CHECK_INTERVAL_MS);
      } catch (error) {
        console.error('Capital monitor error:', error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * Handle position exit - trigger redeployment
   */
  async onPositionExit(
    exchange: string,
    positionId: string,
    exitPrice: number,
    profit: number
  ): Promise<void> {
    const position = this.removePosition(exchange, positionId);
    if (!position) return;

    const freedCapital = position.entryValue + profit;
    const duration = (Date.now() - position.entryTime) / 1000;

    console.log(`✅ EXIT: ${position.symbol} | Profit: $${profit.toFixed(2)} | Duration: ${duration.toFixed(0)}s`);
    console.log(`💰 Capital freed on ${exchange}: $${freedCapital.toFixed(2)}`);

    // Record trade for learning
    await this.recordTradeForLearning(position, exitPrice, profit, duration);

    // Immediately look for next opportunity if auto-deploy enabled
    if (this.autoDeployConfig?.enabled) {
      const nextOpportunity = this.getBestQualifiedOpportunity(exchange);
      if (nextOpportunity) {
        console.log(`🔄 Immediate redeployment: ${nextOpportunity.symbol}`);
        const positionSize = this.calculatePositionSize(freedCapital, nextOpportunity);
        await this.executeOpportunity(exchange, nextOpportunity, positionSize);
      } else {
        console.log(`⏳ No qualified opportunity - capital will be deployed when found`);
      }
    }
  }

  /**
   * Record trade for speed learning
   */
  private async recordTradeForLearning(
    position: Position,
    exitPrice: number,
    profit: number,
    durationSeconds: number
  ): Promise<void> {
    try {
      // Update speed analytics
      const { data: existing } = await supabase
        .from('trade_speed_analytics')
        .select('*')
        .eq('symbol', position.symbol)
        .eq('timeframe', '1m') // Default timeframe
        .maybeSingle();

      if (existing) {
        // Update running average
        const newSampleSize = (existing.sample_size || 0) + 1;
        const newAvgDuration = Math.round(
          ((existing.avg_duration_seconds || 0) * (existing.sample_size || 0) + durationSeconds) / newSampleSize
        );

        await supabase
          .from('trade_speed_analytics')
          .update({
            avg_duration_seconds: newAvgDuration,
            sample_size: newSampleSize,
            last_updated: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } catch (e) {
      console.warn('Failed to record trade for learning:', e);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const capitalManager = new CapitalManager();
