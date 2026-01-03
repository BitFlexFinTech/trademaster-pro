// ============================================
// Memoized Selectors for Bot Store
// Prevent unnecessary re-renders
// ============================================

import type { BotState, Bot, Position } from './types';

// ===== Bot Selectors =====
export const selectBotById = (id: string) => 
  (state: BotState) => state.bots.find(b => b.id === id);

export const selectActiveBot = (state: BotState) => 
  state.bots.find(b => b.id === state.activeBotId);

export const selectRunningBots = (state: BotState) => 
  state.bots.filter(b => b.status === 'running');

export const selectStoppedBots = (state: BotState) => 
  state.bots.filter(b => b.status === 'stopped');

export const selectSpotBot = (state: BotState) => 
  state.bots.find(b => b.type === 'spot' && b.status === 'running');

export const selectLeverageBot = (state: BotState) => 
  state.bots.find(b => b.type === 'leverage' && b.status === 'running');

// ===== PnL Selectors =====
export const selectTotalPnL = (state: BotState) => 
  state.bots.reduce((sum, b) => sum + b.currentPnL, 0);

export const selectRunningPnL = (state: BotState) => 
  state.bots
    .filter(b => b.status === 'running')
    .reduce((sum, b) => sum + b.currentPnL, 0);

export const selectTotalTrades = (state: BotState) => 
  state.bots.reduce((sum, b) => sum + b.tradesExecuted, 0);

export const selectAverageHitRate = (state: BotState) => {
  const runningBots = state.bots.filter(b => b.status === 'running');
  if (runningBots.length === 0) return 0;
  return runningBots.reduce((sum, b) => sum + b.hitRate, 0) / runningBots.length;
};

// ===== Position Selectors =====
export const selectPositionsByExchange = (exchange: string) => 
  (state: BotState) => state.positions.filter(p => p.exchange === exchange);

export const selectPositionsBySymbol = (symbol: string) => 
  (state: BotState) => state.positions.filter(p => p.symbol === symbol);

export const selectTotalUnrealizedPnL = (state: BotState) => 
  state.positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);

export const selectPositionCount = (state: BotState) => 
  state.positions.length;

export const selectLongPositions = (state: BotState) => 
  state.positions.filter(p => p.side === 'long');

export const selectShortPositions = (state: BotState) => 
  state.positions.filter(p => p.side === 'short');

// ===== Capital Selectors =====
export const selectCapitalUtilization = (state: BotState) => 
  state.capitalMetrics.utilization;

export const selectIdleFunds = (state: BotState) => 
  state.capitalMetrics.idleFunds;

export const selectDeployedCapital = (state: BotState) => 
  state.capitalMetrics.deployedCapital;

// ===== Market Data Selectors =====
export const selectPriceForSymbol = (symbol: string) => 
  (state: BotState) => state.marketData.prices[symbol];

export const selectIsScanning = (state: BotState) => 
  state.marketData.isScanning;

export const selectPairsScanned = (state: BotState) => 
  state.marketData.pairsScanned;

export const selectTopOpportunity = (state: BotState) => 
  state.opportunities[0];

export const selectOpportunityCount = (state: BotState) => 
  state.opportunities.length;

// ===== Execution Selectors =====
export const selectAvgExecutionTime = (state: BotState) => 
  state.executionMetrics.avgExecutionTimeMs;

export const selectTradesPerMinute = (state: BotState) => 
  state.executionMetrics.tradesPerMinute;

export const selectExecutionSuccessRate = (state: BotState) => 
  state.executionMetrics.successRate;

// ===== Status Selectors =====
export const selectIsTrading = (state: BotState) => 
  state.isTrading;

export const selectIsSyncing = (state: BotState) => 
  state.isSyncing;

export const selectIsLoading = (state: BotState) => 
  state.isLoading;

export const selectHasError = (state: BotState) => 
  state.error !== null;

export const selectError = (state: BotState) => 
  state.error;

// ===== Composite Selectors =====
export const selectBotSummary = (state: BotState) => ({
  totalBots: state.bots.length,
  runningBots: state.bots.filter(b => b.status === 'running').length,
  totalPnL: state.bots.reduce((sum, b) => sum + b.currentPnL, 0),
  totalTrades: state.bots.reduce((sum, b) => sum + b.tradesExecuted, 0),
  avgHitRate: (() => {
    const running = state.bots.filter(b => b.status === 'running');
    return running.length > 0 
      ? running.reduce((sum, b) => sum + b.hitRate, 0) / running.length 
      : 0;
  })(),
});

export const selectTradingStatus = (state: BotState) => ({
  isTrading: state.isTrading,
  isSyncing: state.isSyncing,
  isLoading: state.isLoading,
  hasError: state.error !== null,
  lastSyncTime: state.lastSyncTime,
});

export const selectCapitalSummary = (state: BotState) => ({
  total: state.capitalMetrics.totalCapital,
  deployed: state.capitalMetrics.deployedCapital,
  idle: state.capitalMetrics.idleFunds,
  utilization: state.capitalMetrics.utilization,
  positionCount: state.positions.length,
});
