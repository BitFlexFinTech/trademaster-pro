// Execution Telemetry for Trade Timing Analysis
// Tracks precise timing for each phase of trade execution

export type ExecutionPhase = 
  | 'PAIR_SELECTION'
  | 'AI_ANALYSIS'
  | 'ORDER_PREPARATION'
  | 'ORDER_PLACEMENT'
  | 'CONFIRMATION';

export interface ApiCallMetric {
  endpoint: string;
  method: string;
  durationMs: number;
  cached: boolean;
  status: 'success' | 'error';
  timestamp: number;
}

export interface PhaseMetrics {
  startMs: number;
  durationMs: number;
  details: string;
  apiCalls?: ApiCallMetric[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: string[];
}

export interface ExecutionTelemetry {
  tradeId: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  phases: {
    pairSelection?: PhaseMetrics;
    aiAnalysis?: PhaseMetrics;
    orderPreparation?: PhaseMetrics;
    orderPlacement?: PhaseMetrics;
    confirmation?: PhaseMetrics;
  };
  totalDurationMs: number;
  success: boolean;
  timestamp: string;
  metadata?: Record<string, unknown>;
  apiCalls?: ApiCallMetric[];
  cacheStats?: CacheStats;
}

export class TelemetryTracker {
  private startTime: number;
  private currentPhaseStart: number;
  private phases: ExecutionTelemetry['phases'] = {};
  private metadata: Record<string, unknown> = {};
  private apiCalls: ApiCallMetric[] = [];
  private cacheStats: CacheStats = { hits: 0, misses: 0, keys: [] };
  
  public tradeId: string;
  public pair: string;
  public direction: 'long' | 'short';
  public exchange: string;
  
  constructor(
    tradeId: string = '',
    pair: string = '',
    direction: 'long' | 'short' = 'long',
    exchange: string = ''
  ) {
    this.startTime = Date.now();
    this.currentPhaseStart = this.startTime;
    this.tradeId = tradeId;
    this.pair = pair;
    this.direction = direction;
    this.exchange = exchange;
  }
  
  startPhase(phase: ExecutionPhase): void {
    this.currentPhaseStart = Date.now();
  }
  
  endPhase(phase: ExecutionPhase, details: string = ''): void {
    const now = Date.now();
    const durationMs = now - this.currentPhaseStart;
    const startMs = this.currentPhaseStart - this.startTime;
    
    const phaseKey = this.phaseToKey(phase);
    this.phases[phaseKey] = {
      startMs,
      durationMs,
      details,
    };
    
    console.log(`📊 [TELEMETRY] ${phase}: ${durationMs}ms - ${details}`);
  }
  
  private phaseToKey(phase: ExecutionPhase): keyof ExecutionTelemetry['phases'] {
    const map: Record<ExecutionPhase, keyof ExecutionTelemetry['phases']> = {
      'PAIR_SELECTION': 'pairSelection',
      'AI_ANALYSIS': 'aiAnalysis',
      'ORDER_PREPARATION': 'orderPreparation',
      'ORDER_PLACEMENT': 'orderPlacement',
      'CONFIRMATION': 'confirmation',
    };
    return map[phase];
  }
  
  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }
  
  updateTradeInfo(tradeId: string, pair: string, direction: 'long' | 'short', exchange: string): void {
    this.tradeId = tradeId;
    this.pair = pair;
    this.direction = direction;
    this.exchange = exchange;
  }
  
  // Record cache hit
  recordCacheHit(key: string): void {
    this.cacheStats.hits++;
    if (!this.cacheStats.keys.includes(key)) {
      this.cacheStats.keys.push(key);
    }
    console.log(`📦 [CACHE] HIT: ${key}`);
  }
  
  // Record cache miss
  recordCacheMiss(key: string): void {
    this.cacheStats.misses++;
    if (!this.cacheStats.keys.includes(key)) {
      this.cacheStats.keys.push(key);
    }
    console.log(`📦 [CACHE] MISS: ${key}`);
  }
  
  // Time an API call and record metrics
  async timeApiCall<T>(
    endpoint: string,
    method: string,
    operation: () => Promise<T>,
    cached: boolean = false
  ): Promise<T> {
    const startTime = Date.now();
    let status: 'success' | 'error' = 'success';
    
    try {
      const result = await operation();
      return result;
    } catch (error) {
      status = 'error';
      throw error;
    } finally {
      const durationMs = Date.now() - startTime;
      this.apiCalls.push({
        endpoint,
        method,
        durationMs,
        cached,
        status,
        timestamp: startTime,
      });
      console.log(`🌐 [API] ${method} ${endpoint}: ${durationMs}ms ${cached ? '(cached)' : ''} [${status}]`);
    }
  }
  
  getMetrics(success: boolean = true): ExecutionTelemetry {
    const now = Date.now();
    return {
      tradeId: this.tradeId,
      pair: this.pair,
      direction: this.direction,
      exchange: this.exchange,
      phases: this.phases,
      totalDurationMs: now - this.startTime,
      success,
      timestamp: new Date().toISOString(),
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
      apiCalls: this.apiCalls.length > 0 ? this.apiCalls : undefined,
      cacheStats: this.cacheStats.hits + this.cacheStats.misses > 0 ? this.cacheStats : undefined,
    };
  }
  
  // Quick utility for timing a single operation
  async timeOperation<T>(
    phase: ExecutionPhase,
    operation: () => Promise<T>,
    detailsFn?: (result: T) => string
  ): Promise<T> {
    this.startPhase(phase);
    try {
      const result = await operation();
      const details = detailsFn ? detailsFn(result) : 'completed';
      this.endPhase(phase, details);
      return result;
    } catch (error) {
      this.endPhase(phase, `failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw error;
    }
  }
}

// Helper to create telemetry tracker
export function createTelemetryTracker(
  tradeId?: string,
  pair?: string,
  direction?: 'long' | 'short',
  exchange?: string
): TelemetryTracker {
  return new TelemetryTracker(tradeId, pair, direction, exchange);
}
