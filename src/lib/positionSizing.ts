import { supabase } from '@/integrations/supabase/client';

// VIP tier definitions for each exchange
export const BINANCE_VIP_TIERS: Record<string, { maker: number; taker: number }> = {
  standard: { maker: 0.001, taker: 0.001 },      // 0.10%
  vip1: { maker: 0.0009, taker: 0.001 },         // 0.09% / 0.10%
  vip2: { maker: 0.0008, taker: 0.001 },         // 0.08% / 0.10%
  vip3: { maker: 0.0007, taker: 0.0009 },        // 0.07% / 0.09%
  vip4: { maker: 0.0006, taker: 0.0008 },        // 0.06% / 0.08%
  vip5: { maker: 0.0005, taker: 0.0007 },        // 0.05% / 0.07%
};

export const OKX_VIP_TIERS: Record<string, { maker: number; taker: number }> = {
  standard: { maker: 0.0008, taker: 0.001 },     // 0.08% / 0.10%
  vip1: { maker: 0.0006, taker: 0.0009 },        // 0.06% / 0.09%
  vip2: { maker: 0.0005, taker: 0.0008 },        // 0.05% / 0.08%
  vip3: { maker: 0.00035, taker: 0.0006 },       // 0.035% / 0.06%
};

export const BYBIT_VIP_TIERS: Record<string, { maker: number; taker: number }> = {
  standard: { maker: 0.001, taker: 0.001 },
  vip1: { maker: 0.0008, taker: 0.001 },
  vip2: { maker: 0.0006, taker: 0.0009 },
  vip3: { maker: 0.0004, taker: 0.0007 },
};

export const DEFAULT_EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,
  okx: 0.0008,
  bybit: 0.001,
  kraken: 0.0016,
  nexo: 0.002,
  kucoin: 0.001,
  hyperliquid: 0.0002,
};

export const EXCHANGE_MIN_NOTIONAL: Record<string, number> = {
  binance: 5,
  okx: 5,
  bybit: 5,
  kraken: 10,
  nexo: 10,
  kucoin: 5,
  hyperliquid: 1,
};

export interface PositionSizeParams {
  targetNetProfitUsd: number;
  feeRate: number;
  minEdgePercent: number;
  portfolioBalanceUsd: number;
  maxAllocationPercent?: number;
  exchangeMinNotional?: number;
}

export interface PositionSizeResult {
  recommendedAmount: number;
  takeProfitPercent: number;
  isViable: boolean;
  reason?: string;
  feeImpactUsd: number;
  netProfitAtTarget: number;
  requiredMovePercent: number;
}

export interface UserFeeSettings {
  feeRate: number;
  tier: string;
  hasDiscount: boolean;
  makerFee: number;
  takerFee: number;
}

/**
 * Calculate exact position size needed for a target net profit after fees
 * Formula: positionSize = targetNetProfit / (minEdgePercent - 2 * feeRate)
 */
export function calculatePositionForTargetProfit(
  params: PositionSizeParams
): PositionSizeResult {
  const {
    targetNetProfitUsd,
    feeRate,
    minEdgePercent,
    portfolioBalanceUsd,
    maxAllocationPercent = 0.5,
    exchangeMinNotional = 5,
  } = params;

  const roundTripFees = feeRate * 2;
  const edgeDecimal = minEdgePercent / 100;

  // Check if trade is viable (edge must exceed fees)
  if (edgeDecimal <= roundTripFees) {
    return {
      recommendedAmount: 0,
      takeProfitPercent: 0,
      isViable: false,
      reason: `Fee rate ${(roundTripFees * 100).toFixed(2)}% exceeds edge ${minEdgePercent.toFixed(2)}%`,
      feeImpactUsd: 0,
      netProfitAtTarget: 0,
      requiredMovePercent: 0,
    };
  }

  // Calculate required position size
  const netEdge = edgeDecimal - roundTripFees;
  const requiredPositionSize = targetNetProfitUsd / netEdge;

  // Apply portfolio constraints
  const maxFromPortfolio = portfolioBalanceUsd * maxAllocationPercent;
  let recommendedAmount = Math.min(requiredPositionSize, maxFromPortfolio);

  // Ensure minimum notional
  if (recommendedAmount < exchangeMinNotional) {
    if (exchangeMinNotional > maxFromPortfolio) {
      return {
        recommendedAmount: 0,
        takeProfitPercent: 0,
        isViable: false,
        reason: `Min notional $${exchangeMinNotional} exceeds ${(maxAllocationPercent * 100).toFixed(0)}% of portfolio ($${maxFromPortfolio.toFixed(2)})`,
        feeImpactUsd: 0,
        netProfitAtTarget: 0,
        requiredMovePercent: 0,
      };
    }
    recommendedAmount = exchangeMinNotional;
  }

  // Calculate resulting fees and profit
  const feeImpactUsd = recommendedAmount * roundTripFees;
  const grossProfitAtEdge = recommendedAmount * edgeDecimal;
  const netProfitAtTarget = grossProfitAtEdge - feeImpactUsd;

  // Calculate the exact % move needed
  const requiredMovePercent = ((targetNetProfitUsd + feeImpactUsd) / recommendedAmount) * 100;

  return {
    recommendedAmount: Math.round(recommendedAmount * 100) / 100,
    takeProfitPercent: requiredMovePercent,
    isViable: true,
    feeImpactUsd: Math.round(feeImpactUsd * 100) / 100,
    netProfitAtTarget: Math.round(netProfitAtTarget * 100) / 100,
    requiredMovePercent: Math.round(requiredMovePercent * 1000) / 1000,
  };
}

/**
 * Calculate position size for $1 net profit (convenience function)
 */
export function calculatePositionForOneDollarProfit(
  feeRate: number,
  portfolioBalanceUsd: number,
  exchange: string = 'binance',
  minEdgePercent: number = 0.6
): PositionSizeResult {
  return calculatePositionForTargetProfit({
    targetNetProfitUsd: 1.00,
    feeRate,
    minEdgePercent,
    portfolioBalanceUsd,
    maxAllocationPercent: 0.5,
    exchangeMinNotional: EXCHANGE_MIN_NOTIONAL[exchange.toLowerCase()] || 5,
  });
}

/**
 * Get user's custom fee settings from database
 */
export async function getUserFeeSettings(
  userId: string,
  exchange: string
): Promise<UserFeeSettings> {
  const { data, error } = await supabase
    .from('user_exchange_fees')
    .select('fee_tier, maker_fee, taker_fee, bnb_discount, okx_discount')
    .eq('user_id', userId)
    .eq('exchange_name', exchange.toLowerCase())
    .maybeSingle();

  if (error || !data) {
    // Return default fees
    const defaultFee = DEFAULT_EXCHANGE_FEES[exchange.toLowerCase()] || 0.001;
    return {
      feeRate: defaultFee,
      tier: 'standard',
      hasDiscount: false,
      makerFee: defaultFee,
      takerFee: defaultFee,
    };
  }

  let takerFee = data.taker_fee || 0.001;
  const hasDiscount = data.bnb_discount || data.okx_discount || false;

  // Apply BNB discount for Binance (25% off)
  if (exchange.toLowerCase() === 'binance' && data.bnb_discount) {
    takerFee = takerFee * 0.75;
  }

  return {
    feeRate: takerFee,
    tier: data.fee_tier || 'standard',
    hasDiscount,
    makerFee: data.maker_fee || takerFee,
    takerFee,
  };
}

/**
 * Get VIP tier fees for an exchange
 */
export function getVipTierFees(
  exchange: string,
  tier: string,
  hasBnbDiscount: boolean = false
): { maker: number; taker: number } {
  const normalizedExchange = exchange.toLowerCase();
  const normalizedTier = tier.toLowerCase();

  let tierData: { maker: number; taker: number };

  switch (normalizedExchange) {
    case 'binance':
      tierData = BINANCE_VIP_TIERS[normalizedTier] || BINANCE_VIP_TIERS.standard;
      if (hasBnbDiscount) {
        return {
          maker: tierData.maker * 0.75,
          taker: tierData.taker * 0.75,
        };
      }
      return tierData;
    case 'okx':
      return OKX_VIP_TIERS[normalizedTier] || OKX_VIP_TIERS.standard;
    case 'bybit':
      return BYBIT_VIP_TIERS[normalizedTier] || BYBIT_VIP_TIERS.standard;
    default:
      const defaultFee = DEFAULT_EXCHANGE_FEES[normalizedExchange] || 0.001;
      return { maker: defaultFee, taker: defaultFee };
  }
}

/**
 * Get all available VIP tiers for an exchange
 */
export function getAvailableTiers(exchange: string): string[] {
  const normalizedExchange = exchange.toLowerCase();
  switch (normalizedExchange) {
    case 'binance':
      return Object.keys(BINANCE_VIP_TIERS);
    case 'okx':
      return Object.keys(OKX_VIP_TIERS);
    case 'bybit':
      return Object.keys(BYBIT_VIP_TIERS);
    default:
      return ['standard'];
  }
}

/**
 * Calculate position sizes for $1 profit across all exchanges
 */
export async function calculatePositionSizesForAllExchanges(
  userId: string,
  portfolioBalanceUsd: number,
  exchanges: string[] = ['binance', 'okx', 'bybit']
): Promise<Array<{
  exchange: string;
  tier: string;
  hasDiscount: boolean;
  effectiveFeeRate: number;
  positionNeeded: number;
  requiredMove: number;
  isViable: boolean;
  reason?: string;
}>> {
  const results = await Promise.all(
    exchanges.map(async (exchange) => {
      const feeSettings = await getUserFeeSettings(userId, exchange);
      const sizing = calculatePositionForOneDollarProfit(
        feeSettings.feeRate,
        portfolioBalanceUsd,
        exchange
      );

      return {
        exchange,
        tier: feeSettings.tier,
        hasDiscount: feeSettings.hasDiscount,
        effectiveFeeRate: feeSettings.feeRate,
        positionNeeded: sizing.recommendedAmount,
        requiredMove: sizing.requiredMovePercent,
        isViable: sizing.isViable,
        reason: sizing.reason,
      };
    })
  );

  // Sort by lowest position requirement (most efficient first)
  return results.sort((a, b) => {
    if (!a.isViable) return 1;
    if (!b.isViable) return -1;
    return a.positionNeeded - b.positionNeeded;
  });
}
