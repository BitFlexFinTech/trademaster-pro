// Shared exchange configuration for consistent allocation across components

export interface ExchangeConfig {
  name: string;
  maxLeverage: number;
  confidence: 'High' | 'Medium' | 'Low';
  notes?: string;
}

// Allocation percentages based on confidence level
export const EXCHANGE_ALLOCATION_PERCENTAGES = {
  High: 0.35,
  Medium: 0.20,
  Low: 0.10,
} as const;

export const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  { name: 'Binance', maxLeverage: 20, confidence: 'High', notes: 'Best liquidity' },
  { name: 'OKX', maxLeverage: 20, confidence: 'High', notes: 'Low fees' },
  { name: 'Bybit', maxLeverage: 25, confidence: 'Medium', notes: 'Fast execution' },
  { name: 'Kraken', maxLeverage: 5, confidence: 'Medium', notes: 'Reliable' },
  { name: 'Nexo', maxLeverage: 3, confidence: 'Low', notes: 'Limited pairs' },
];

export const TOP_PAIRS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'];

// Centralized minimum trade amounts per exchange (in USDT)
export const EXCHANGE_MINIMUMS: Record<string, number> = {
  Binance: 10,
  Bybit: 10,
  OKX: 10,
  Kraken: 10,
  Nexo: 10,
  KuCoin: 10,
  Hyperliquid: 10,
};

// Helper function to get minimum trade amount for an exchange
export function getExchangeMinimum(exchange: string): number {
  return EXCHANGE_MINIMUMS[exchange] ?? 10; // Default to 10 if not found
}

// Helper function to calculate allocation for an exchange
export function getExchangeAllocation(config: ExchangeConfig, totalAmount: number): number {
  const percentage = EXCHANGE_ALLOCATION_PERCENTAGES[config.confidence];
  return Math.round(totalAmount * percentage);
}
