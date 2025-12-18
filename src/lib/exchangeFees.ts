// Exchange fee rates (maker/taker fees as decimal)
export const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,    // 0.1%
  okx: 0.0008,       // 0.08%
  bybit: 0.001,      // 0.1%
  kraken: 0.0016,    // 0.16%
  nexo: 0.002,       // 0.2%
  kucoin: 0.001,     // 0.1%
  hyperliquid: 0.0002, // 0.02%
};

// Minimum net profit after fees - lowered to allow smaller positions
export const MIN_NET_PROFIT = 0.05;

// Minimum edge required above fees (as decimal, e.g., 0.003 = 0.3%)
export const DEFAULT_MIN_EDGE_PERCENT = 0.003;

export const getFeeRate = (exchange: string): number => {
  const normalizedExchange = exchange.toLowerCase();
  return EXCHANGE_FEES[normalizedExchange] ?? 0.001; // Default 0.1%
};

export const isProfitableAfterFees = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string,
  direction: 'long' | 'short' = 'long'
): boolean => {
  const netProfit = calculateNetProfit(entryPrice, exitPrice, positionSize, exchange, direction);
  return netProfit > 0;
};

export const calculateNetProfit = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string,
  direction: 'long' | 'short' = 'long'
): number => {
  const feeRate = getFeeRate(exchange);
  
  // Calculate gross profit based on direction
  // LONG: profit when price goes UP (exit > entry)
  // SHORT: profit when price goes DOWN (entry > exit)
  const priceChange = direction === 'long' 
    ? exitPrice - entryPrice
    : entryPrice - exitPrice;
  
  const grossProfit = priceChange * (positionSize / entryPrice);
  const entryFee = positionSize * feeRate;
  const exitFee = (positionSize + Math.max(0, grossProfit)) * feeRate;
  
  const netProfit = grossProfit - entryFee - exitFee;
  
  console.log(`📊 Fee Calc [${direction}]: Entry=$${entryPrice.toFixed(4)}, Exit=$${exitPrice.toFixed(4)}, Gross=$${grossProfit.toFixed(4)}, Fees=$${(entryFee + exitFee).toFixed(4)}, Net=$${netProfit.toFixed(4)}`);
  
  return netProfit;
};

/**
 * Check if a trade meets the minimum profit threshold ($0.50 after fees)
 */
export const meetsMinProfitThreshold = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string,
  minProfit: number = MIN_NET_PROFIT,
  direction: 'long' | 'short' = 'long'
): boolean => {
  const netProfit = calculateNetProfit(entryPrice, exitPrice, positionSize, exchange, direction);
  return netProfit >= minProfit;
};

/**
 * Calculate minimum exit price needed to achieve target net profit
 */
export const calculateMinExitPrice = (
  entryPrice: number,
  positionSize: number,
  exchange: string,
  targetNetProfit: number = MIN_NET_PROFIT
): number => {
  const feeRate = getFeeRate(exchange);
  // Solve for exitPrice given: netProfit = grossProfit - entryFee - exitFee
  // grossProfit = (exitPrice - entryPrice) * (positionSize / entryPrice)
  // entryFee = positionSize * feeRate
  // exitFee = (positionSize + grossProfit) * feeRate
  // Simplified: exitPrice = entryPrice * (1 + (targetNetProfit + entryFee + approxExitFee) / positionSize)
  const entryFee = positionSize * feeRate;
  const approxExitFee = positionSize * feeRate; // Approximation
  const requiredGrossProfit = targetNetProfit + entryFee + approxExitFee;
  const priceChangeRatio = requiredGrossProfit / positionSize;
  return entryPrice * (1 + priceChangeRatio);
};

/**
 * Calculate minimum edge required for a trade to be profitable
 * Edge = expected profit % - fee cost %
 */
export const calculateMinEdgeRequired = (
  positionSize: number,
  exchange: string,
  targetNetProfit: number = MIN_NET_PROFIT
): number => {
  const feeRate = getFeeRate(exchange);
  const totalFeePercent = feeRate * 2; // Round-trip fees
  const targetProfitPercent = targetNetProfit / positionSize;
  return totalFeePercent + targetProfitPercent; // Minimum % move needed
};

/**
 * Check if expected price move provides sufficient edge
 */
export const hasMinimumEdge = (
  expectedMovePercent: number,
  positionSize: number,
  exchange: string,
  minEdgeMargin: number = DEFAULT_MIN_EDGE_PERCENT,
  targetNetProfit: number = MIN_NET_PROFIT
): { hasEdge: boolean; edge: number; required: number; shortfall: number } => {
  const minRequired = calculateMinEdgeRequired(positionSize, exchange, targetNetProfit);
  const totalRequired = minRequired + minEdgeMargin;
  const edge = expectedMovePercent - totalRequired;
  return {
    hasEdge: expectedMovePercent >= totalRequired,
    edge: edge * 100, // As percentage
    required: totalRequired * 100,
    shortfall: edge < 0 ? Math.abs(edge * 100) : 0,
  };
};

/**
 * Calculate the TP percentage needed to achieve target NET profit after fees
 * Formula: (targetNetProfit + roundTripFees) / positionSize * 100
 */
export const calculateRequiredTPPercent = (
  positionSize: number,
  targetNetProfit: number,
  exchange: string
): number => {
  const feeRate = getFeeRate(exchange);
  const roundTripFees = positionSize * feeRate * 2;
  const requiredGross = targetNetProfit + roundTripFees;
  return (requiredGross / positionSize) * 100;
};
