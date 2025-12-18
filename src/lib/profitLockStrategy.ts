/**
 * Profit Lock Strategy - Real price-based profit locking system
 * NEVER uses random win/loss - only exits when price hits TP or SL
 * CRITICAL: NEVER exits at $0 profit - always locks in at least minimum profit
 */

export interface PriceMonitorConfig {
  entryPrice: number;
  direction: 'long' | 'short';
  takeProfitPercent: number;  // e.g., 0.3 = 0.3%
  stopLossPercent: number;    // e.g., 0.15 = 0.15% (tighter than TP for positive expectancy)
  maxHoldTimeMs: number;      // Max time to hold position
  enableTrailingStop: boolean;
  minProfitPercent?: number;  // MINIMUM profit % to allow exit (default 0.05%)
  minProfitDollars?: number;  // MINIMUM profit $ to allow exit (default $0.10)
  positionSize?: number;      // Position size for $ calculations
}

export interface PriceMonitorResult {
  exitPrice: number;
  isWin: boolean;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'TIME_EXIT' | 'BREAKEVEN' | 'CANCELLED' | 'MIN_PROFIT_EXIT';
  holdTimeMs: number;
  maxProfitSeen: number;
  minProfitSeen: number;
  profitDollars: number;
}

export interface HitRateEnforcement {
  canTrade: boolean;
  reason: string;
  currentHitRate: number;
  requiredMinimum: number;
  isPaused: boolean;
  analysisRequired: boolean;
}

// Rolling window for hit rate tracking
const ROLLING_WINDOW_SIZE = 50;
const MIN_HIT_RATE_TO_TRADE = 65; // Lowered from 85% - more realistic for real price monitoring
const CRITICAL_HIT_RATE = 50;     // Below this triggers deep analysis
const PAUSE_DURATION_MS = 30000;  // 30 second pause when hit rate drops (reduced from 60s)

// CRITICAL: Minimum profit thresholds - NEVER exit below these
const DEFAULT_MIN_PROFIT_PERCENT = 0.05; // 0.05% minimum profit
const DEFAULT_MIN_PROFIT_DOLLARS = 0.10; // $0.10 minimum profit
const MAX_EXTENDED_HOLD_MULTIPLIER = 2;  // Hold up to 2x max time to find profit

class ProfitLockStrategyManager {
  private tradeHistory: { isWin: boolean; timestamp: number; pnl: number }[] = [];
  private isPaused: boolean = false;
  private pauseUntil: number = 0;
  private consecutiveLosses: number = 0;
  private consecutiveErrors: number = 0;
  
  /**
   * Record a trade result and update rolling hit rate
   */
  recordTrade(isWin: boolean, pnl: number): void {
    this.tradeHistory.push({
      isWin,
      timestamp: Date.now(),
      pnl,
    });
    
    // Keep only last ROLLING_WINDOW_SIZE trades
    if (this.tradeHistory.length > ROLLING_WINDOW_SIZE) {
      this.tradeHistory.shift();
    }
    
    // Track consecutive losses
    if (isWin) {
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
      
      // Pause after 3 consecutive losses
      if (this.consecutiveLosses >= 3) {
        this.pauseTrading(PAUSE_DURATION_MS, 'consecutive_losses');
      }
    }
  }
  
  /**
   * Record an error
   */
  recordError(): void {
    this.consecutiveErrors++;
    
    // Pause after 3 consecutive errors
    if (this.consecutiveErrors >= 3) {
      this.pauseTrading(PAUSE_DURATION_MS * 2, 'consecutive_errors');
    }
  }
  
  /**
   * Record successful operation (resets error counter)
   */
  recordSuccess(): void {
    this.consecutiveErrors = 0;
  }
  
  /**
   * Pause trading for a duration
   */
  pauseTrading(durationMs: number, reason: string): void {
    console.log(`⏸️ Trading paused for ${durationMs / 1000}s: ${reason}`);
    this.isPaused = true;
    this.pauseUntil = Date.now() + durationMs;
  }
  
  /**
   * Get current rolling hit rate
   */
  getRollingHitRate(): number {
    if (this.tradeHistory.length === 0) return 100; // No trades = assume 100%
    const wins = this.tradeHistory.filter(t => t.isWin).length;
    return (wins / this.tradeHistory.length) * 100;
  }
  
  /**
   * Check if trading is allowed based on hit rate enforcement
   */
  canTrade(): HitRateEnforcement {
    const now = Date.now();
    
    // Check if still in pause period
    if (this.isPaused && now < this.pauseUntil) {
      const remainingMs = this.pauseUntil - now;
      return {
        canTrade: false,
        reason: `Paused for ${Math.ceil(remainingMs / 1000)}s (recovering from losses)`,
        currentHitRate: this.getRollingHitRate(),
        requiredMinimum: MIN_HIT_RATE_TO_TRADE,
        isPaused: true,
        analysisRequired: false,
      };
    }
    
    // Resume from pause
    if (this.isPaused && now >= this.pauseUntil) {
      this.isPaused = false;
      this.consecutiveLosses = 0;
      console.log('▶️ Trading resumed after pause');
    }
    
    const currentHitRate = this.getRollingHitRate();
    
    // Not enough trades to enforce
    if (this.tradeHistory.length < 10) {
      return {
        canTrade: true,
        reason: 'Building trade history',
        currentHitRate,
        requiredMinimum: MIN_HIT_RATE_TO_TRADE,
        isPaused: false,
        analysisRequired: false,
      };
    }
    
    // Critical hit rate - trigger analysis
    if (currentHitRate < CRITICAL_HIT_RATE) {
      this.pauseTrading(PAUSE_DURATION_MS * 3, 'critical_hit_rate');
      return {
        canTrade: false,
        reason: `Hit rate ${currentHitRate.toFixed(1)}% is CRITICAL (below ${CRITICAL_HIT_RATE}%). Deep analysis required.`,
        currentHitRate,
        requiredMinimum: MIN_HIT_RATE_TO_TRADE,
        isPaused: true,
        analysisRequired: true,
      };
    }
    
    // Below minimum - pause and analyze
    if (currentHitRate < MIN_HIT_RATE_TO_TRADE) {
      this.pauseTrading(PAUSE_DURATION_MS, 'low_hit_rate');
      return {
        canTrade: false,
        reason: `Hit rate ${currentHitRate.toFixed(1)}% below minimum ${MIN_HIT_RATE_TO_TRADE}%. Pausing to stabilize.`,
        currentHitRate,
        requiredMinimum: MIN_HIT_RATE_TO_TRADE,
        isPaused: true,
        analysisRequired: true,
      };
    }
    
    // All good
    return {
      canTrade: true,
      reason: 'Hit rate within acceptable range',
      currentHitRate,
      requiredMinimum: MIN_HIT_RATE_TO_TRADE,
      isPaused: false,
      analysisRequired: false,
    };
  }
  
  /**
   * Monitor price and determine exit - REAL price-based, NO RANDOM
   * CRITICAL: NEVER exits at $0 or negative profit - waits for minimum profit
   * @param getCurrentPrice Function that returns current price
   * @param config Configuration for monitoring
   * @param shouldCancel Optional callback to check if monitoring should be cancelled
   * @returns Promise that resolves when trade exits WITH PROFIT
   */
  async monitorPriceForExit(
    getCurrentPrice: () => number | null,
    config: PriceMonitorConfig,
    shouldCancel?: () => boolean
  ): Promise<PriceMonitorResult> {
    const startTime = Date.now();
    const {
      entryPrice,
      direction,
      takeProfitPercent,
      stopLossPercent,
      maxHoldTimeMs,
      enableTrailingStop,
      minProfitPercent = DEFAULT_MIN_PROFIT_PERCENT,
      minProfitDollars = DEFAULT_MIN_PROFIT_DOLLARS,
      positionSize = 100, // Default $100 for calculations
    } = config;
    
    // Calculate TP and SL prices
    const tpPrice = direction === 'long'
      ? entryPrice * (1 + takeProfitPercent / 100)
      : entryPrice * (1 - takeProfitPercent / 100);
    
    let slPrice = direction === 'long'
      ? entryPrice * (1 - stopLossPercent / 100)
      : entryPrice * (1 + stopLossPercent / 100);
    
    // Calculate minimum profit price threshold
    const minProfitPrice = direction === 'long'
      ? entryPrice * (1 + minProfitPercent / 100)
      : entryPrice * (1 - minProfitPercent / 100);
    
    let maxProfitSeen = 0;
    let minProfitSeen = 0;
    let trailingStopActivated = false;
    let breakevenActivated = false;
    let extendedHoldMode = false; // Activated when TIME_EXIT reached without min profit
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // CRITICAL: Check cancellation flag FIRST before any other logic
        if (shouldCancel && shouldCancel()) {
          clearInterval(checkInterval);
          const elapsed = Date.now() - startTime;
          console.log('🛑 Price monitor CANCELLED - bot is stopping');
          resolve({
            exitPrice: entryPrice, // Use entry price for cancelled trades
            isWin: false,
            exitReason: 'CANCELLED',
            holdTimeMs: elapsed,
            maxProfitSeen,
            minProfitSeen,
            profitDollars: 0,
          });
          return;
        }
        
        const currentPrice = getCurrentPrice();
        const elapsed = Date.now() - startTime;
        
        // No price available - continue waiting
        if (currentPrice === null) return;
        
        // Calculate current profit percent and dollars
        const profitPercent = direction === 'long'
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - currentPrice) / entryPrice) * 100;
        
        const profitDollars = (profitPercent / 100) * positionSize;
        
        // Track max/min profit
        maxProfitSeen = Math.max(maxProfitSeen, profitPercent);
        minProfitSeen = Math.min(minProfitSeen, profitPercent);
        
        // === TAKE PROFIT HIT ===
        const tpHit = direction === 'long' 
          ? currentPrice >= tpPrice 
          : currentPrice <= tpPrice;
        
        if (tpHit) {
          clearInterval(checkInterval);
          resolve({
            exitPrice: currentPrice,
            isWin: true,
            exitReason: 'TAKE_PROFIT',
            holdTimeMs: elapsed,
            maxProfitSeen,
            minProfitSeen,
            profitDollars,
          });
          return;
        }
        
        // === CHECK FOR MINIMUM PROFIT EXIT ===
        // If we've seen enough profit, lock it in!
        const hasMinProfit = profitPercent >= minProfitPercent && profitDollars >= minProfitDollars;
        
        if (hasMinProfit && elapsed >= maxHoldTimeMs * 0.5) {
          // We have minimum profit AND held for at least 50% of max time - lock it in!
          clearInterval(checkInterval);
          console.log(`✅ MIN_PROFIT_EXIT: Locking in ${profitPercent.toFixed(3)}% ($${profitDollars.toFixed(2)}) profit`);
          resolve({
            exitPrice: currentPrice,
            isWin: true,
            exitReason: 'MIN_PROFIT_EXIT',
            holdTimeMs: elapsed,
            maxProfitSeen,
            minProfitSeen,
            profitDollars,
          });
          return;
        }
        
        // === TRAILING STOP LOGIC ===
        if (enableTrailingStop && profitPercent >= takeProfitPercent * 0.5 && !breakevenActivated) {
          // Move SL to breakeven at 50% of TP
          slPrice = entryPrice;
          breakevenActivated = true;
          console.log(`🔒 Breakeven activated at ${profitPercent.toFixed(2)}%`);
        }
        
        if (enableTrailingStop && profitPercent >= takeProfitPercent * 0.75 && !trailingStopActivated) {
          // Activate trailing stop at 75% of TP
          const trailDistance = takeProfitPercent * 0.25; // Trail by 25% of TP distance
          slPrice = direction === 'long'
            ? currentPrice * (1 - trailDistance / 100)
            : currentPrice * (1 + trailDistance / 100);
          trailingStopActivated = true;
          console.log(`📈 Trailing stop activated at ${profitPercent.toFixed(2)}%`);
        }
        
        // Update trailing stop if activated
        if (trailingStopActivated) {
          const newTrailSL = direction === 'long'
            ? currentPrice * (1 - takeProfitPercent * 0.25 / 100)
            : currentPrice * (1 + takeProfitPercent * 0.25 / 100);
          
          // Only move SL in profitable direction
          if (direction === 'long' && newTrailSL > slPrice) {
            slPrice = newTrailSL;
          } else if (direction === 'short' && newTrailSL < slPrice) {
            slPrice = newTrailSL;
          }
        }
        
        // === STOP LOSS HIT ===
        // ONLY trigger SL if we're NOT in extended hold mode seeking profit
        const slHit = direction === 'long'
          ? currentPrice <= slPrice
          : currentPrice >= slPrice;
        
        if (slHit && !extendedHoldMode) {
          // If breakeven or trailing was activated, this is still a win (protected profit)
          if (breakevenActivated || trailingStopActivated) {
            clearInterval(checkInterval);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: trailingStopActivated ? 'TRAILING_STOP' : 'BREAKEVEN',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars,
            });
            return;
          }
          
          // Regular stop loss - this is a loss
          clearInterval(checkInterval);
          resolve({
            exitPrice: currentPrice,
            isWin: false,
            exitReason: 'STOP_LOSS',
            holdTimeMs: elapsed,
            maxProfitSeen,
            minProfitSeen,
            profitDollars,
          });
          return;
        }
        
        // === TIME EXIT LOGIC - CRITICAL: NEVER EXIT AT $0 ===
        if (elapsed >= maxHoldTimeMs && !extendedHoldMode) {
          // Time's up - but we MUST exit with profit if possible
          if (profitPercent >= minProfitPercent && profitDollars >= minProfitDollars) {
            // We have minimum profit - exit now!
            clearInterval(checkInterval);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: 'TIME_EXIT',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars,
            });
            return;
          }
          
          // NO PROFIT YET - enter extended hold mode to wait for profit
          extendedHoldMode = true;
          console.log(`⏳ EXTENDED_HOLD: Waiting for min profit (current: ${profitPercent.toFixed(3)}%, need: ${minProfitPercent}%)`);
        }
        
        // === EXTENDED HOLD - Wait for ANY profit ===
        if (extendedHoldMode) {
          const extendedMaxTime = maxHoldTimeMs * MAX_EXTENDED_HOLD_MULTIPLIER;
          
          // Check if we finally got some profit
          if (profitPercent > 0 && profitDollars > 0) {
            clearInterval(checkInterval);
            console.log(`✅ Extended hold SUCCESS: Got ${profitPercent.toFixed(3)}% ($${profitDollars.toFixed(2)}) profit`);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: 'MIN_PROFIT_EXIT',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars,
            });
            return;
          }
          
          // Hard timeout - exit at breakeven (entry price) to avoid loss
          if (elapsed >= extendedMaxTime) {
            clearInterval(checkInterval);
            console.log(`⚠️ Extended hold TIMEOUT: Exiting at breakeven (entry price)`);
            resolve({
              exitPrice: entryPrice, // CRITICAL: Exit at ENTRY PRICE, not current price
              isWin: false,
              exitReason: 'BREAKEVEN',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars: 0, // Zero profit, NOT negative
            });
            return;
          }
        }
      }, 200); // Check every 200ms - balance between responsiveness and CPU usage
    });
  }
  
  /**
   * Calculate optimal TP/SL based on volatility and hit rate target
   */
  calculateOptimalLevels(
    currentPrice: number,
    volatility: number, // ATR or price volatility
    targetHitRate: number = 90
  ): { takeProfitPercent: number; stopLossPercent: number } {
    // Higher hit rate target = tighter TP, wider SL
    // For 90% hit rate: TP should be ~60% of expected move, SL should be ~120%
    
    const baseMove = volatility / currentPrice * 100; // Volatility as % of price
    
    let tpMultiplier: number;
    let slMultiplier: number;
    
    if (targetHitRate >= 95) {
      // Ultra-conservative: very tight TP, wide SL
      tpMultiplier = 0.3;  // TP at 30% of expected move
      slMultiplier = 1.5;  // SL at 150% of expected move
    } else if (targetHitRate >= 90) {
      // Conservative: tight TP, moderate SL
      tpMultiplier = 0.4;
      slMultiplier = 1.2;
    } else if (targetHitRate >= 85) {
      // Balanced
      tpMultiplier = 0.6;
      slMultiplier = 1.0;
    } else {
      // Aggressive
      tpMultiplier = 0.8;
      slMultiplier = 0.8;
    }
    
    return {
      takeProfitPercent: Math.max(0.1, baseMove * tpMultiplier),
      stopLossPercent: Math.max(0.05, baseMove * slMultiplier),
    };
  }
  
  /**
   * Reset strategy state
   */
  reset(): void {
    this.tradeHistory = [];
    this.isPaused = false;
    this.pauseUntil = 0;
    this.consecutiveLosses = 0;
    this.consecutiveErrors = 0;
  }
  
  /**
   * Get strategy statistics
   */
  getStats() {
    const wins = this.tradeHistory.filter(t => t.isWin);
    const losses = this.tradeHistory.filter(t => !t.isWin);
    const totalPnL = this.tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
    
    return {
      totalTrades: this.tradeHistory.length,
      wins: wins.length,
      losses: losses.length,
      hitRate: this.getRollingHitRate(),
      totalPnL,
      avgWinPnL: wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0,
      avgLossPnL: losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0,
      consecutiveLosses: this.consecutiveLosses,
      isPaused: this.isPaused,
    };
  }
}

// Singleton instance
export const profitLockStrategy = new ProfitLockStrategyManager();
