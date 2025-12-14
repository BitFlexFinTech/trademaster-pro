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

// Minimum net profit after fees
export const MIN_NET_PROFIT = 0.50;

export const getFeeRate = (exchange: string): number => {
  const normalizedExchange = exchange.toLowerCase();
  return EXCHANGE_FEES[normalizedExchange] ?? 0.001; // Default 0.1%
};

export const isProfitableAfterFees = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string
): boolean => {
  const netProfit = calculateNetProfit(entryPrice, exitPrice, positionSize, exchange);
  return netProfit > 0;
};

export const calculateNetProfit = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string
): number => {
  const feeRate = getFeeRate(exchange);
  const grossProfit = (exitPrice - entryPrice) * (positionSize / entryPrice);
  const entryFee = positionSize * feeRate;
  const exitFee = (positionSize + grossProfit) * feeRate;
  return grossProfit - entryFee - exitFee;
};

/**
 * Check if a trade meets the minimum profit threshold ($0.50 after fees)
 */
export const meetsMinProfitThreshold = (
  entryPrice: number,
  exitPrice: number,
  positionSize: number,
  exchange: string,
  minProfit: number = MIN_NET_PROFIT
): boolean => {
  const netProfit = calculateNetProfit(entryPrice, exitPrice, positionSize, exchange);
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
