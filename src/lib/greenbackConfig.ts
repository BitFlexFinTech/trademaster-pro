/**
 * GREENBACK Bot Configuration
 * Centralized config for micro-scalping strategy with $230 starting balance
 * Target: $0.25-$0.50 per trade, $5-$10 daily
 */

export const GREENBACK_CONFIG = {
  // Core settings
  bot_name: "GREENBACK",
  equity_start_usd: 230,
  
  // Per-trade targets
  target_pnl_per_trade_usd: { min: 0.25, max: 0.50 },
  risk_per_trade_pct: 0.01,        // 1% = $2.30 max loss per trade
  
  // Daily limits
  max_daily_loss_pct: 0.03,        // 3% = $6.90 max daily loss
  daily_target_usd: { min: 5, max: 10 },
  
  // Position sizing
  leverage_cap: 3,                  // Max 3x leverage
  max_concurrent_positions: 1,      // Single position only
  
  // Timing
  timeframes: {
    micro: "15s-1m",               // Signal timeframe
    confirm: "1-5m"                // Regime confirmation
  },
  
  // Instrument whitelist (highest liquidity only)
  instruments_whitelist: ["BTC/USDT", "ETH/USDT"],
  
  // Spread & slippage guards
  spread_threshold_bps: 1,         // 0.01% max spread
  slippage_block_pct_of_target: 0.40, // Block if slippage > 40% of target
  
  // Stop loss settings
  sl_distance_pct: { min: 0.20, max: 0.30 }, // 0.2-0.3% adverse move
  
  // Take profit settings
  tp_mode: "net_dollar" as const,
  tp_net_usd: { min: 0.25, max: 0.50 },
  
  // Trailing stop (activated on TP touch)
  trail_on_tp_touch: true,
  trail_distance_pct: 0.08,        // 0.08% trail distance
  trail_step_pct: 0.02,            // 0.02% step size
  
  // Latency guard
  latency_pause_ms: 250,           // Pause if latency > 250ms
  
  // News pause
  news_pause: true,
  
  // Order type preference
  post_only_preference: true,      // Prefer limit orders to save fees
  
  // Session halt controls
  session_halt: {
    consecutive_losses: 3,         // Halt after 3 consecutive losses
    min_win_rate_20_trades: 0.50,  // Halt if win rate < 50% over 20 trades
    cooloff_minutes: 5             // 5 minute cooloff period
  },
  
  // Exchange fees (used for net profit calculations)
  exchange_fees: {
    binance: 0.001,    // 0.1%
    bybit: 0.001,      // 0.1%
    okx: 0.0008,       // 0.08%
    kraken: 0.0016,    // 0.16%
    nexo: 0.002,       // 0.2%
    hyperliquid: 0.0002, // 0.02%
  } as Record<string, number>,
} as const;

// Helper functions
export function getExchangeFee(exchange: string): number {
  return GREENBACK_CONFIG.exchange_fees[exchange.toLowerCase()] ?? 0.001;
}

export function isInstrumentWhitelisted(pair: string): boolean {
  return (GREENBACK_CONFIG.instruments_whitelist as readonly string[]).includes(pair);
}

export function calculateMaxLoss(equity: number): number {
  return equity * GREENBACK_CONFIG.max_daily_loss_pct;
}

export function calculatePositionSize(
  equity: number,
  entryPrice: number,
  stopLossPercent: number,
  leverage: number = 1
): number {
  const riskAmount = equity * GREENBACK_CONFIG.risk_per_trade_pct;
  const effectiveLeverage = Math.min(leverage, GREENBACK_CONFIG.leverage_cap);
  const slDistance = stopLossPercent / 100;
  
  // Position size = Risk Amount / (SL Distance / Leverage)
  const positionSize = (riskAmount / slDistance) * effectiveLeverage;
  
  // Cap at 50% of equity for safety
  return Math.min(positionSize, equity * 0.5);
}

export function calculateTPPrice(
  entryPrice: number,
  direction: 'long' | 'short',
  positionSize: number,
  targetNetProfit: number,
  feeRate: number
): number {
  const totalFees = positionSize * feeRate * 2; // Entry + exit
  const requiredGross = targetNetProfit + totalFees;
  const priceMove = requiredGross / positionSize;
  
  return direction === 'long'
    ? entryPrice * (1 + priceMove)
    : entryPrice * (1 - priceMove);
}

export function calculateSLPrice(
  entryPrice: number,
  direction: 'long' | 'short',
  slPercent: number = 0.25 // Default 0.25%
): number {
  const slDistance = slPercent / 100;
  return direction === 'long'
    ? entryPrice * (1 - slDistance)
    : entryPrice * (1 + slDistance);
}

export type GreenbackConfig = typeof GREENBACK_CONFIG;
