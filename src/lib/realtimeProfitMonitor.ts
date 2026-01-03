/**
 * Real-Time Profit Monitor
 * Instant profit target detection via WebSocket prices
 */

import { capitalManager, type Position } from './capitalManager';

type ProfitHitCallback = (
  exchange: string,
  position: Position,
  exitPrice: number,
  profitPercent: number
) => void;

class RealtimeProfitMonitor {
  private callbacks: ProfitHitCallback[] = [];
  private isMonitoring: boolean = false;

  /**
   * Register callback for profit target hits
   */
  onProfitTargetHit(callback: ProfitHitCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Start monitoring with price stream
   */
  start(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    console.log('📊 Real-time profit monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;
    console.log('🛑 Real-time profit monitor stopped');
  }

  /**
   * Process price update - check all positions for profit targets
   * Called from WebSocket price stream
   */
  onPriceUpdate(symbol: string, currentPrice: number): void {
    if (!this.isMonitoring) return;

    // Get all exchanges
    const capitalStatus = capitalManager.getCapitalStatus();

    for (const exchange of capitalStatus) {
      const positions = capitalManager.getPositions(exchange.name, symbol);

      for (const position of positions) {
        const profitPercent = this.calculateProfitPercent(position, currentPrice);

        // Check if profit target hit
        if (profitPercent >= position.profitTarget) {
          this.triggerProfitHit(exchange.name, position, currentPrice, profitPercent);
        }
      }
    }
  }

  /**
   * Batch update multiple symbols at once
   */
  onPriceUpdates(prices: Record<string, number>): void {
    if (!this.isMonitoring) return;

    for (const [symbol, price] of Object.entries(prices)) {
      this.onPriceUpdate(symbol, price);
    }
  }

  /**
   * Calculate profit percentage for a position
   */
  private calculateProfitPercent(position: Position, currentPrice: number): number {
    if (position.side === 'long') {
      return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      return ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
    }
  }

  /**
   * Trigger profit hit callbacks
   */
  private triggerProfitHit(
    exchange: string,
    position: Position,
    exitPrice: number,
    profitPercent: number
  ): void {
    console.log(`🎯 PROFIT TARGET HIT: ${position.symbol} on ${exchange}`);
    console.log(`   Entry: $${position.entryPrice.toFixed(4)} → Exit: $${exitPrice.toFixed(4)}`);
    console.log(`   Profit: ${profitPercent.toFixed(2)}%`);

    // Notify all callbacks
    this.callbacks.forEach(cb => {
      try {
        cb(exchange, position, exitPrice, profitPercent);
      } catch (e) {
        console.error('Profit hit callback error:', e);
      }
    });
  }

  /**
   * Get monitoring status
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

export const realtimeProfitMonitor = new RealtimeProfitMonitor();
