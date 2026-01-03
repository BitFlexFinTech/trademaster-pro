// ============================================
// Bot Store Type Definitions
// Centralized state management types
// ============================================

export interface Bot {
  id: string;
  name: string;
  type: 'spot' | 'leverage';
  status: 'running' | 'stopped';
  mode: 'demo' | 'live';
  
  // Configuration
  dailyTarget: number;
  profitPerTrade: number;
  amountPerTrade: number;
  tradeIntervalMs: number;
  allocatedCapital: number;
  
  // Performance Metrics
  currentPnL: number;
  tradesExecuted: number;
  hitRate: number;
  maxDrawdown: number;
  
  // Timing
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  entryPrice: number;
  entryValue: number;
  quantity: number;
  leverage: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  openedAt: string;
  tradeId?: string;
}

export interface MarketData {
  prices: Record<string, number>;
  volumes: Record<string, number>;
  changes24h: Record<string, number>;
  pairsScanned: number;
  lastUpdate: number;
  isScanning: boolean;
}

export interface Order {
  id: string;
  symbol: string;
  exchange: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  status: 'pending' | 'executing' | 'filled' | 'failed';
  createdAt: number;
}

export interface ExecutionMetrics {
  avgExecutionTimeMs: number;
  lastExecutionTimeMs: number;
  tradesPerMinute: number;
  successRate: number;
  recentExecutions: Array<{
    tradeId: string;
    durationMs: number;
    timestamp: number;
    success: boolean;
  }>;
}

export interface ScannerOpportunity {
  symbol: string;
  exchange: string;
  timeframe: string;
  direction: 'long' | 'short';
  confidence: number;
  volatility: number;
  expectedDurationMs: number;
  priority: number;
  timestamp: number;
}

export interface CapitalMetrics {
  totalCapital: number;
  deployedCapital: number;
  idleFunds: number;
  utilization: number;
  byExchange: Record<string, {
    total: number;
    deployed: number;
    available: number;
  }>;
}

export interface CapitalHistoryPoint {
  timestamp: number;
  deployed: number;
  idle: number;
  total: number;
  utilization: number;
}

export interface IdleCapitalAlertConfig {
  enabled: boolean;
  thresholdAmount: number;
  thresholdPercent: number;
  maxIdleDurationMs: number;
}

export interface AutoDeployConfig {
  enabled: boolean;
  minIdleFunds: number;
  maxPositions: number;
  minConfidence: number;
  preferredExchanges: string[];
  excludePairs: string[];
}

export interface CapitalEfficiencyMetrics {
  score: number;
  utilizationRate: number;
  deploymentSpeed: number;
  avgIdleTime: number;
  trend: 'improving' | 'stable' | 'declining';
  history: Array<{ timestamp: number; score: number }>;
}

export interface ExchangeBalance {
  exchange: string;
  total: number;
  available: number;
  inPositions: number;
}

export interface BotState {
  // ===== Bot Data =====
  bots: Bot[];
  activeBotId: string | null;
  
  // ===== Real-Time Metrics =====
  marketData: MarketData;
  capitalMetrics: CapitalMetrics;
  executionMetrics: ExecutionMetrics;
  positions: Position[];
  opportunities: ScannerOpportunity[];
  
  // ===== Trading Engine Status =====
  isTrading: boolean;
  isSyncing: boolean;
  lastSyncTime: number;
  deploymentQueue: Order[];
  
  // ===== Exchange Balances (real data) =====
  exchangeBalances: ExchangeBalance[];
  
  // ===== UI State =====
  isLoading: boolean;
  error: string | null;
  
  // ===== Actions =====
  // Bot Management
  updateBot: (id: string, data: Partial<Bot>) => void;
  setActiveBot: (id: string | null) => void;
  addBot: (bot: Bot) => void;
  removeBot: (id: string) => void;
  
  // Data Sync
  syncAllData: () => Promise<void>;
  syncBots: () => Promise<void>;
  syncPositions: () => Promise<void>;
  
  // Trading Engine
  startTradingEngine: () => void;
  stopTradingEngine: () => void;
  deployIdleFunds: () => Promise<void>;
  forceCloseAllPositions: () => void;
  
  // Position Management
  addPosition: (position: Position) => void;
  updatePosition: (id: string, data: Partial<Position>) => void;
  removePosition: (id: string) => void;
  
  // Market Data
  updateMarketData: (data: Partial<MarketData>) => void;
  addOpportunity: (opportunity: ScannerOpportunity) => void;
  clearOpportunities: () => void;
  
  // Capital Metrics
  updateCapitalMetrics: (metrics: Partial<CapitalMetrics>) => void;
  calculateCapitalUtilization: () => void;
  
  // Exchange Balances
  setExchangeBalances: (balances: ExchangeBalance[]) => void;
  
  // Position Prices (real-time from WebSocket)
  updatePositionPrices: (prices: Record<string, number>) => void;
  
  // Capital History
  capitalHistory: CapitalHistoryPoint[];
  addCapitalHistoryPoint: () => void;
  
  // Idle Capital Alerts
  idleCapitalAlert: IdleCapitalAlertConfig;
  idleStartTime: number | null;
  setIdleAlertConfig: (config: Partial<IdleCapitalAlertConfig>) => void;
  checkIdleCapitalAlert: () => void;
  
  // Auto-Deploy Config
  autoDeployConfig: AutoDeployConfig;
  setAutoDeployConfig: (config: Partial<AutoDeployConfig>) => void;
  
  // Capital Efficiency
  capitalEfficiency: CapitalEfficiencyMetrics;
  calculateEfficiencyScore: () => void;
  
  // Execution Metrics
  recordExecution: (tradeId: string, durationMs: number, success: boolean) => void;
  
  // Deployment Queue
  addToQueue: (order: Order) => void;
  removeFromQueue: (orderId: string) => void;
  processQueue: () => Promise<void>;
  
  // Error Handling
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}
