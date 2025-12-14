export interface PaperOrder {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  timestamp: Date;
  exchange: string;
}

export interface Position {
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  amount: number;
  unrealizedPnl: number;
  exchange: string;
}

export interface Balance {
  exchange: string;
  available: number;
  inPosition: number;
  total: number;
}

export interface SandboxExchangeAdapter {
  name: string;
  maxLeverage: number;
  fees: { maker: number; taker: number };
  
  placeOrderPaper(order: Omit<PaperOrder, 'id' | 'timestamp'>): Promise<{
    success: boolean;
    orderId: string;
    fillPrice: number;
    slippage: number;
    fee: number;
  }>;
  
  getPositions(): Position[];
  getBalance(): Balance;
  resetBalance(amount: number): void;
}

export interface PaperTestResult {
  passed: boolean;
  hitRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  tradesSkipped: number;
  totalPnL: number;
  avgSignalScore: number;
  avgConfluence: number;
  failedTradesBreakdown: FailedTradeReason[];
}

export interface FailedTradeReason {
  reason: string;
  count: number;
  avgScore: number;
  avgConfluence: number;
}

export interface ThresholdConfig {
  minSignalScore: number;
  minConfluence: number;
  minVolumeRatio: number;
  targetHitRate: number;
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  minSignalScore: 0.85,
  minConfluence: 2,
  minVolumeRatio: 1.2,
  targetHitRate: 80,
};
