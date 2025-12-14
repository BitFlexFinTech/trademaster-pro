import { SandboxExchangeAdapter } from './types';
import { BaseSandboxAdapter } from './adapters/BaseSandboxAdapter';

// Exchange configurations
const EXCHANGE_CONFIGS: Record<string, { fees: { maker: number; taker: number }; maxLeverage: number }> = {
  'Binance': { fees: { maker: 0.001, taker: 0.001 }, maxLeverage: 20 },
  'Bybit': { fees: { maker: 0.001, taker: 0.001 }, maxLeverage: 25 },
  'OKX': { fees: { maker: 0.0008, taker: 0.001 }, maxLeverage: 20 },
  'Kraken': { fees: { maker: 0.0016, taker: 0.0026 }, maxLeverage: 5 },
  'Nexo': { fees: { maker: 0.002, taker: 0.002 }, maxLeverage: 3 },
  'KuCoin': { fees: { maker: 0.001, taker: 0.001 }, maxLeverage: 10 },
  'Hyperliquid': { fees: { maker: 0.0002, taker: 0.0005 }, maxLeverage: 50 },
};

class SandboxAdapterRegistry {
  private adapters: Map<string, SandboxExchangeAdapter> = new Map();
  private initialized = false;

  initialize(connectedExchanges: string[], initialBalance: number = 1000): void {
    this.adapters.clear();
    
    const exchangesToInit = connectedExchanges.length > 0 
      ? connectedExchanges 
      : Object.keys(EXCHANGE_CONFIGS);
    
    const balancePerExchange = initialBalance / exchangesToInit.length;
    
    exchangesToInit.forEach(exchangeName => {
      const config = EXCHANGE_CONFIGS[exchangeName];
      if (config) {
        const adapter = new BaseSandboxAdapter(
          exchangeName,
          config.maxLeverage,
          config.fees,
          balancePerExchange
        );
        this.adapters.set(exchangeName, adapter);
      }
    });
    
    this.initialized = true;
  }

  get(exchange: string): SandboxExchangeAdapter | undefined {
    return this.adapters.get(exchange);
  }

  getAll(): SandboxExchangeAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAllNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  clear(): void {
    this.adapters.clear();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  resetAllBalances(amount: number): void {
    const perExchange = amount / this.adapters.size;
    this.adapters.forEach(adapter => adapter.resetBalance(perExchange));
  }
}

export const sandboxRegistry = new SandboxAdapterRegistry();
