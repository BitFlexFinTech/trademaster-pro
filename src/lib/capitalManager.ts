/**
 * Zero-Idle Capital Manager
 * Ensures 100% capital utilization across all connected exchanges
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

class CapitalManager {
  private capitalStatus: Map<string, ExchangeCapital> = new Map();
  private activePositions: Map<string, Position[]> = new Map();
  private isMonitoring: boolean = false;
  private readonly MIN_IDLE_THRESHOLD = 10; // $10 minimum to consider "idle"
  private readonly CHECK_INTERVAL_MS = 500; // Check every 500ms

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
    return Math.max(10, baseSize * confidenceMultiplier); // Min $10
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
            console.log(`⚠️ ${exchange.name}: $${exchange.idle.toFixed(2)} idle - looking for opportunity...`);

            // Find best opportunity
            const opportunity = this.getBestQualifiedOpportunity(exchange.name);

            if (opportunity) {
              console.log(`📈 Found opportunity: ${opportunity.symbol} on ${exchange.name} (${(opportunity.qualification.confidence * 100).toFixed(0)}% confidence)`);
              // Note: Actual execution happens in the trading hook
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

    // Immediately look for next opportunity
    const nextOpportunity = this.getBestQualifiedOpportunity(exchange);
    if (nextOpportunity) {
      console.log(`🔄 Immediate redeployment opportunity: ${nextOpportunity.symbol}`);
      // Actual execution happens in the trading hook
    } else {
      console.log(`⏳ No qualified opportunity yet - capital will be deployed when found`);
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
