import { eventBus } from './eventBus';

interface DemoTrade {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  pnl: number;
  timestamp: Date;
  exchange: string;
}

interface DemoState {
  balance: number;
  trades: DemoTrade[];
  lastUpdated: Date;
  version: number;
}

const DEFAULT_STATE: DemoState = {
  balance: 1000,
  trades: [],
  lastUpdated: new Date(),
  version: 0,
};

class DemoDataStore {
  private state: DemoState;
  private subscribers: Set<(state: DemoState) => void> = new Set();
  private idempotencyKeys: Set<string> = new Set();

  constructor() {
    this.state = this.loadFromStorage();
  }

  private loadFromStorage(): DemoState {
    try {
      const saved = localStorage.getItem('demoDataStore');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          lastUpdated: new Date(parsed.lastUpdated),
          trades: parsed.trades?.map((t: any) => ({
            ...t,
            timestamp: new Date(t.timestamp),
          })) || [],
        };
      }
    } catch (e) {
      console.error('Failed to load demo data store:', e);
    }
    return { ...DEFAULT_STATE };
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('demoDataStore', JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save demo data store:', e);
    }
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }

  subscribe(callback: (state: DemoState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state); // Initial call
    return () => this.subscribers.delete(callback);
  }

  getState(): DemoState {
    return { ...this.state };
  }

  getBalance(): number {
    return this.state.balance;
  }

  updateBalance(delta: number, idempotencyKey?: string): boolean {
    // Check idempotency to prevent duplicate updates
    if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) {
      console.debug(`DemoDataStore: Ignoring duplicate update with key ${idempotencyKey}`);
      return false;
    }

    if (idempotencyKey) {
      this.idempotencyKeys.add(idempotencyKey);
      // Clean up old keys after 1 minute
      setTimeout(() => this.idempotencyKeys.delete(idempotencyKey), 60000);
    }

    this.state = {
      ...this.state,
      balance: this.state.balance + delta,
      lastUpdated: new Date(),
      version: this.state.version + 1,
    };

    this.saveToStorage();
    this.notifySubscribers();
    eventBus.emit('balance:updated', { newBalance: this.state.balance, source: 'trade' });

    return true;
  }

  setBalance(balance: number): void {
    this.state = {
      ...this.state,
      balance,
      lastUpdated: new Date(),
      version: this.state.version + 1,
    };

    this.saveToStorage();
    this.notifySubscribers();
    eventBus.emit('balance:updated', { newBalance: balance, source: 'manual' });
  }

  addTrade(trade: Omit<DemoTrade, 'id'>): DemoTrade {
    const newTrade: DemoTrade = {
      ...trade,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };

    this.state = {
      ...this.state,
      trades: [newTrade, ...this.state.trades].slice(0, 100), // Keep last 100 trades
      lastUpdated: new Date(),
      version: this.state.version + 1,
    };

    this.saveToStorage();
    this.notifySubscribers();

    return newTrade;
  }

  getTrades(): DemoTrade[] {
    return [...this.state.trades];
  }

  reset(): void {
    this.state = { ...DEFAULT_STATE, lastUpdated: new Date() };
    this.idempotencyKeys.clear();
    this.saveToStorage();
    this.notifySubscribers();
  }
}

export const demoDataStore = new DemoDataStore();
export type { DemoState, DemoTrade };
