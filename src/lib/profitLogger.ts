/**
 * PROFIT CALCULATION LOGGER
 * 
 * Comprehensive logging for all profit calculations.
 * Helps debug $0 profit issues by tracking every step of the calculation.
 */

export interface ProfitLogEntry {
  timestamp: number;
  tradeId: string;
  pair: string;
  exchange: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  exitPrice?: number;
  positionSize: number;
  grossProfit: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  netProfit: number;
  profitPercent: number;
  minThreshold: number;
  shouldClose: boolean;
  reason: string;
  exitReason?: string;
  isWin?: boolean;
}

const profitLogs: ProfitLogEntry[] = [];
const MAX_LOG_SIZE = 1000;

/**
 * Log a profit calculation with full details
 */
export function logProfitCalculation(entry: ProfitLogEntry): void {
  // Add to in-memory log
  profitLogs.push(entry);
  
  // Trim if too large
  if (profitLogs.length > MAX_LOG_SIZE) {
    profitLogs.splice(0, profitLogs.length - MAX_LOG_SIZE);
  }
  
  // Console output with detailed breakdown
  console.group(`💰 PROFIT CALCULATION [${entry.tradeId.slice(0, 8)}]`);
  console.log('═══════════════════════════════════════');
  console.log(`📍 Trade: ${entry.pair} ${entry.direction.toUpperCase()}`);
  console.log(`🏛️ Exchange: ${entry.exchange}`);
  console.log('───────────────────────────────────────');
  console.log(`📊 Entry Price:    $${entry.entryPrice.toFixed(6)}`);
  console.log(`📈 Current Price:  $${entry.currentPrice.toFixed(6)}`);
  if (entry.exitPrice) {
    console.log(`📤 Exit Price:     $${entry.exitPrice.toFixed(6)}`);
  }
  console.log(`💵 Position Size:  $${entry.positionSize.toFixed(2)}`);
  console.log('───────────────────────────────────────');
  console.log(`📈 Gross Profit:   $${entry.grossProfit.toFixed(4)}`);
  console.log(`💳 Buy Fee:        -$${entry.buyFee.toFixed(4)}`);
  console.log(`💳 Sell Fee:       -$${entry.sellFee.toFixed(4)}`);
  console.log(`💳 Total Fees:     -$${entry.totalFees.toFixed(4)}`);
  console.log('───────────────────────────────────────');
  console.log(`💵 NET PROFIT:     $${entry.netProfit.toFixed(4)}`);
  console.log(`📊 Profit %:       ${entry.profitPercent.toFixed(4)}%`);
  console.log('───────────────────────────────────────');
  console.log(`🎯 Min Threshold:  $${entry.minThreshold.toFixed(4)}`);
  console.log(`✅ Should Close:   ${entry.shouldClose ? 'YES' : 'NO'}`);
  console.log(`📝 Reason:         ${entry.reason}`);
  if (entry.exitReason) {
    console.log(`🚪 Exit Reason:    ${entry.exitReason}`);
  }
  if (entry.isWin !== undefined) {
    console.log(`🏆 Is Win:         ${entry.isWin ? '✅ YES' : '❌ NO'}`);
  }
  console.log('═══════════════════════════════════════');
  console.groupEnd();
}

/**
 * Log when a trade is opened
 */
export function logTradeOpened(data: {
  tradeId: string;
  pair: string;
  exchange: string;
  direction: 'long' | 'short';
  entryPrice: number;
  positionSize: number;
}): void {
  console.group(`🚀 TRADE OPENED [${data.tradeId.slice(0, 8)}]`);
  console.log('═══════════════════════════════════════');
  console.log(`📍 Trade: ${data.pair} ${data.direction.toUpperCase()}`);
  console.log(`🏛️ Exchange: ${data.exchange}`);
  console.log(`📊 Entry Price: $${data.entryPrice.toFixed(6)}`);
  console.log(`💵 Position Size: $${data.positionSize.toFixed(2)}`);
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════');
  console.groupEnd();
}

/**
 * Log when a trade is closed
 */
export function logTradeClosed(data: {
  tradeId: string;
  pair: string;
  exchange: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  netProfit: number;
  holdTimeMs: number;
  exitReason: string;
  isWin: boolean;
}): void {
  const emoji = data.isWin ? '🎉' : '📉';
  console.group(`${emoji} TRADE CLOSED [${data.tradeId.slice(0, 8)}]`);
  console.log('═══════════════════════════════════════');
  console.log(`📍 Trade: ${data.pair} ${data.direction.toUpperCase()}`);
  console.log(`🏛️ Exchange: ${data.exchange}`);
  console.log(`📊 Entry Price: $${data.entryPrice.toFixed(6)}`);
  console.log(`📤 Exit Price: $${data.exitPrice.toFixed(6)}`);
  console.log(`💵 Position Size: $${data.positionSize.toFixed(2)}`);
  console.log('───────────────────────────────────────');
  console.log(`💰 NET PROFIT: $${data.netProfit.toFixed(4)}`);
  console.log(`⏱️ Hold Time: ${(data.holdTimeMs / 1000).toFixed(1)}s`);
  console.log(`🚪 Exit Reason: ${data.exitReason}`);
  console.log(`🏆 Result: ${data.isWin ? '✅ WIN' : '❌ LOSS'}`);
  console.log('═══════════════════════════════════════');
  console.groupEnd();
}

/**
 * Log a profit calculation error
 */
export function logProfitError(error: {
  tradeId: string;
  message: string;
  entryPrice?: number;
  currentPrice?: number;
  positionSize?: number;
}): void {
  console.group(`❌ PROFIT CALC ERROR [${error.tradeId.slice(0, 8)}]`);
  console.error('═══════════════════════════════════════');
  console.error(`⚠️ Error: ${error.message}`);
  if (error.entryPrice !== undefined) {
    console.error(`📊 Entry Price: ${error.entryPrice === 0 ? '⚠️ ZERO!' : `$${error.entryPrice.toFixed(6)}`}`);
  }
  if (error.currentPrice !== undefined) {
    console.error(`📈 Current Price: ${error.currentPrice === 0 ? '⚠️ ZERO!' : `$${error.currentPrice.toFixed(6)}`}`);
  }
  if (error.positionSize !== undefined) {
    console.error(`💵 Position Size: ${error.positionSize === 0 ? '⚠️ ZERO!' : `$${error.positionSize.toFixed(2)}`}`);
  }
  console.error('═══════════════════════════════════════');
  console.groupEnd();
}

/**
 * Get all profit logs
 */
export function getProfitLogs(): ProfitLogEntry[] {
  return [...profitLogs];
}

/**
 * Get recent profit logs (last N)
 */
export function getRecentProfitLogs(count: number = 20): ProfitLogEntry[] {
  return profitLogs.slice(-count);
}

/**
 * Get profit logs for a specific trade
 */
export function getTradeLog(tradeId: string): ProfitLogEntry | undefined {
  return profitLogs.find(log => log.tradeId === tradeId);
}

/**
 * Clear all logs
 */
export function clearProfitLogs(): void {
  profitLogs.length = 0;
}

/**
 * Export logs as JSON for debugging
 */
export function exportLogsAsJson(): string {
  return JSON.stringify(profitLogs, null, 2);
}

/**
 * Get summary of profit calculations
 */
export function getLogSummary(): {
  totalLogs: number;
  wins: number;
  losses: number;
  totalProfit: number;
  avgProfit: number;
  zeroProfit: number;
} {
  const closedTrades = profitLogs.filter(log => log.isWin !== undefined);
  const wins = closedTrades.filter(log => log.isWin).length;
  const losses = closedTrades.filter(log => !log.isWin).length;
  const totalProfit = closedTrades.reduce((sum, log) => sum + log.netProfit, 0);
  const zeroProfit = closedTrades.filter(log => log.netProfit === 0).length;
  
  return {
    totalLogs: profitLogs.length,
    wins,
    losses,
    totalProfit,
    avgProfit: closedTrades.length > 0 ? totalProfit / closedTrades.length : 0,
    zeroProfit,
  };
}
