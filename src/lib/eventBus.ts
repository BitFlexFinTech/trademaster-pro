type EventCallback<T = any> = (data: T) => void;

interface EventMap {
  'trade:executed': { pair: string; pnl: number; exchange: string; direction: 'long' | 'short' };
  'trade:opened': { tradeId: string; pair: string; direction: 'long' | 'short'; exchange: string; entryPrice: number };
  'trade:closed': { tradeId: string; pair: string; direction: 'long' | 'short'; exchange: string; netPnl: number };
  'positions:updated': { openCount: number; totalPnl: number };
  'bot:started': { botId: string; botType: 'spot' | 'leverage' };
  'bot:stopped': { botId: string; pnl: number };
  'config:updated': { key: string; value: number | string; previousValue: number | string };
  'recommendation:applied': { id: string; type: string; value: number | string };
  'recommendation:undone': { id: string; type: string; restoredValue: number | string };
  'balance:updated': { newBalance: number; source: 'trade' | 'manual' | 'sync' };
  'balance:synced': { 
    totalBalance: number; 
    exchangeBalances: Record<string, number>; 
    walletBreakdown?: Record<string, { spot: number; futures: number }>;
    maxPositions: number;
  };
  'sync:triggered': { timestamp: Date };
  'hitrate:updated': { current: number; target: number };
  'portfolio_updated': { payload?: unknown };
}

type EventName = keyof EventMap;

class EventBus {
  private listeners: Map<EventName, Set<EventCallback>> = new Map();
  private performanceMetrics: Map<EventName, { count: number; totalLatency: number }> = new Map();

  on<T extends EventName>(event: T, callback: EventCallback<EventMap[T]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => this.off(event, callback);
  }

  off<T extends EventName>(event: T, callback: EventCallback<EventMap[T]>): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit<T extends EventName>(event: T, data: EventMap[T]): void {
    const startTime = performance.now();
    const callbacks = this.listeners.get(event);
    
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: Error in ${event} handler:`, error);
        }
      });
    }

    const latency = performance.now() - startTime;
    this.trackPerformance(event, latency);
  }

  private trackPerformance(event: EventName, latency: number): void {
    const metrics = this.performanceMetrics.get(event) || { count: 0, totalLatency: 0 };
    metrics.count++;
    metrics.totalLatency += latency;
    this.performanceMetrics.set(event, metrics);

    // Warn if latency exceeds 200ms target
    if (latency > 200) {
      console.warn(`EventBus: ${event} took ${latency.toFixed(2)}ms (exceeds 200ms target)`);
    }
  }

  getMetrics(): Record<string, { count: number; avgLatency: number }> {
    const result: Record<string, { count: number; avgLatency: number }> = {};
    this.performanceMetrics.forEach((metrics, event) => {
      result[event] = {
        count: metrics.count,
        avgLatency: metrics.count > 0 ? metrics.totalLatency / metrics.count : 0,
      };
    });
    return result;
  }
}

export const eventBus = new EventBus();
export type { EventMap, EventName };
