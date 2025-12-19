/**
 * Rate Limit Handler - Adaptive pacing and recovery
 * Phase 1: Jittered sleep, adaptive pacing, exponential backoff
 */

interface RateLimitConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMinMs: number;
  jitterMaxMs: number;
  pacingReductionPercent: number;
  conservativeModeThreshold: number;
}

interface RateLimitState {
  consecutive429s: number;
  lastRequestTime: number;
  currentPacingMultiplier: number;
  isConservativeMode: boolean;
  requestQueue: Array<() => Promise<void>>;
  totalRequests: number;
  throttledRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMinMs: 200,
  jitterMaxMs: 500,
  pacingReductionPercent: 25,
  conservativeModeThreshold: 3,
};

class RateLimitHandler {
  private config: RateLimitConfig;
  private stateByExchange: Map<string, RateLimitState>;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateByExchange = new Map();
  }

  /**
   * Get or create state for an exchange
   */
  private getState(exchange: string): RateLimitState {
    if (!this.stateByExchange.has(exchange)) {
      this.stateByExchange.set(exchange, {
        consecutive429s: 0,
        lastRequestTime: 0,
        currentPacingMultiplier: 1,
        isConservativeMode: false,
        requestQueue: [],
        totalRequests: 0,
        throttledRequests: 0,
      });
    }
    return this.stateByExchange.get(exchange)!;
  }

  /**
   * Calculate jittered delay (200-500ms base)
   */
  getJitteredDelay(): number {
    const { jitterMinMs, jitterMaxMs } = this.config;
    return jitterMinMs + Math.random() * (jitterMaxMs - jitterMinMs);
  }

  /**
   * Calculate exponential backoff with jitter
   */
  getBackoffDelay(attempt: number): number {
    const baseDelay = Math.min(
      this.config.baseDelayMs * Math.pow(2, attempt),
      this.config.maxDelayMs
    );
    // Add jitter (±20% of delay)
    const jitter = baseDelay * 0.2 * (Math.random() - 0.5) * 2;
    return Math.round(baseDelay + jitter);
  }

  /**
   * Record a 429 rate limit error
   */
  record429(exchange: string) {
    const state = this.getState(exchange);
    state.consecutive429s++;
    state.throttledRequests++;

    // Increase pacing multiplier by configured reduction
    state.currentPacingMultiplier *= 1 + this.config.pacingReductionPercent / 100;

    // Enter conservative mode after threshold
    if (state.consecutive429s >= this.config.conservativeModeThreshold) {
      state.isConservativeMode = true;
      state.currentPacingMultiplier = 2; // 50% of normal capacity
      console.warn(`[RateLimit] ${exchange} entered CONSERVATIVE MODE after ${state.consecutive429s} 429s`);
    }

    console.warn(`[RateLimit] ${exchange} 429 error #${state.consecutive429s}, pacing: ${state.currentPacingMultiplier.toFixed(2)}x`);
  }

  /**
   * Record a successful request
   */
  recordSuccess(exchange: string) {
    const state = this.getState(exchange);
    state.totalRequests++;
    
    // Reset on success
    if (state.consecutive429s > 0) {
      state.consecutive429s = 0;
      // Gradually reduce pacing multiplier
      state.currentPacingMultiplier = Math.max(1, state.currentPacingMultiplier * 0.9);
      
      if (state.isConservativeMode && state.currentPacingMultiplier <= 1.1) {
        state.isConservativeMode = false;
        console.log(`[RateLimit] ${exchange} exited conservative mode`);
      }
    }
    
    state.lastRequestTime = Date.now();
  }

  /**
   * Get the recommended delay before making a request
   */
  getRecommendedDelay(exchange: string): number {
    const state = this.getState(exchange);
    const jitter = this.getJitteredDelay();
    
    // In conservative mode, use longer base delay
    if (state.isConservativeMode) {
      return jitter * 2 + this.config.baseDelayMs;
    }
    
    // Apply pacing multiplier to jitter
    return Math.round(jitter * state.currentPacingMultiplier);
  }

  /**
   * Wait with jittered delay before a request
   */
  async waitBeforeRequest(exchange: string): Promise<void> {
    const delay = this.getRecommendedDelay(exchange);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Execute a request with automatic rate limit handling
   */
  async executeWithRateLimit<T>(
    exchange: string,
    request: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Wait with jitter before request
      await this.waitBeforeRequest(exchange);

      try {
        const result = await request();
        this.recordSuccess(exchange);
        return result;
      } catch (error: any) {
        lastError = error;

        // Check for 429 status
        if (error?.status === 429 || error?.message?.includes('429')) {
          this.record429(exchange);
          const backoffDelay = this.getBackoffDelay(attempt);
          console.log(`[RateLimit] ${exchange} backing off for ${backoffDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        // For other errors, throw immediately
        throw error;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Get current rate limit status for an exchange
   */
  getStatus(exchange: string): {
    isConservativeMode: boolean;
    pacingMultiplier: number;
    consecutive429s: number;
    throttleRate: number;
  } {
    const state = this.getState(exchange);
    return {
      isConservativeMode: state.isConservativeMode,
      pacingMultiplier: state.currentPacingMultiplier,
      consecutive429s: state.consecutive429s,
      throttleRate: state.totalRequests > 0 
        ? (state.throttledRequests / state.totalRequests) * 100 
        : 0,
    };
  }

  /**
   * Get overall status across all exchanges
   */
  getOverallStatus(): {
    exchanges: Array<{ exchange: string; status: ReturnType<typeof this.getStatus> }>;
    anyConservativeMode: boolean;
    avgPacingMultiplier: number;
  } {
    const exchanges = Array.from(this.stateByExchange.entries()).map(([exchange]) => ({
      exchange,
      status: this.getStatus(exchange),
    }));

    const anyConservativeMode = exchanges.some(e => e.status.isConservativeMode);
    const avgPacingMultiplier = exchanges.length > 0
      ? exchanges.reduce((sum, e) => sum + e.status.pacingMultiplier, 0) / exchanges.length
      : 1;

    return {
      exchanges,
      anyConservativeMode,
      avgPacingMultiplier,
    };
  }

  /**
   * Reset all rate limit state
   */
  reset(exchange?: string) {
    if (exchange) {
      this.stateByExchange.delete(exchange);
    } else {
      this.stateByExchange.clear();
    }
  }
}

// Singleton instance
export const rateLimitHandler = new RateLimitHandler();
