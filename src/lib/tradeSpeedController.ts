/**
 * Trade Speed Controller
 * 
 * Per specification:
 * - Hit rate < 95%: 120 seconds cooldown (slow)
 * - Hit rate 95-98%: 60 seconds cooldown (normal)
 * - Hit rate > 98%: 15 seconds cooldown (fast)
 * - Minimum 10 trades before adjusting
 * - Rolling window: last 50 trades or 24 hours
 */

export interface TradeRecord {
  timestamp: number;
  isWin: boolean;
  netProfit: number;
  direction: 'long' | 'short';
  pair: string;
  exchange: string;
  entryPrice: number;
  exitPrice: number;
  fees: number;
  slippage: number;
  reasonCode: string;
}

export type SpeedMode = 'slow' | 'normal' | 'fast';

export interface SpeedStats {
  totalTrades: number;
  hitRate: number;
  cooldownMs: number;
  speedMode: SpeedMode;
  lastAdjustment: number;
  rollingWindowTrades: number;
}

export interface SpeedModeChange {
  timestamp: number;
  fromMode: SpeedMode;
  toMode: SpeedMode;
  hitRate: number;
  reason: string;
}

const SLOW_COOLDOWN = 120000;    // 120 seconds
const NORMAL_COOLDOWN = 60000;   // 60 seconds
const FAST_COOLDOWN = 15000;     // 15 seconds
const MIN_TRADES_FOR_ADJUSTMENT = 10;
const ROLLING_WINDOW_SIZE = 50;
const ROLLING_WINDOW_TIME = 24 * 60 * 60 * 1000; // 24 hours

class TradeSpeedController {
  private trades: TradeRecord[] = [];
  private currentCooldownMs: number = NORMAL_COOLDOWN;
  private currentSpeedMode: SpeedMode = 'normal';
  private speedModeHistory: SpeedModeChange[] = [];
  private lastAdjustmentTime: number = 0;

  /**
   * Record a completed trade
   */
  recordTrade(trade: Omit<TradeRecord, 'timestamp'>): void {
    const record: TradeRecord = {
      ...trade,
      timestamp: Date.now(),
    };
    
    this.trades.push(record);
    this.pruneOldTrades();
    this.adjustSpeed();
  }

  /**
   * Simple trade recording (backward compatible)
   */
  recordSimpleTrade(isWin: boolean, netProfit: number, exchange: string = 'unknown', pair: string = 'unknown'): void {
    this.recordTrade({
      isWin,
      netProfit,
      direction: 'long',
      pair,
      exchange,
      entryPrice: 0,
      exitPrice: 0,
      fees: 0,
      slippage: 0,
      reasonCode: isWin ? 'PROFIT_TARGET_HIT' : 'STOP_LOSS_HIT',
    });
  }

  /**
   * Remove trades outside rolling window
   */
  private pruneOldTrades(): void {
    const cutoff = Date.now() - ROLLING_WINDOW_TIME;
    this.trades = this.trades.filter(t => t.timestamp > cutoff);
    
    // Keep max ROLLING_WINDOW_SIZE most recent
    if (this.trades.length > ROLLING_WINDOW_SIZE) {
      this.trades = this.trades.slice(-ROLLING_WINDOW_SIZE);
    }
  }

  /**
   * Adjust speed based on rolling window hit rate
   */
  private adjustSpeed(): void {
    // Minimum sample requirement
    if (this.trades.length < MIN_TRADES_FOR_ADJUSTMENT) {
      return;
    }

    const hitRate = this.calculateHitRate();
    const previousMode = this.currentSpeedMode;
    let newMode: SpeedMode;
    let newCooldown: number;

    if (hitRate < 95) {
      newMode = 'slow';
      newCooldown = SLOW_COOLDOWN;
    } else if (hitRate >= 95 && hitRate <= 98) {
      newMode = 'normal';
      newCooldown = NORMAL_COOLDOWN;
    } else {
      newMode = 'fast';
      newCooldown = FAST_COOLDOWN;
    }

    // Record mode change if different
    if (newMode !== previousMode) {
      this.speedModeHistory.push({
        timestamp: Date.now(),
        fromMode: previousMode,
        toMode: newMode,
        hitRate,
        reason: `Hit rate ${hitRate.toFixed(1)}% triggered ${newMode} mode`,
      });
      this.lastAdjustmentTime = Date.now();
    }

    this.currentSpeedMode = newMode;
    this.currentCooldownMs = newCooldown;
  }

  /**
   * Calculate hit rate from rolling window
   */
  private calculateHitRate(): number {
    if (this.trades.length === 0) return 0;
    const wins = this.trades.filter(t => t.isWin).length;
    return (wins / this.trades.length) * 100;
  }

  /**
   * Check if enough time has passed since last trade
   */
  canTrade(): boolean {
    if (this.trades.length === 0) return true;
    const lastTradeTime = this.trades[this.trades.length - 1].timestamp;
    return Date.now() - lastTradeTime >= this.currentCooldownMs;
  }

  /**
   * Get time until next trade allowed (ms)
   */
  getTimeUntilNextTrade(): number {
    if (this.trades.length === 0) return 0;
    const lastTradeTime = this.trades[this.trades.length - 1].timestamp;
    const elapsed = Date.now() - lastTradeTime;
    return Math.max(0, this.currentCooldownMs - elapsed);
  }

  /**
   * Get current cooldown in milliseconds
   */
  getCooldownMs(): number {
    return this.currentCooldownMs;
  }

  /**
   * Get current hit rate
   */
  getHitRate(): number {
    return this.calculateHitRate();
  }

  /**
   * Get current speed mode
   */
  getSpeedMode(): SpeedMode {
    return this.currentSpeedMode;
  }

  /**
   * Get complete stats
   */
  getStats(): SpeedStats {
    return {
      totalTrades: this.trades.length,
      hitRate: this.calculateHitRate(),
      cooldownMs: this.currentCooldownMs,
      speedMode: this.currentSpeedMode,
      lastAdjustment: this.lastAdjustmentTime,
      rollingWindowTrades: this.trades.length,
    };
  }

  /**
   * Get speed mode history for dashboards
   */
  getSpeedModeHistory(): SpeedModeChange[] {
    return [...this.speedModeHistory];
  }

  /**
   * Get all trades for audit
   */
  getAllTrades(): TradeRecord[] {
    return [...this.trades];
  }

  /**
   * Get trade distribution (long vs short)
   */
  getTradeDistribution(): { long: number; short: number; longWins: number; shortWins: number } {
    const longs = this.trades.filter(t => t.direction === 'long');
    const shorts = this.trades.filter(t => t.direction === 'short');
    
    return {
      long: longs.length,
      short: shorts.length,
      longWins: longs.filter(t => t.isWin).length,
      shortWins: shorts.filter(t => t.isWin).length,
    };
  }

  /**
   * Get average net profit per trade
   */
  getAverageNetProfit(): number {
    if (this.trades.length === 0) return 0;
    const totalProfit = this.trades.reduce((sum, t) => sum + t.netProfit, 0);
    return totalProfit / this.trades.length;
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.trades = [];
    this.currentCooldownMs = NORMAL_COOLDOWN;
    this.currentSpeedMode = 'normal';
    this.speedModeHistory = [];
    this.lastAdjustmentTime = 0;
  }
}

// Singleton instance
export const tradeSpeedController = new TradeSpeedController();

// Export class for testing
export { TradeSpeedController };
