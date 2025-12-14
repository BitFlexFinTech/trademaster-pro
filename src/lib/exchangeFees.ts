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
