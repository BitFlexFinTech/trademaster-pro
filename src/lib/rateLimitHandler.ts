/**
 * Rate Limit Handler - Leaky Bucket Algorithm @ 90% Exchange Limits
 * High-frequency trading safe pacing with priority queue
 */

interface LeakyBucketConfig {
  bucketSize: number;         // Max tokens
  refillRate: number;         // Tokens per second
  targetUtilization: number;  // 0.9 = 90% of limit
}

interface RateLimitState {
  tokens: number;
  lastRefillTime: number;
  consecutive429s: number;
  isConservativeMode: boolean;
  totalRequests: number;
  throttledRequests: number;
}

// Exchange-specific rate limits (requests per minute) with endpoint-specific limits
const EXCHANGE_RATE_LIMITS: Record<string, LeakyBucketConfig> = {
  Binance: { bucketSize: 1200, refillRate: 20, targetUtilization: 0.9 },
  'Binance:orders': { bucketSize: 50, refillRate: 5, targetUtilization: 0.9 }, // 50 orders per 10s
  'Binance:market': { bucketSize: 1200, refillRate: 20, targetUtilization: 0.9 },
  Bybit: { bucketSize: 600, refillRate: 10, targetUtilization: 0.9 },
  'Bybit:orders': { bucketSize: 100, refillRate: 10, targetUtilization: 0.9 }, // 100 orders per 10s
  OKX: { bucketSize: 300, refillRate: 5, targetUtilization: 0.9 },
  'OKX:orders': { bucketSize: 60, refillRate: 6, targetUtilization: 0.9 }, // 60 orders per 10s
  Kraken: { bucketSize: 180, refillRate: 3, targetUtilization: 0.9 },
  'Kraken:orders': { bucketSize: 15, refillRate: 1, targetUtilization: 0.9 }, // Very strict
  KuCoin: { bucketSize: 600, refillRate: 10, targetUtilization: 0.9 },
  default: { bucketSize: 300, refillRate: 5, targetUtilization: 0.9 },
};

interface QueuedRequest<T> {
  id: string;
  priority: 'urgent' | 'normal';
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

class ThrottledQueue {
  private queue: QueuedRequest<any>[] = [];
  private isProcessing = false;
  private lastProcessTime = 0;
  private minIntervalMs: number;

  constructor(requestsPerSecond: number) {
    this.minIntervalMs = Math.ceil(1000 / requestsPerSecond);
  }

  async enqueue<T>(
    request: () => Promise<T>,
    priority: 'urgent' | 'normal' = 'normal'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest<T> = {
        id: Math.random().toString(36).slice(2),
        priority,
        execute: request,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      // Insert based on priority
      if (priority === 'urgent') {
        // Find first non-urgent item and insert before it
        const insertIndex = this.queue.findIndex(r => r.priority === 'normal');
        if (insertIndex === -1) {
          this.queue.push(queuedRequest);
        } else {
          this.queue.splice(insertIndex, 0, queuedRequest);
        }
      } else {
        this.queue.push(queuedRequest);
      }

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      // Enforce minimum interval
      const timeSinceLastProcess = Date.now() - this.lastProcessTime;
      if (timeSinceLastProcess < this.minIntervalMs) {
        await this.sleep(this.minIntervalMs - timeSinceLastProcess);
      }

      try {
        const result = await request.execute();
        this.lastProcessTime = Date.now();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.isProcessing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  getEstimatedWaitTime(): number {
    return this.queue.length * this.minIntervalMs;
  }
}

class RateLimitHandler {
  private stateByExchange: Map<string, RateLimitState>;
  private queueByExchange: Map<string, ThrottledQueue>;

  constructor() {
    this.stateByExchange = new Map();
    this.queueByExchange = new Map();
  }

  private getConfig(exchange: string): LeakyBucketConfig {
    return EXCHANGE_RATE_LIMITS[exchange] || EXCHANGE_RATE_LIMITS.default;
  }

  private getState(exchange: string): RateLimitState {
    if (!this.stateByExchange.has(exchange)) {
      const config = this.getConfig(exchange);
      this.stateByExchange.set(exchange, {
        tokens: config.bucketSize * config.targetUtilization,
        lastRefillTime: Date.now(),
        consecutive429s: 0,
        isConservativeMode: false,
        totalRequests: 0,
        throttledRequests: 0,
      });
    }
    return this.stateByExchange.get(exchange)!;
  }

  private getQueue(exchange: string): ThrottledQueue {
    if (!this.queueByExchange.has(exchange)) {
      const config = this.getConfig(exchange);
      const safeRate = config.refillRate * config.targetUtilization;
      this.queueByExchange.set(exchange, new ThrottledQueue(safeRate));
    }
    return this.queueByExchange.get(exchange)!;
  }

  private refillTokens(exchange: string): void {
    const state = this.getState(exchange);
    const config = this.getConfig(exchange);
    const now = Date.now();
    const elapsedSeconds = (now - state.lastRefillTime) / 1000;
    
    // Refill tokens based on elapsed time
    const maxTokens = config.bucketSize * config.targetUtilization;
    state.tokens = Math.min(maxTokens, state.tokens + elapsedSeconds * config.refillRate);
    state.lastRefillTime = now;
  }

  /**
   * Check if we can make a request (leaky bucket check)
   */
  canMakeRequest(exchange: string): boolean {
    this.refillTokens(exchange);
    const state = this.getState(exchange);
    return state.tokens >= 1;
  }

  /**
   * Consume a token for a request
   */
  consumeToken(exchange: string): void {
    this.refillTokens(exchange);
    const state = this.getState(exchange);
    state.tokens = Math.max(0, state.tokens - 1);
    state.totalRequests++;
  }

  /**
   * Get jittered delay for spacing requests
   */
  getJitteredDelay(baseMs: number = 200): number {
    const jitter = baseMs * 0.3 * (Math.random() - 0.5) * 2;
    return Math.round(baseMs + jitter);
  }

  /**
   * Record a 429 rate limit error
   */
  record429(exchange: string): void {
    const state = this.getState(exchange);
    state.consecutive429s++;
    state.throttledRequests++;

    // Reduce available tokens
    state.tokens = Math.max(0, state.tokens - 5);

    // Enter conservative mode after 3 consecutive 429s
    if (state.consecutive429s >= 3) {
      state.isConservativeMode = true;
      state.tokens = 0; // Drain bucket
      console.warn(`[RateLimit] ${exchange} CONSERVATIVE MODE after ${state.consecutive429s} 429s`);
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(exchange: string): void {
    const state = this.getState(exchange);
    
    if (state.consecutive429s > 0) {
      state.consecutive429s = 0;
    }
    
    if (state.isConservativeMode) {
      // Gradually exit conservative mode
      const config = this.getConfig(exchange);
      state.tokens += config.refillRate * 0.5; // Slow refill
      if (state.tokens >= config.bucketSize * 0.5) {
        state.isConservativeMode = false;
        console.log(`[RateLimit] ${exchange} exited conservative mode`);
      }
    }
  }

  /**
   * Get recommended delay before making a request
   */
  getRecommendedDelay(exchange: string): number {
    this.refillTokens(exchange);
    const state = this.getState(exchange);
    const config = this.getConfig(exchange);

    if (state.tokens >= 1) {
      return this.getJitteredDelay(50); // Quick jitter
    }

    // Calculate wait time for token refill
    const tokensNeeded = 1 - state.tokens;
    const waitMs = (tokensNeeded / config.refillRate) * 1000;
    
    // Add extra delay in conservative mode
    const multiplier = state.isConservativeMode ? 2 : 1;
    return Math.ceil(waitMs * multiplier) + this.getJitteredDelay(100);
  }

  /**
   * Execute with rate limiting and priority queue
   */
  async executeWithRateLimit<T>(
    exchange: string,
    request: () => Promise<T>,
    priority: 'urgent' | 'normal' = 'normal',
    maxRetries: number = 3
  ): Promise<T> {
    const queue = this.getQueue(exchange);
    
    return queue.enqueue(async () => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Wait for recommended delay
        const delay = this.getRecommendedDelay(exchange);
        if (delay > 50) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Consume token before request
        this.consumeToken(exchange);

        try {
          const result = await request();
          this.recordSuccess(exchange);
          return result;
        } catch (error: any) {
          lastError = error;

          if (error?.status === 429 || error?.message?.includes('429')) {
            this.record429(exchange);
            const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
            await new Promise(resolve => setTimeout(resolve, backoff));
            continue;
          }

          throw error;
        }
      }

      throw lastError || new Error('Max retries exceeded');
    }, priority);
  }

  /**
   * Get current rate limit status for an exchange
   */
  getStatus(exchange: string): {
    isConservativeMode: boolean;
    availableTokens: number;
    maxTokens: number;
    utilization: number;
    consecutive429s: number;
    throttleRate: number;
    queueDepth: number;
    estimatedWaitMs: number;
  } {
    this.refillTokens(exchange);
    const state = this.getState(exchange);
    const config = this.getConfig(exchange);
    const queue = this.getQueue(exchange);

    return {
      isConservativeMode: state.isConservativeMode,
      availableTokens: Math.floor(state.tokens),
      maxTokens: config.bucketSize,
      utilization: (1 - state.tokens / config.bucketSize) * 100,
      consecutive429s: state.consecutive429s,
      throttleRate: state.totalRequests > 0
        ? (state.throttledRequests / state.totalRequests) * 100
        : 0,
      queueDepth: queue.getQueueDepth(),
      estimatedWaitMs: queue.getEstimatedWaitTime(),
    };
  }

  /**
   * Reset all rate limit state
   */
  reset(exchange?: string): void {
    if (exchange) {
      this.stateByExchange.delete(exchange);
      this.queueByExchange.delete(exchange);
    } else {
      this.stateByExchange.clear();
      this.queueByExchange.clear();
    }
  }

  /**
   * Wait before making a request (compatibility method for existing code)
   * Applies jittered delay based on exchange rate limits
   */
  async waitBeforeRequest(exchange: string): Promise<void> {
    const delay = this.getRecommendedDelay(exchange);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    this.consumeToken(exchange);
  }
}

// Singleton instance
export const rateLimitHandler = new RateLimitHandler();
