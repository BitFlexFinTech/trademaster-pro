/**
 * MASTER PROFIT CALCULATOR - Single source of truth for all profit calculations
 * 
 * This utility ensures consistent profit calculation across the entire codebase.
 * All trade closures MUST use this calculator.
 */

import { getFeeRate } from './exchangeFees';

export interface ProfitCalculation {
  grossProfit: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  netProfit: number;
  profitPercent: number;
  isAboveThreshold: boolean;
  shouldClose: boolean;
  reason: string;
}

export interface TradeContext {
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  exchange: string;
  direction: 'long' | 'short';
  minProfitThreshold?: number;
}

// Minimum profit threshold in dollars - $1 NET profit target
// This is the ONLY exit condition - no stop loss, hold until profitable
export const DEFAULT_MIN_PROFIT_THRESHOLD = 1.00; // $1.00 minimum NET profit

/**
 * MASTER PROFIT CALCULATION FUNCTION
 * 
 * All profit calculations in the app MUST flow through this function.
 * This ensures fees are always deducted and thresholds are checked.
 * 
 * @param context - Trade context with all required parameters
 * @returns Complete profit calculation with all checks
 */
export function calculateTradeProfitWithFees(context: TradeContext): ProfitCalculation {
  const {
    entryPrice,
    currentPrice,
    positionSize,
    exchange,
    direction,
    minProfitThreshold = DEFAULT_MIN_PROFIT_THRESHOLD,
  } = context;

  // STEP 1: Validate inputs
  if (!entryPrice || entryPrice <= 0) {
    console.error('❌ PROFIT CALC ERROR: Invalid entry price:', entryPrice);
    return createFailedResult('Invalid entry price - trade cannot be profitable');
  }

  if (!currentPrice || currentPrice <= 0) {
    console.error('❌ PROFIT CALC ERROR: Invalid current price:', currentPrice);
    return createFailedResult('Invalid current price - cannot calculate profit');
  }

  if (!positionSize || positionSize <= 0) {
    console.error('❌ PROFIT CALC ERROR: Invalid position size:', positionSize);
    return createFailedResult('Invalid position size');
  }

  // STEP 2: Get exchange fee rate
  const feeRate = getFeeRate(exchange);

  // STEP 3: Calculate gross profit based on direction
  let grossProfit: number;
  if (direction === 'long') {
    // LONG: profit when price goes UP (current > entry)
    grossProfit = ((currentPrice - entryPrice) / entryPrice) * positionSize;
  } else {
    // SHORT: profit when price goes DOWN (entry > current)
    grossProfit = ((entryPrice - currentPrice) / entryPrice) * positionSize;
  }

  // STEP 4: Calculate trading fees (ALWAYS deduct these)
  const buyFee = positionSize * feeRate;
  const sellValue = positionSize + Math.max(0, grossProfit);
  const sellFee = sellValue * feeRate;
  const totalFees = buyFee + sellFee;

  // STEP 5: Calculate net profit AFTER fees
  const netProfit = grossProfit - totalFees;

  // STEP 6: Calculate profit percentage
  const profitPercent = (netProfit / positionSize) * 100;

  // STEP 7: Check threshold
  const isAboveThreshold = netProfit >= minProfitThreshold;
  const effectiveThreshold = Math.max(minProfitThreshold, totalFees * 1.5);
  const shouldClose = netProfit >= effectiveThreshold;

  // STEP 8: Log for debugging
  logProfitCalculation({
    entryPrice,
    currentPrice,
    positionSize,
    exchange,
    direction,
    grossProfit,
    buyFee,
    sellFee,
    netProfit,
    profitPercent,
    minProfitThreshold,
    isAboveThreshold,
    shouldClose,
  });

  return {
    grossProfit,
    buyFee,
    sellFee,
    totalFees,
    netProfit,
    profitPercent,
    isAboveThreshold,
    shouldClose,
    reason: shouldClose 
      ? `Net profit $${netProfit.toFixed(4)} exceeds threshold $${effectiveThreshold.toFixed(4)}`
      : `Net profit $${netProfit.toFixed(4)} below threshold $${effectiveThreshold.toFixed(4)}`,
  };
}

/**
 * Quick check if a trade is profitable after fees
 */
export function isProfitableAfterFees(context: TradeContext): boolean {
  const result = calculateTradeProfitWithFees(context);
  return result.netProfit > 0;
}

/**
 * Get minimum exit price needed for profit
 */
export function getMinimumExitPriceForProfit(
  entryPrice: number,
  positionSize: number,
  exchange: string,
  targetProfit: number = DEFAULT_MIN_PROFIT_THRESHOLD,
  direction: 'long' | 'short' = 'long'
): number {
  const feeRate = getFeeRate(exchange);
  const totalFees = positionSize * feeRate * 2; // Round-trip fees
  const requiredGrossProfit = targetProfit + totalFees;
  const priceChangeRatio = requiredGrossProfit / positionSize;

  if (direction === 'long') {
    return entryPrice * (1 + priceChangeRatio);
  } else {
    return entryPrice * (1 - priceChangeRatio);
  }
}

/**
 * Validate a trade BEFORE closing - returns true only if profitable
 */
export function validateTradeBeforeClose(context: TradeContext): {
  canClose: boolean;
  netProfit: number;
  reason: string;
} {
  const result = calculateTradeProfitWithFees(context);
  
  return {
    canClose: result.shouldClose,
    netProfit: result.netProfit,
    reason: result.reason,
  };
}

// Helper function for logging
function logProfitCalculation(data: {
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  exchange: string;
  direction: string;
  grossProfit: number;
  buyFee: number;
  sellFee: number;
  netProfit: number;
  profitPercent: number;
  minProfitThreshold: number;
  isAboveThreshold: boolean;
  shouldClose: boolean;
}): void {
  console.group('💰 PROFIT CALCULATION');
  console.log('Trade ID:', crypto.randomUUID().slice(0, 8));
  console.log('Entry Price:', data.entryPrice.toFixed(6));
  console.log('Current Price:', data.currentPrice.toFixed(6));
  console.log('Position Size:', data.positionSize.toFixed(2));
  console.log('Exchange:', data.exchange);
  console.log('Direction:', data.direction);
  console.log('Gross Profit:', data.grossProfit.toFixed(4));
  console.log('Buy Fee:', data.buyFee.toFixed(4));
  console.log('Sell Fee:', data.sellFee.toFixed(4));
  console.log('Net Profit:', data.netProfit.toFixed(4));
  console.log('Profit %:', data.profitPercent.toFixed(4) + '%');
  console.log('Min Threshold:', data.minProfitThreshold.toFixed(4));
  console.log('Above Threshold:', data.isAboveThreshold);
  console.log('Should Close:', data.shouldClose);
  console.groupEnd();
}

// Helper to create a failed result
function createFailedResult(reason: string): ProfitCalculation {
  return {
    grossProfit: 0,
    buyFee: 0,
    sellFee: 0,
    totalFees: 0,
    netProfit: 0,
    profitPercent: 0,
    isAboveThreshold: false,
    shouldClose: false,
    reason,
  };
}
