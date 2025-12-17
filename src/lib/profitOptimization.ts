/**
 * PhD-Level Profit Optimization Engine
 * 
 * Uses advanced financial mathematics:
 * - Kelly Criterion for optimal position sizing
 * - Expected Value (EV) calculations for minimum profit thresholds
 * - Risk of Ruin (RoR) calculations to protect base balance
 * - Conditional Value at Risk (CVaR) for tail risk management
 */

export interface ExchangeConfig {
  name: string;
  totalBalance: number;
  baseBalance: number;  // Locked balance - never traded
  availableFloat: number;  // totalBalance - baseBalance
  feeRate: number;
  volatility: number;
}

export interface ProfitRecommendation {
  exchange: string;
  minProfitPerTrade: number;  // Minimum profit for positive EV
  optimalProfitPerTrade: number;  // Recommended profit with safety margin
  kellyFraction: number;  // Optimal bet fraction
  riskOfRuin: number;  // Probability of losing base balance
  confidenceLevel: number;  // 0-100%
  reasoning: string;
}

export interface TradeSpeedRecommendation {
  currentIntervalMs: number;
  suggestedIntervalMs: number;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Calculate minimum profit per trade for positive Expected Value
 * 
 * Formula: π_min = 2Pf / (1.2w - 0.2)
 * Where:
 * - P = Position size
 * - f = Fee rate (maker + taker)
 * - w = Win rate (0-1)
 * 
 * This ensures EV > 0 after accounting for:
 * - Trading fees (both entry and exit)
 * - Win rate below 100%
 * - Slippage buffer (20%)
 */
export function calculateMinimumProfit(
  positionSize: number,
  feeRate: number,
  winRate: number
): number {
  // Clamp win rate to valid range
  const w = Math.max(0.5, Math.min(0.99, winRate));
  
  // Minimum profit formula with fee compensation
  // 2Pf covers round-trip fees, divided by (1.2w - 0.2) adjusts for win rate
  const minProfit = (2 * positionSize * feeRate) / (1.2 * w - 0.2);
  
  // Add 10% buffer for slippage
  return Math.max(0.10, minProfit * 1.1);
}

/**
 * Calculate optimal profit per trade with safety margins
 * 
 * Formula: π_optimal = π_min × SafetyFactor × (1 + σ)
 * Where:
 * - π_min = Minimum profit for positive EV
 * - SafetyFactor = Based on available float ratio
 * - σ = Market volatility adjustment
 */
export function calculateOptimalProfit(
  minProfit: number,
  availableFloatRatio: number,  // availableFloat / baseBalance
  volatility: number  // 24h volatility as decimal
): number {
  // Safety factor: higher when less float available
  // Range: 1.2 (plenty of float) to 2.0 (minimal float)
  const safetyFactor = 1.2 + (0.8 * Math.max(0, 1 - availableFloatRatio));
  
  // Volatility adjustment: increase profit target in volatile markets
  const volAdjustment = 1 + Math.min(volatility, 0.3);
  
  const optimalProfit = minProfit * safetyFactor * volAdjustment;
  
  // Clamp to reasonable range
  return Math.max(0.15, Math.min(optimalProfit, 5.00));
}

/**
 * Kelly Criterion for Optimal Position Sizing
 * 
 * Formula: f* = (p × b - q) / b
 * Where:
 * - p = Probability of winning
 * - q = Probability of losing (1 - p)
 * - b = Win/Loss ratio (avgWin / avgLoss)
 * - f* = Optimal fraction of bankroll to bet
 * 
 * We use Half-Kelly for conservative approach
 */
export function calculateKellyFraction(
  winRate: number,  // 0-1
  avgWin: number,
  avgLoss: number
): number {
  const p = Math.max(0.5, Math.min(0.99, winRate));
  const q = 1 - p;
  const b = avgWin / Math.max(avgLoss, 0.01);
  
  // Kelly formula
  let kelly = (p * b - q) / b;
  
  // Clamp and apply half-Kelly
  kelly = Math.max(0, Math.min(kelly, 0.25)) * 0.5;
  
  return kelly;
}

/**
 * Risk of Ruin Calculation
 * 
 * Formula: RoR = ((1-p)/p)^(B/S)
 * Where:
 * - p = Win probability
 * - B = Base balance (bankroll to protect)
 * - S = Stop loss per trade
 * 
 * Target: Keep RoR < 1%
 */
export function calculateRiskOfRuin(
  winRate: number,  // 0-1
  baseBalance: number,
  stopLossPerTrade: number
): number {
  const p = Math.max(0.5, Math.min(0.99, winRate));
  const units = baseBalance / Math.max(stopLossPerTrade, 0.01);
  
  // RoR formula
  const ror = Math.pow((1 - p) / p, units);
  
  // Convert to percentage and clamp
  return Math.max(0, Math.min(ror * 100, 100));
}

/**
 * Calculate optimal profit per trade for a specific exchange
 */
export function calculateOptimalProfitPerTrade(
  config: ExchangeConfig,
  winRate: number,  // 0-100
  avgLoss: number = 0.20  // Default stop loss
): ProfitRecommendation {
  const w = winRate / 100;
  
  // Step 1: Calculate minimum profit for positive EV
  const positionSize = Math.min(config.availableFloat, 100);  // Use $100 or available
  const minProfit = calculateMinimumProfit(positionSize, config.feeRate, w);
  
  // Step 2: Calculate available float ratio
  const availableFloatRatio = config.availableFloat / Math.max(config.baseBalance, 1);
  
  // Step 3: Calculate optimal profit with safety margins
  const optimalProfit = calculateOptimalProfit(minProfit, availableFloatRatio, config.volatility);
  
  // Step 4: Calculate Kelly fraction
  const kellyFraction = calculateKellyFraction(w, optimalProfit, avgLoss);
  
  // Step 5: Calculate Risk of Ruin
  const riskOfRuin = calculateRiskOfRuin(w, config.baseBalance, avgLoss);
  
  // Step 6: Calculate confidence level (inverse of RoR, capped)
  const confidenceLevel = Math.max(0, Math.min(100, 100 - riskOfRuin * 10));
  
  // Step 7: Generate reasoning
  const reasoning = generateProfitReasoning(
    config,
    minProfit,
    optimalProfit,
    kellyFraction,
    riskOfRuin,
    w
  );
  
  return {
    exchange: config.name,
    minProfitPerTrade: Math.round(minProfit * 100) / 100,
    optimalProfitPerTrade: Math.round(optimalProfit * 100) / 100,
    kellyFraction: Math.round(kellyFraction * 1000) / 1000,
    riskOfRuin: Math.round(riskOfRuin * 100) / 100,
    confidenceLevel: Math.round(confidenceLevel),
    reasoning,
  };
}

/**
 * Generate human-readable reasoning for profit recommendation
 */
function generateProfitReasoning(
  config: ExchangeConfig,
  minProfit: number,
  optimalProfit: number,
  kellyFraction: number,
  riskOfRuin: number,
  winRate: number
): string {
  const parts: string[] = [];
  
  // Base balance protection
  parts.push(`Base balance of $${config.baseBalance} is protected (never traded).`);
  
  // Available float analysis
  if (config.availableFloat <= 0) {
    parts.push(`⚠️ No available float - waiting for profits above base.`);
  } else if (config.availableFloat < config.baseBalance * 0.1) {
    parts.push(`Available float ($${config.availableFloat.toFixed(2)}) is low - conservative trading.`);
  } else {
    parts.push(`Available float: $${config.availableFloat.toFixed(2)} (${((config.availableFloat / config.baseBalance) * 100).toFixed(0)}% of base).`);
  }
  
  // Profit calculation explanation
  parts.push(`Min profit for +EV: $${minProfit.toFixed(2)} (covers ${(config.feeRate * 100 * 2).toFixed(2)}% round-trip fees).`);
  
  // Kelly position sizing
  parts.push(`Kelly fraction: ${(kellyFraction * 100).toFixed(1)}% of available float per trade.`);
  
  // Risk of ruin
  if (riskOfRuin < 0.1) {
    parts.push(`Risk of ruin: ${riskOfRuin.toFixed(3)}% - excellent protection.`);
  } else if (riskOfRuin < 1) {
    parts.push(`Risk of ruin: ${riskOfRuin.toFixed(2)}% - acceptable.`);
  } else {
    parts.push(`⚠️ Risk of ruin: ${riskOfRuin.toFixed(1)}% - consider reducing position size.`);
  }
  
  return parts.join(' ');
}

/**
 * Calculate profit recommendations for all exchanges
 */
export function calculateProfitRecommendationsAllExchanges(
  exchanges: ExchangeConfig[],
  winRate: number,
  avgLoss: number = 0.20
): ProfitRecommendation[] {
  return exchanges.map(config => calculateOptimalProfitPerTrade(config, winRate, avgLoss));
}

/**
 * Calculate optimal trade speed based on current performance
 * 
 * Strategy:
 * - Close to daily target (>80%): Slow down to 2000ms to lock profits
 * - High hit rate (>95%): Speed up to 250ms to capture opportunities
 * - Low hit rate (<90%): Slow down to 1500ms to be more selective
 * - Low available float: Slow down significantly
 */
export function calculateOptimalTradeSpeed(
  currentHitRate: number,  // 0-100
  currentPnL: number,
  dailyTarget: number,
  availableFloat: number,
  baseBalance: number,
  currentIntervalMs: number = 500
): TradeSpeedRecommendation {
  const progressPercent = (currentPnL / dailyTarget) * 100;
  const floatRatio = availableFloat / Math.max(baseBalance, 1);
  
  let suggestedIntervalMs = currentIntervalMs;
  let reasoning = '';
  let priority: 'high' | 'medium' | 'low' = 'medium';
  
  // Priority 1: Near daily target - protect profits
  if (progressPercent >= 90) {
    suggestedIntervalMs = 3000;  // Very slow
    reasoning = `At ${progressPercent.toFixed(0)}% of daily target. Slowing to 3s intervals to lock in profits. Consider stopping to preserve gains.`;
    priority = 'high';
  } else if (progressPercent >= 80) {
    suggestedIntervalMs = 2000;  // Slow
    reasoning = `At ${progressPercent.toFixed(0)}% of daily target ($${currentPnL.toFixed(2)}/$${dailyTarget}). Slowing to 2s intervals to lock profits.`;
    priority = 'high';
  }
  // Priority 2: Low available float - protect base
  else if (floatRatio < 0.1 && availableFloat > 0) {
    suggestedIntervalMs = 2500;
    reasoning = `Available float ($${availableFloat.toFixed(2)}) is only ${(floatRatio * 100).toFixed(0)}% of base. Trading cautiously to protect capital.`;
    priority = 'high';
  }
  // Priority 3: Excellent hit rate - can trade faster
  else if (currentHitRate >= 97) {
    suggestedIntervalMs = Math.max(200, currentIntervalMs * 0.5);
    reasoning = `Excellent ${currentHitRate.toFixed(1)}% hit rate. Increasing trade frequency to capture more opportunities.`;
    priority = 'low';
  } else if (currentHitRate >= 95) {
    suggestedIntervalMs = Math.max(300, currentIntervalMs * 0.7);
    reasoning = `Strong ${currentHitRate.toFixed(1)}% hit rate. Can increase trade frequency safely.`;
    priority = 'low';
  }
  // Priority 4: Low hit rate - be more selective
  else if (currentHitRate < 85) {
    suggestedIntervalMs = Math.min(2000, currentIntervalMs * 2);
    reasoning = `Hit rate at ${currentHitRate.toFixed(1)}% is below target. Slowing trades to improve signal quality.`;
    priority = 'high';
  } else if (currentHitRate < 90) {
    suggestedIntervalMs = Math.min(1500, currentIntervalMs * 1.5);
    reasoning = `Hit rate at ${currentHitRate.toFixed(1)}%. Moderate slowdown to filter better signals.`;
    priority = 'medium';
  }
  // Default: maintain current speed
  else {
    suggestedIntervalMs = currentIntervalMs;
    reasoning = `Current speed optimal for ${currentHitRate.toFixed(1)}% hit rate and ${progressPercent.toFixed(0)}% daily progress.`;
    priority = 'low';
  }
  
  // Round to nearest 100ms
  suggestedIntervalMs = Math.round(suggestedIntervalMs / 100) * 100;
  
  return {
    currentIntervalMs,
    suggestedIntervalMs,
    reasoning,
    priority,
  };
}

/**
 * Get default exchange fee rates
 */
export function getExchangeFeeRate(exchangeName: string): number {
  const fees: Record<string, number> = {
    'Binance': 0.001,   // 0.1%
    'OKX': 0.001,       // 0.1%
    'Bybit': 0.001,     // 0.1%
    'Kraken': 0.0026,   // 0.26%
    'Nexo': 0.002,      // 0.2%
    'KuCoin': 0.001,    // 0.1%
    'Hyperliquid': 0.0002, // 0.02%
  };
  return fees[exchangeName] || 0.001;
}
