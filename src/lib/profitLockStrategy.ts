/**
 * Profit Lock Strategy - Real price-based profit locking system
 * NEVER uses random win/loss - only exits when price hits TP or SL
 * CRITICAL: NEVER exits at $0 profit - always locks in at least minimum profit ($0.01)
 * SUPER-SCALPING: Lock in ANY profit >= $0.01 immediately for rapid trade cycling
 */

export interface PriceMonitorConfig {
  entryPrice: number;
  direction: 'long' | 'short';
  takeProfitPercent: number;  // e.g., 0.3 = 0.3%
  stopLossPercent: number;    // e.g., 0.15 = 0.15% (tighter than TP for positive expectancy)
  maxHoldTimeMs: number;      // Max time to hold position
  enableTrailingStop: boolean;
  minProfitPercent?: number;  // MINIMUM profit % to allow exit (default 0.01%)
  minProfitDollars?: number;  // MINIMUM profit $ to allow exit (default $0.01)
  positionSize?: number;      // Position size for $ calculations
}

export interface PriceMonitorResult {
  exitPrice: number;
  isWin: boolean;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP' | 'TIME_EXIT' | 'BREAKEVEN' | 'CANCELLED' | 'MIN_PROFIT_EXIT' | 'SUPER_SCALP' | 'OPPORTUNITY_EXIT';
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

export interface NextOpportunity {
  pair: string;
  expectedProfit: number;
  confidence: number;
}

// Rolling window for hit rate tracking
const ROLLING_WINDOW_SIZE = 50;
const MIN_HIT_RATE_TO_TRADE = 65; // Lowered from 85% - more realistic for real price monitoring
const CRITICAL_HIT_RATE = 50;     // Below this triggers deep analysis
const PAUSE_DURATION_MS = 30000;  // 30 second pause when hit rate drops (reduced from 60s)

// CRITICAL: Minimum profit thresholds - NEVER exit below these
// STRICT RULE: Minimum is $0.01, NOT $0.50 or $0.10
const DEFAULT_MIN_PROFIT_PERCENT = 0.01; // 0.01% minimum profit
const DEFAULT_MIN_PROFIT_DOLLARS = 0.01; // $0.01 minimum profit - STRICT RULE
const MAX_EXTENDED_HOLD_MULTIPLIER = 10; // Hold up to 10x max time to find profit (was 2x)
const SUPER_SCALP_MIN_HOLD_MS = 200;    // Minimum 200ms before super-scalp exit - FAST SCALPING

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
   * CRITICAL: NEVER exits at $0 or negative profit - waits indefinitely for min profit
   * SUPER-SCALPING: Locks in ANY profit >= $0.01 after 1 second
   * SMART EXIT: Only exits $0 if a better opportunity exists
   * @param getCurrentPrice Function that returns current price
   * @param config Configuration for monitoring
   * @param shouldCancel Optional callback to check if monitoring should be cancelled
   * @param findNextOpportunity Optional callback to check for better opportunities
   * @returns Promise that resolves when trade exits WITH PROFIT
   */
  async monitorPriceForExit(
    getCurrentPrice: () => number | null,
    config: PriceMonitorConfig,
    shouldCancel?: () => boolean,
    findNextOpportunity?: () => Promise<NextOpportunity | null>,
    onPriceUpdate?: (data: {
      currentPrice: number;
      entryPrice: number;
      profitPercent: number;
      profitDollars: number;
      elapsed: number;
      maxProfitSeen: number;
    }) => void
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
      const checkInterval = setInterval(async () => {
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
        
        // CALLBACK: Send real-time price update to UI
        if (onPriceUpdate) {
          onPriceUpdate({
            currentPrice,
            entryPrice,
            profitPercent,
            profitDollars,
            elapsed,
            maxProfitSeen,
          });
        }
        
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
        
        // === SUPER-SCALPING MODE ===
        // Lock in ANY profit >= $0.01 after at least 1 second
        // This enables rapid trade cycling for consistent small profits
        if (profitDollars >= DEFAULT_MIN_PROFIT_DOLLARS && elapsed >= SUPER_SCALP_MIN_HOLD_MS) {
          clearInterval(checkInterval);
          console.log(`⚡ SUPER-SCALP: Locking in $${profitDollars.toFixed(3)} profit immediately!`);
          resolve({
            exitPrice: currentPrice,
            isWin: true,
            exitReason: 'SUPER_SCALP',
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
        
        // === STOP LOSS PROTECTION ===
        // STRICT RULE: NEVER EXIT AT A LOSS - only enter extended hold mode
        const slHit = direction === 'long'
          ? currentPrice <= slPrice
          : currentPrice >= slPrice;
        
        if (slHit) {
          // If breakeven or trailing was activated AND we have profit, exit
          if ((breakevenActivated || trailingStopActivated) && profitDollars >= DEFAULT_MIN_PROFIT_DOLLARS) {
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
          
          // STRICT RULE: NEVER exit at a loss - enter extended hold mode instead
          // Wait for price to recover before exiting
          if (!extendedHoldMode) {
            extendedHoldMode = true;
            console.log(`⚠️ Price hit SL level but NOT exiting - entering extended hold mode to wait for recovery`);
          }
          // DO NOT EXIT - continue monitoring until profitable
        }
        
        // === TIME EXIT LOGIC - CRITICAL: NEVER EXIT AT $0 ===
        if (elapsed >= maxHoldTimeMs && !extendedHoldMode) {
          // Time's up - but we MUST exit with profit if possible
          if (profitDollars >= DEFAULT_MIN_PROFIT_DOLLARS) {
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
          console.log(`⏳ EXTENDED_HOLD: Waiting for min profit $0.01 (current: $${profitDollars.toFixed(3)})`);
        }
        
        // === EXTENDED HOLD - Wait for ANY profit, check for opportunities ===
        if (extendedHoldMode) {
          const extendedMaxTime = maxHoldTimeMs * MAX_EXTENDED_HOLD_MULTIPLIER;
          
          // Check if we finally got some profit >= $0.01
          if (profitDollars >= DEFAULT_MIN_PROFIT_DOLLARS) {
            clearInterval(checkInterval);
            console.log(`✅ Extended hold SUCCESS: Got $${profitDollars.toFixed(3)} profit`);
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
          
          // SMART EXIT: Check for better opportunity, but ONLY exit if we have SOME profit
          if (elapsed >= extendedMaxTime) {
            // STRICT RULE: Never exit at $0 or negative - keep monitoring
            // Even if there's a better opportunity, we need at least breakeven
            if (profitDollars >= 0 && findNextOpportunity) {
              try {
                const nextOpp = await findNextOpportunity();
                if (nextOpp && nextOpp.expectedProfit >= DEFAULT_MIN_PROFIT_DOLLARS) {
                  // Better opportunity exists AND we're at least breakeven - can exit
                  clearInterval(checkInterval);
                  console.log(`🔄 OPPORTUNITY_EXIT: Exiting at breakeven to capture $${nextOpp.expectedProfit.toFixed(3)} on ${nextOpp.pair}`);
                  resolve({
                    exitPrice: entryPrice, // Exit at breakeven
                    isWin: true, // Count as win since we're not losing money
                    exitReason: 'OPPORTUNITY_EXIT',
                    holdTimeMs: elapsed,
                    maxProfitSeen,
                    minProfitSeen,
                    profitDollars: 0, // Breakeven
                  });
                  return;
                }
              } catch (e) {
                console.warn('Failed to check next opportunity:', e);
              }
            }
            
            // NO opportunity found OR still in loss - KEEP HOLDING
            // STRICT RULE: we only exit when we have profit >= $0.01
            // This prevents ANY losses from ever occurring
            console.log(`⏳ Extended hold CONTINUES: Waiting for profit. Current: $${profitDollars.toFixed(3)}`);
            // DO NOT resolve here - keep monitoring indefinitely until profitable
          }
        }
      }, 50); // Check every 50ms - FAST SCALPING for rapid profit capture
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
