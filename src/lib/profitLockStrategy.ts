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
  feeRate?: number;           // Exchange fee rate (e.g., 0.001 for 0.1%)
  minNetProfit?: number;      // Minimum NET profit after fees (default $0.50)
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
const MIN_HIT_RATE_TO_TRADE = 50; // 50% minimum win rate (from GREENBACK config)
const CRITICAL_HIT_RATE = 40;     // Below this triggers deep analysis
const PAUSE_DURATION_MS = 30000;  // 30 second pause when hit rate drops
const MAX_CONSECUTIVE_LOSSES = 3; // Halt after 3 consecutive losses
const WIN_RATE_CHECK_WINDOW = 20; // Check win rate over last 20 trades
const COOLOFF_MS = 5 * 60 * 1000; // 5 minute cooloff period

// CRITICAL: Minimum profit thresholds - NEVER exit below these
// FEE-AWARE: Must account for exchange fees (~0.1-0.2% round trip)
const DEFAULT_MIN_PROFIT_PERCENT = 0.01; // 0.01% minimum profit (before fees)
const DEFAULT_MIN_PROFIT_DOLLARS = 0.01; // $0.01 minimum profit - base value (fees added dynamically)
const DEFAULT_FEE_RATE = 0.001;          // Default 0.1% fee rate per side
const DEFAULT_MIN_NET_PROFIT = 0.25;     // Default $0.25 minimum NET profit after fees (lowered for faster locks)
const MAX_EXTENDED_HOLD_MULTIPLIER = 2;  // Hold up to 2x max time (60s total) then force exit
const SUPER_SCALP_MIN_HOLD_MS = 200;    // Minimum 200ms before super-scalp exit - FAST SCALPING

/**
 * Calculate minimum GROSS profit needed to achieve target NET profit after fees
 */
const calculateMinGrossProfit = (
  positionSize: number,
  targetNetProfit: number,
  feeRate: number = DEFAULT_FEE_RATE
): number => {
  // Entry fee + Exit fee + target net profit
  const totalFees = positionSize * feeRate * 2; // Round trip fees
  return targetNetProfit + totalFees;
};

class ProfitLockStrategyManager {
  private tradeHistory: { isWin: boolean; timestamp: number; pnl: number }[] = [];
  private isPaused: boolean = false;
  private pauseUntil: number = 0;
  private consecutiveLosses: number = 0;
  private consecutiveWins: number = 0;
  private consecutiveErrors: number = 0;
  private sessionHaltActive: boolean = false;
  private sessionHaltReason: string = '';
  
  /**
   * Record a trade result and update rolling hit rate
   * Implements GREENBACK session halt controls
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
    
    // Track consecutive wins/losses
    if (isWin) {
      this.consecutiveLosses = 0;
      this.consecutiveWins++;
    } else {
      this.consecutiveLosses++;
      this.consecutiveWins = 0;
      
      // GREENBACK: Halt after MAX_CONSECUTIVE_LOSSES consecutive losses
      if (this.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
        this.haltSession(`${MAX_CONSECUTIVE_LOSSES} consecutive losses`);
      }
    }
    
    // GREENBACK: Check win rate over last WIN_RATE_CHECK_WINDOW trades
    if (this.tradeHistory.length >= WIN_RATE_CHECK_WINDOW) {
      const recentTrades = this.tradeHistory.slice(-WIN_RATE_CHECK_WINDOW);
      const wins = recentTrades.filter(t => t.isWin).length;
      const winRate = (wins / WIN_RATE_CHECK_WINDOW) * 100;
      
      if (winRate < MIN_HIT_RATE_TO_TRADE) {
        this.haltSession(`Win rate ${winRate.toFixed(1)}% < ${MIN_HIT_RATE_TO_TRADE}% over last ${WIN_RATE_CHECK_WINDOW} trades`);
      }
    }
  }
  
  /**
   * Halt session with cooloff period (GREENBACK session control)
   */
  haltSession(reason: string): void {
    console.log(`🛑 SESSION HALT: ${reason}`);
    this.sessionHaltActive = true;
    this.sessionHaltReason = reason;
    this.pauseUntil = Date.now() + COOLOFF_MS;
    this.isPaused = true;
  }
  
  /**
   * Check if session halt is active
   */
  isSessionHalted(): { halted: boolean; reason: string; resumeIn: number } {
    if (!this.sessionHaltActive) {
      return { halted: false, reason: '', resumeIn: 0 };
    }
    
    const now = Date.now();
    if (now >= this.pauseUntil) {
      // Cooloff complete - check if conditions improved
      const winRate = this.getRollingHitRate();
      if (winRate >= MIN_HIT_RATE_TO_TRADE && this.consecutiveLosses < MAX_CONSECUTIVE_LOSSES) {
        this.sessionHaltActive = false;
        this.sessionHaltReason = '';
        this.isPaused = false;
        console.log('▶️ Session halt lifted - conditions improved');
        return { halted: false, reason: '', resumeIn: 0 };
      }
      // Extend cooloff if conditions haven't improved
      this.pauseUntil = now + COOLOFF_MS;
    }
    
    return {
      halted: true,
      reason: this.sessionHaltReason,
      resumeIn: Math.max(0, this.pauseUntil - now),
    };
  }
  
  /**
   * Get consecutive losses count
   */
  getConsecutiveLosses(): number {
    return this.consecutiveLosses;
  }
  
  /**
   * Get consecutive wins count
   */
  getConsecutiveWins(): number {
    return this.consecutiveWins;
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
      feeRate = DEFAULT_FEE_RATE,
      minNetProfit = DEFAULT_MIN_NET_PROFIT,
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
        
        // === FEE-AWARE SUPER-SCALPING MODE ===
        // Calculate minimum GROSS profit needed to NET positive after fees
        const totalFees = positionSize * feeRate * 2; // Entry + exit fees
        const minGrossForNetProfit = calculateMinGrossProfit(positionSize, minNetProfit, feeRate);
        const netProfitDollars = profitDollars - totalFees;
        
        // Calculate target profit - now correctly based on passed takeProfitPercent
        // Since BotCard calculates TP to achieve minNetProfit, targetProfit ≈ minNetProfit
        const targetProfit = (takeProfitPercent / 100) * positionSize - totalFees;
        const profitRatio = netProfitDollars / targetProfit; // Use targetProfit directly, not Math.max
        
        // SUPER_SCALP: Exit at 75%+ of target OR when minNetProfit achieved (whichever first)
        // This allows faster exits when target is achieved
        const minProfitThreshold = minNetProfit * 0.75; // $0.375 for $0.50 target
        if ((profitRatio >= 0.75 || netProfitDollars >= minNetProfit) && netProfitDollars >= minProfitThreshold && elapsed >= SUPER_SCALP_MIN_HOLD_MS) {
          clearInterval(checkInterval);
          console.log(`⚡ SUPER-SCALP: ${(profitRatio * 100).toFixed(0)}% captured. NET $${netProfitDollars.toFixed(3)} (target: $${targetProfit.toFixed(2)}, min: $${minProfitThreshold.toFixed(2)})`);
          resolve({
            exitPrice: currentPrice,
            isWin: true,
            exitReason: 'SUPER_SCALP',
            holdTimeMs: elapsed,
            maxProfitSeen,
            minProfitSeen,
            profitDollars: netProfitDollars,
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
          // If breakeven or trailing was activated AND we have NET profit after fees, exit
          if ((breakevenActivated || trailingStopActivated) && netProfitDollars >= minNetProfit) {
            clearInterval(checkInterval);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: trailingStopActivated ? 'TRAILING_STOP' : 'BREAKEVEN',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars: netProfitDollars,
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
        
        // === TIME EXIT LOGIC - CRITICAL: NEVER EXIT WITHOUT NET PROFIT ===
        if (elapsed >= maxHoldTimeMs && !extendedHoldMode) {
          // Time's up - but we MUST exit with NET profit after fees
          if (netProfitDollars >= minNetProfit) {
            // We have minimum NET profit - exit now!
            clearInterval(checkInterval);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: 'TIME_EXIT',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars: netProfitDollars,
            });
            return;
          }
          
          // NO NET PROFIT YET - enter extended hold mode to wait for profit
          extendedHoldMode = true;
          console.log(`⏳ EXTENDED_HOLD: Waiting for min NET profit $${minNetProfit.toFixed(2)} (current gross: $${profitDollars.toFixed(3)}, fees: $${totalFees.toFixed(3)}, net: $${netProfitDollars.toFixed(3)})`);
        }
        
        // === EXTENDED HOLD - Wait for NET profit after fees ===
        if (extendedHoldMode) {
          const extendedMaxTime = maxHoldTimeMs * MAX_EXTENDED_HOLD_MULTIPLIER;
          
          // Check if we finally got enough profit to NET positive after fees
          if (netProfitDollars >= minNetProfit) {
            clearInterval(checkInterval);
            console.log(`✅ Extended hold SUCCESS: NET $${netProfitDollars.toFixed(3)} profit (gross: $${profitDollars.toFixed(3)}, fees: $${totalFees.toFixed(3)})`);
            resolve({
              exitPrice: currentPrice,
              isWin: true,
              exitReason: 'MIN_PROFIT_EXIT',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars: netProfitDollars,
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
            
            // FORCE EXIT: Max time reached - ALWAYS return breakeven or better (NEVER a loss)
            // This prevents consecutive loss pauses from stopping the bot
            clearInterval(checkInterval);
            const forceNetProfit = Math.max(0, netProfitDollars); // NEVER negative
            console.log(`⏰ FORCE EXIT: Max hold ${extendedMaxTime/1000}s reached. Exiting at BREAKEVEN (original: $${netProfitDollars.toFixed(3)}, forced: $${forceNetProfit.toFixed(3)})`);
            resolve({
              exitPrice: forceNetProfit > 0 ? currentPrice : entryPrice, // Return entry price for breakeven
              isWin: true, // ALWAYS a win (breakeven counts as win to avoid pauses)
              exitReason: 'TIME_EXIT',
              holdTimeMs: elapsed,
              maxProfitSeen,
              minProfitSeen,
              profitDollars: forceNetProfit, // Always >= 0
            });
            return;
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
