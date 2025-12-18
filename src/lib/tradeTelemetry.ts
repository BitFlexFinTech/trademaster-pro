/**
 * Trade Telemetry System
 * Comprehensive logging for GREENBACK micro-scalping strategy
 * Tracks every decision, fees, slippage, latency, and regime state
 */

import { GREENBACK_CONFIG } from './greenbackConfig';
import { MicroScalpSignal } from './microScalpSignal';

export type TradeDecision = 'ALLOWED' | 'BLOCKED';

export interface TelemetryEntry {
  id: string;
  timestamp: number;
  decision: TradeDecision;
  reason: string;
  
  // Trade details
  pair?: string;
  direction?: 'long' | 'short';
  entryPrice?: number;
  exitPrice?: number;
  positionSize?: number;
  leverage?: number;
  
  // P&L
  grossPnL?: number;
  netPnL?: number;
  fees?: number;
  
  // Quality metrics
  signal?: MicroScalpSignal;
  signalQuality?: number;
  confluence?: number;
  
  // Execution metrics
  slippage?: number;
  slippagePct?: number;
  latencyMs?: number;
  spreadBps?: number;
  
  // Regime state
  regimeState?: 'trending' | 'ranging' | 'volatile' | 'unknown';
  volatility?: number;
  
  // Session context
  dailyPnL?: number;
  dailyTrades?: number;
  sessionHitRate?: number;
  consecutiveLosses?: number;
  consecutiveWins?: number;
}

export interface SessionStats {
  startTime: number;
  trades: number;
  wins: number;
  losses: number;
  totalPnL: number;
  totalFees: number;
  avgSlippage: number;
  avgLatency: number;
  hitRate: number;
  maxDrawdown: number;
  currentDrawdown: number;
  peakPnL: number;
}

// In-memory telemetry store (last 100 entries)
const MAX_ENTRIES = 100;
let telemetryLog: TelemetryEntry[] = [];
let sessionStats: SessionStats = createEmptySessionStats();

function createEmptySessionStats(): SessionStats {
  return {
    startTime: Date.now(),
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnL: 0,
    totalFees: 0,
    avgSlippage: 0,
    avgLatency: 0,
    hitRate: 100,
    maxDrawdown: 0,
    currentDrawdown: 0,
    peakPnL: 0,
  };
}

function generateEntryId(): string {
  return `TEL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Log a trade decision (allowed or blocked)
 */
export function logTradeDecision(
  decision: TradeDecision,
  reason: string,
  details: Partial<TelemetryEntry> = {}
): TelemetryEntry {
  const entry: TelemetryEntry = {
    id: generateEntryId(),
    timestamp: Date.now(),
    decision,
    reason,
    ...details,
  };
  
  // Add to log (FIFO, max 100 entries)
  telemetryLog.push(entry);
  if (telemetryLog.length > MAX_ENTRIES) {
    telemetryLog.shift();
  }
  
  // Console log for debugging
  const emoji = decision === 'ALLOWED' ? '✅' : '🚫';
  console.log(`${emoji} [TELEMETRY] ${decision}: ${reason}`, 
    details.pair ? `| ${details.pair}` : '',
    details.direction ? details.direction.toUpperCase() : '',
    details.netPnL !== undefined ? `| P&L: $${details.netPnL.toFixed(3)}` : ''
  );
  
  return entry;
}

/**
 * Log a completed trade with full metrics
 */
export function logCompletedTrade(
  pair: string,
  direction: 'long' | 'short',
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  grossPnL: number,
  fees: number,
  slippage: number,
  latencyMs: number,
  signal?: MicroScalpSignal
): TelemetryEntry {
  const netPnL = grossPnL - fees;
  const isWin = netPnL > 0;
  
  // Update session stats
  sessionStats.trades++;
  if (isWin) {
    sessionStats.wins++;
  } else {
    sessionStats.losses++;
  }
  sessionStats.totalPnL += netPnL;
  sessionStats.totalFees += fees;
  
  // Update averages
  sessionStats.avgSlippage = 
    ((sessionStats.avgSlippage * (sessionStats.trades - 1)) + slippage) / sessionStats.trades;
  sessionStats.avgLatency = 
    ((sessionStats.avgLatency * (sessionStats.trades - 1)) + latencyMs) / sessionStats.trades;
  
  // Update hit rate
  sessionStats.hitRate = (sessionStats.wins / sessionStats.trades) * 100;
  
  // Update drawdown tracking
  if (sessionStats.totalPnL > sessionStats.peakPnL) {
    sessionStats.peakPnL = sessionStats.totalPnL;
    sessionStats.currentDrawdown = 0;
  } else {
    sessionStats.currentDrawdown = sessionStats.peakPnL - sessionStats.totalPnL;
    if (sessionStats.currentDrawdown > sessionStats.maxDrawdown) {
      sessionStats.maxDrawdown = sessionStats.currentDrawdown;
    }
  }
  
  const entry = logTradeDecision('ALLOWED', isWin ? 'Trade completed (WIN)' : 'Trade completed (LOSS)', {
    pair,
    direction,
    entryPrice,
    exitPrice,
    positionSize,
    grossPnL,
    netPnL,
    fees,
    slippage,
    slippagePct: (slippage / entryPrice) * 100,
    latencyMs,
    signal,
    signalQuality: signal?.confidence,
    confluence: signal?.confluence,
    dailyPnL: sessionStats.totalPnL,
    dailyTrades: sessionStats.trades,
    sessionHitRate: sessionStats.hitRate,
  });
  
  return entry;
}

/**
 * Log a blocked trade
 */
export function logBlockedTrade(
  reason: string,
  details: {
    pair?: string;
    direction?: 'long' | 'short';
    spreadBps?: number;
    slippage?: number;
    latencyMs?: number;
    signal?: MicroScalpSignal;
  } = {}
): TelemetryEntry {
  return logTradeDecision('BLOCKED', reason, details);
}

/**
 * Log spread guard activation
 */
export function logSpreadGuard(pair: string, spreadBps: number): TelemetryEntry {
  return logBlockedTrade(
    `Spread guard: ${spreadBps.toFixed(2)}bps > ${GREENBACK_CONFIG.spread_threshold_bps}bps threshold`,
    { pair, spreadBps }
  );
}

/**
 * Log slippage guard activation
 */
export function logSlippageGuard(
  pair: string,
  expectedSlippage: number,
  targetPnL: number
): TelemetryEntry {
  const slippagePct = (expectedSlippage / targetPnL) * 100;
  return logBlockedTrade(
    `Slippage guard: ${slippagePct.toFixed(1)}% of target > ${GREENBACK_CONFIG.slippage_block_pct_of_target * 100}% threshold`,
    { pair, slippage: expectedSlippage }
  );
}

/**
 * Log latency guard activation
 */
export function logLatencyGuard(latencyMs: number): TelemetryEntry {
  return logBlockedTrade(
    `Latency guard: ${latencyMs}ms > ${GREENBACK_CONFIG.latency_pause_ms}ms threshold`,
    { latencyMs }
  );
}

/**
 * Log daily loss limit reached
 */
export function logDailyLossLimit(dailyPnL: number, limit: number): TelemetryEntry {
  return logBlockedTrade(
    `Daily loss limit reached: $${dailyPnL.toFixed(2)} <= -$${limit.toFixed(2)}`,
    {}
  );
}

/**
 * Log session halt (consecutive losses or low win rate)
 */
export function logSessionHalt(
  reason: 'consecutive_losses' | 'low_win_rate',
  details: { consecutiveLosses?: number; winRate?: number }
): TelemetryEntry {
  let message: string;
  if (reason === 'consecutive_losses') {
    message = `Session halt: ${details.consecutiveLosses} consecutive losses >= ${GREENBACK_CONFIG.session_halt.consecutive_losses}`;
  } else {
    message = `Session halt: Win rate ${details.winRate?.toFixed(1)}% < ${GREENBACK_CONFIG.session_halt.min_win_rate_20_trades * 100}%`;
  }
  
  return logBlockedTrade(message, {
    signal: undefined,
  });
}

/**
 * Get recent telemetry entries
 */
export function getTelemetryLog(): TelemetryEntry[] {
  return [...telemetryLog];
}

/**
 * Get current session stats
 */
export function getSessionStats(): SessionStats {
  return { ...sessionStats };
}

/**
 * Reset session stats (call at start of new trading day)
 */
export function resetSessionStats(): void {
  sessionStats = createEmptySessionStats();
  console.log('📊 [TELEMETRY] Session stats reset');
}

/**
 * Export telemetry data as JSON
 */
export function exportTelemetry(): string {
  return JSON.stringify({
    sessionStats,
    entries: telemetryLog,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Calculate trade expectancy
 */
export function calculateExpectancy(): number {
  if (sessionStats.trades === 0) return 0;
  
  const avgWin = sessionStats.wins > 0 
    ? sessionStats.totalPnL / sessionStats.wins 
    : 0;
  const avgLoss = sessionStats.losses > 0 
    ? Math.abs(sessionStats.totalPnL) / sessionStats.losses 
    : 0;
  
  const winRate = sessionStats.hitRate / 100;
  return (winRate * avgWin) - ((1 - winRate) * avgLoss);
}

/**
 * Check if trading should be halted based on session stats
 */
export function shouldHaltTrading(): { halt: boolean; reason: string } {
  // Check daily loss limit
  const maxDailyLoss = GREENBACK_CONFIG.equity_start_usd * GREENBACK_CONFIG.max_daily_loss_pct;
  if (sessionStats.totalPnL <= -maxDailyLoss) {
    return { halt: true, reason: `Daily loss limit reached: $${sessionStats.totalPnL.toFixed(2)}` };
  }
  
  // Check win rate over last 20 trades (only if we have 20+ trades)
  if (sessionStats.trades >= 20) {
    if (sessionStats.hitRate < GREENBACK_CONFIG.session_halt.min_win_rate_20_trades * 100) {
      return { 
        halt: true, 
        reason: `Win rate ${sessionStats.hitRate.toFixed(1)}% < ${GREENBACK_CONFIG.session_halt.min_win_rate_20_trades * 100}%` 
      };
    }
  }
  
  return { halt: false, reason: '' };
}
