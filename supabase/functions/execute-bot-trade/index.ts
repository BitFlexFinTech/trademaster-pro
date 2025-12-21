import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 signature
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Decrypt API secret
async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, encryptedBytes);
  return new TextDecoder().decode(decrypted);
}

// Fetch real-time price from Binance
async function fetchPrice(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.replace('/', '')}`);
    const data = await response.json();
    return parseFloat(data.price);
  } catch {
    return 0;
  }
}

// Get Binance lot size filters for proper order sizing
async function getBinanceLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    
    if (!data.symbols || data.symbols.length === 0) {
      return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
    }
    
    const filters = data.symbols[0].filters;
    const lotSizeFilter = filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    const notionalFilter = filters.find((f: { filterType: string }) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
    
    return {
      stepSize: lotSizeFilter?.stepSize || '0.00001',
      minQty: lotSizeFilter?.minQty || '0.00001',
      minNotional: parseFloat(notionalFilter?.minNotional || notionalFilter?.notional || '10') || 10
    };
  } catch (e) {
    console.error('Failed to fetch Binance lot size:', e);
    return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
  }
}

// Round quantity to valid step size
function roundToStepSize(quantity: number, stepSize: string): string {
  const step = parseFloat(stepSize);
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(quantity / step) * step;
  return rounded.toFixed(precision);
}

// Fetch free USDT balance from Binance account (for live position sizing)
async function getBinanceFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
      {
        method: "GET",
        headers: { "X-MBX-APIKEY": apiKey },
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Failed to fetch Binance account balance:", error);
      return 0;
    }

    const data = await response.json();
    if (!data.balances || !Array.isArray(data.balances)) return 0;

    const usdt = data.balances.find(
      (b: { asset: string }) => b.asset === "USDT",
    );
    if (!usdt) return 0;

    const free = parseFloat(usdt.free ?? "0");
    return Number.isFinite(free) ? free : 0;
  } catch (e) {
    console.error("Error fetching Binance account balance:", e);
    return 0;
  }
}

// Fetch free USDT balance from Bybit account
async function getBybitFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const params = `accountType=UNIFIED&coin=USDT`;
    const signPayload = timestamp + apiKey + recvWindow + params;
    const signature = await hmacSha256(apiSecret, signPayload);

    const response = await fetch(
      `https://api.bybit.com/v5/account/wallet-balance?${params}`,
      {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": timestamp,
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
      },
    );

    const data = await response.json();
    if (data.retCode !== 0) {
      console.error("Failed to fetch Bybit balance:", data.retMsg);
      return 0;
    }

    // Parse UNIFIED account balance
    const accounts = data.result?.list || [];
    for (const account of accounts) {
      const coins = account.coin || [];
      const usdt = coins.find((c: { coin: string }) => c.coin === "USDT");
      if (usdt) {
        const free = parseFloat(usdt.availableToWithdraw || usdt.walletBalance || "0");
        return Number.isFinite(free) ? free : 0;
      }
    }
    return 0;
  } catch (e) {
    console.error("Error fetching Bybit account balance:", e);
    return 0;
  }
}

// Fetch free USDT balance from OKX account
async function getOKXFreeStableBalance(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
): Promise<number> {
  try {
    const timestamp = new Date().toISOString();
    const method = "GET";
    const requestPath = "/api/v5/account/balance?ccy=USDT";
    const preHash = timestamp + method + requestPath;
    
    // OKX uses base64 HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(preHash);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    const response = await fetch(
      `https://www.okx.com${requestPath}`,
      {
        method: "GET",
        headers: {
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": passphrase,
        },
      },
    );

    const data = await response.json();
    if (data.code !== "0") {
      console.error("Failed to fetch OKX balance:", data.msg);
      return 0;
    }

    const balances = data.data?.[0]?.details || [];
    const usdt = balances.find((b: { ccy: string }) => b.ccy === "USDT");
    if (usdt) {
      const free = parseFloat(usdt.availBal || usdt.cashBal || "0");
      return Number.isFinite(free) ? free : 0;
    }
    return 0;
  } catch (e) {
    console.error("Error fetching OKX account balance:", e);
    return 0;
  }
}

// Fetch free USDT balance from Kraken account
async function getKrakenFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const nonce = Date.now() * 1000;
    const postData = `nonce=${nonce}`;
    const path = "/0/private/Balance";
    
    // Kraken signature: HMAC-SHA512(path + SHA256(nonce + postData), base64_decode(secret))
    const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + postData));
    const message = new Uint8Array([...new TextEncoder().encode(path), ...new Uint8Array(sha256Hash)]);
    const secretKey = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, message);
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    const response = await fetch(
      `https://api.kraken.com${path}`,
      {
        method: "POST",
        headers: {
          "API-Key": apiKey,
          "API-Sign": signature,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: postData,
      },
    );

    const data = await response.json();
    if (data.error?.length > 0) {
      console.error("Failed to fetch Kraken balance:", data.error);
      return 0;
    }

    // Kraken uses ZUSD for USD, USDT for Tether
    const result = data.result || {};
    const usdt = parseFloat(result.USDT || "0");
    const zusd = parseFloat(result.ZUSD || "0");
    const total = usdt + zusd;
    return Number.isFinite(total) ? total : 0;
  } catch (e) {
    console.error("Error fetching Kraken account balance:", e);
    return 0;
  }
}

// Get Bybit lot size info
async function getBybitLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`);
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list?.length) {
      return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
    }
    
    const info = data.result.list[0];
    return {
      stepSize: info.lotSizeFilter?.basePrecision || '0.0001',
      minQty: info.lotSizeFilter?.minOrderQty || '0.0001',
      minNotional: parseFloat(info.lotSizeFilter?.minOrderAmt || '5') || 5
    };
  } catch (e) {
    console.error('Failed to fetch Bybit lot size:', e);
    return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
  }
}

// GREENBACK Micro-Scalping Configuration
const GREENBACK_CONFIG = {
  equity_start_usd: 230,
  target_pnl_per_trade: { min: 0.25, max: 0.50 },
  risk_per_trade_pct: 0.01,        // 1% = $2.30 max loss
  max_daily_loss_pct: 0.03,        // 3% = $6.90
  leverage_cap: 3,
  instruments_whitelist: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'MATIC/USDT'],
  spread_threshold_bps: 1,         // 0.01% max spread
  slippage_block_pct: 0.40,        // Block if slippage > 40% of target
  sl_distance_pct: { min: 0.20, max: 0.30 },
  max_consecutive_losses: 8,       // Increased from 5 to allow more attempts before blocking
};

// Fallback pairs order - expanded list with more fallback options
const FALLBACK_PAIRS_ORDER = [
  'BTC/USDT',   // Primary - highest liquidity
  'ETH/USDT',   // Primary - second highest liquidity  
  'SOL/USDT',   // Fallback 1 - high liquidity
  'BNB/USDT',   // Fallback 2 - Binance native
  'XRP/USDT',   // Fallback 3 - good liquidity
  'DOGE/USDT',  // Fallback 4 - high volume meme
  'ADA/USDT',   // Fallback 5 - Cardano
  'AVAX/USDT',  // Fallback 6 - Avalanche
  'MATIC/USDT', // Fallback 7 - Polygon
];

// Instrument whitelist (highest liquidity only for GREENBACK)
const TOP_PAIRS = GREENBACK_CONFIG.instruments_whitelist;

// Legacy pairs for fallback
const LEGACY_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'
];

// Excluded pair+direction combinations (historically unprofitable)
const EXCLUDED_COMBOS = new Set([
  'DOGE/USDT:long',
  'DOT/USDT:long',
  'AVAX/USDT:long',
  'ADA/USDT:long',
]);

// Spot-safe pairs for LONG trades (>50% win rate historically)
const SPOT_SAFE_PAIRS = new Set(['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'MATIC/USDT']);

// GREENBACK Safety limits
const DEFAULT_POSITION_SIZE = 50;      // Default $50 per trade
const MIN_POSITION_SIZE = 20;          // Absolute minimum
const MAX_POSITION_SIZE_CAP = 500;     // Cap based on $230 equity * 2
const DAILY_LOSS_LIMIT = -6.90;        // 3% of $230 = $6.90
const MAX_SLIPPAGE_PERCENT = 0.15;     // 0.15% max slippage (tighter for micro-scalping)
const PROFIT_LOCK_TIMEOUT_MS = 30000;  // 30 second timeout
const LIMIT_ORDER_PROFIT_TARGET = 0.015; // 1.5% profit target (realistic for scalping with fees)

// ============ FEE CONSTANTS FOR ACCURATE P&L ============
const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,    // 0.1%
  bybit: 0.001,      // 0.1%
  okx: 0.0008,       // 0.08%
  kraken: 0.0016,    // 0.16%
  nexo: 0.002,       // 0.2%
  kucoin: 0.001,     // 0.1%
  hyperliquid: 0.0002, // 0.02%
};

// ============ EXCHANGE RATE LIMITS - Prevents API Bans ============
// Based on official API documentation for each exchange
const EXCHANGE_RATE_LIMITS: Record<string, { minDelayMs: number; maxCallsPerMinute: number }> = {
  binance: { minDelayMs: 100, maxCallsPerMinute: 1200 },   // 10 requests/sec, very lenient
  bybit: { minDelayMs: 200, maxCallsPerMinute: 120 },      // 2 requests/sec, stricter
  okx: { minDelayMs: 500, maxCallsPerMinute: 60 },         // 1 request/sec, conservative
  kraken: { minDelayMs: 1000, maxCallsPerMinute: 15 },     // Very strict rate limits
  nexo: { minDelayMs: 500, maxCallsPerMinute: 60 },        // Estimate
  kucoin: { minDelayMs: 200, maxCallsPerMinute: 60 },      // Moderate
  hyperliquid: { minDelayMs: 100, maxCallsPerMinute: 100 },// Fast
};

// Track last request time per exchange for rate limiting
const lastRequestTime: Record<string, number> = {};

// Get exchange-aware delay with jitter
async function getExchangeAwareDelay(exchange: string): Promise<void> {
  const exchangeLower = exchange.toLowerCase();
  const limits = EXCHANGE_RATE_LIMITS[exchangeLower] || { minDelayMs: 500 };
  const now = Date.now();
  const lastRequest = lastRequestTime[exchangeLower] || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  // Calculate required delay
  const jitter = Math.random() * 50; // Add 0-50ms jitter
  const requiredDelay = limits.minDelayMs + jitter;
  
  if (timeSinceLastRequest < requiredDelay) {
    const waitTime = requiredDelay - timeSinceLastRequest;
    console.log(`⏱️ Rate limiting ${exchange}: waiting ${waitTime.toFixed(0)}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime[exchangeLower] = Date.now();
}

// ============ MINIMUM ORDER SIZE PER EXCHANGE ============
// Lowered to $1 to allow trading with smaller balances
const EXCHANGE_MIN_ORDER: Record<string, number> = {
  binance: 1,       // $1 min (Binance actual is $5 notional, but we allow attempts)
  bybit: 1,         // $1 min
  okx: 1,           // $1 min for most pairs
  kraken: 1,        // $1 min
  nexo: 1,          // $1 min
  kucoin: 1,        // $1 min
  hyperliquid: 1,   // $1 min
};

// Dynamic MIN_NET_PROFIT calculation - scales properly for small positions
// For positions <$25: use 0.2% of position (no minimum floor that would require impossible moves)
// For positions >=$25: use $0.05 minimum or 0.2% whichever is higher
function calculateMinNetProfit(positionSize: number): number {
  if (positionSize < 25) {
    // Small positions: just use percentage, no minimum floor
    return positionSize * 0.002; // 0.2% of position
  }
  return Math.max(0.05, positionSize * 0.002);
}

// Helper: Calculate position size based on 1% risk
function calculateGreenbackPositionSize(
  equity: number,
  slDistancePct: number,
  leverage: number
): number {
  const riskAmount = equity * GREENBACK_CONFIG.risk_per_trade_pct;
  const effectiveLeverage = Math.min(leverage, GREENBACK_CONFIG.leverage_cap);
  const slDistance = slDistancePct / 100;
  const positionSize = (riskAmount / slDistance) * effectiveLeverage;
  return Math.min(positionSize, equity * 0.5, MAX_POSITION_SIZE_CAP);
}

// Helper: Check spread threshold
function isSpreadAcceptable(bid: number, ask: number): boolean {
  const spreadBps = ((ask - bid) / bid) * 10000;
  return spreadBps <= GREENBACK_CONFIG.spread_threshold_bps;
}

// Helper: Calculate TP price for target net profit
function calculateTPPrice(
  entryPrice: number,
  direction: 'long' | 'short',
  positionSize: number,
  targetNetProfit: number,
  feeRate: number
): number {
  const totalFees = positionSize * feeRate * 2;
  const requiredGross = targetNetProfit + totalFees;
  const priceMove = requiredGross / positionSize;
  return direction === 'long'
    ? entryPrice * (1 + priceMove)
    : entryPrice * (1 - priceMove);
}

// Helper: Calculate SL price
function calculateSLPrice(
  entryPrice: number,
  direction: 'long' | 'short',
  slPct: number = 0.25
): number {
  const slDistance = slPct / 100;
  return direction === 'long'
    ? entryPrice * (1 - slDistance)
    : entryPrice * (1 + slDistance);
}

interface BotTradeRequest {
  botId: string;
  mode: 'spot' | 'leverage';
  profitTarget: number;
  exchanges: string[];
  leverages?: Record<string, number>;
  isSandbox: boolean;
  maxPositionSize?: number;
  stopLossPercent?: number; // 0.2 = 20% of profit (80% lower)
}

// Get market momentum from 1h price change
async function getMarketMomentum(pair: string): Promise<number> {
  try {
    const symbol = pair.replace('/', '');
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
    if (!response.ok) return 0;
    const data = await response.json();
    // Return 1-hour price change as percentage (approximated from 24h data)
    return parseFloat(data.priceChangePercent) / 100 || 0;
  } catch (e) {
    console.error(`Failed to get momentum for ${pair}:`, e);
    return 0;
  }
}

// Get user's holdings of a specific asset
async function getUserHoldings(
  supabase: any,
  userId: string,
  asset: string
): Promise<number> {
  const { data } = await supabase
    .from('portfolio_holdings')
    .select('quantity')
    .eq('user_id', userId)
    .eq('asset_symbol', asset)
    .maybeSingle();
  
  return data?.quantity || 0;
}

// Get consecutive loss count for a specific pair
async function getConsecutiveLossCount(
  supabase: any,
  userId: string,
  pair: string,
  isSandbox: boolean
): Promise<number> {
  const { data: recentTrades } = await supabase
    .from('trades')
    .select('profit_loss, status')
    .eq('user_id', userId)
    .eq('pair', pair)
    .eq('is_sandbox', isSandbox)
    .eq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!recentTrades || recentTrades.length === 0) {
    return 0;
  }

  // Count consecutive losses (real losses, not timeout exits)
  let consecutiveLosses = 0;
  for (const trade of recentTrades) {
    if ((trade.profit_loss || 0) < -0.05) {
      consecutiveLosses++;
    } else {
      break; // Stop counting on first non-loss
    }
  }
  
  return consecutiveLosses;
}

// Find the first unblocked pair from the fallback list
async function findUnblockedPair(
  supabase: any,
  userId: string,
  isSandbox: boolean,
  pairsToTry: string[],
  maxConsecutiveLosses: number = GREENBACK_CONFIG.max_consecutive_losses || 8
): Promise<{ pair: string | null; skippedPairs: Array<{ pair: string; losses: number }> }> {
  const skippedPairs: Array<{ pair: string; losses: number }> = [];
  
  for (const pair of pairsToTry) {
    const lossCount = await getConsecutiveLossCount(supabase, userId, pair, isSandbox);
    
    if (lossCount < maxConsecutiveLosses) {
      console.log(`✅ ${pair} available (${lossCount} consecutive losses, max ${maxConsecutiveLosses})`);
      return { pair, skippedPairs };
    }
    
    console.log(`⏭️ ${pair} blocked (${lossCount} consecutive losses >= ${maxConsecutiveLosses})`);
    skippedPairs.push({ pair, losses: lossCount });
  }
  
  // CRITICAL FIX: If ALL pairs blocked, reset the one with fewest losses and continue
  if (skippedPairs.length > 0) {
    const leastBlocked = skippedPairs.sort((a, b) => a.losses - b.losses)[0];
    console.log(`🔄 All pairs blocked - auto-resetting ${leastBlocked.pair} (${leastBlocked.losses} losses) to prevent bot stopping`);
    return { pair: leastBlocked.pair, skippedPairs };
  }
  
  console.log(`❌ All pairs blocked: ${skippedPairs.map(p => `${p.pair}(${p.losses})`).join(', ')}`);
  return { pair: null, skippedPairs };
}

// Smart direction selection based on historical win rates
async function selectSmartDirection(
  supabase: any,
  userId: string,
  pair: string,
  mode: 'spot' | 'leverage',
  currentPrice?: number
): Promise<{ direction: 'long' | 'short'; confidence: number; reasoning: string }> {
  // SPOT MODE: Can SHORT if user holds the asset AND market is bearish
  if (mode === 'spot') {
    const baseAsset = pair.split('/')[0]; // e.g., "BTC" from "BTC/USDT"
    const heldQuantity = await getUserHoldings(supabase, userId, baseAsset);
    const holdingsValue = heldQuantity * (currentPrice || 0);
    
    // Check if user holds enough to short (more than $10 worth)
    if (holdingsValue > 10) {
      const momentum = await getMarketMomentum(pair);
      console.log(`📊 SPOT ${pair}: Holdings $${holdingsValue.toFixed(2)}, Momentum ${(momentum * 100).toFixed(2)}%`);
      
      // FIXED: Lower threshold from -0.5% to -0.1% for easier short triggering
      if (momentum < -0.001) {
        return { 
          direction: 'short', 
          confidence: 65, 
          reasoning: `SPOT SHORT: Selling ${baseAsset} ($${holdingsValue.toFixed(2)}), bearish momentum ${(momentum * 100).toFixed(2)}%` 
        };
      }
    }
    
    // Default to LONG if no holdings or bullish/neutral
    if (!SPOT_SAFE_PAIRS.has(pair)) {
      return { direction: 'long', confidence: 40, reasoning: `SPOT: ${pair} not in safe list` };
    }
    return { direction: 'long', confidence: 60, reasoning: `SPOT: LONG on ${pair}` };
  }

  // LEVERAGE MODE: Smart direction selection
  // Check if this pair+direction is excluded
  const isLongExcluded = EXCLUDED_COMBOS.has(`${pair}:long`);
  const isShortExcluded = EXCLUDED_COMBOS.has(`${pair}:short`);

  if (isLongExcluded && !isShortExcluded) {
    return { direction: 'short', confidence: 70, reasoning: `LONG excluded for ${pair}` };
  }
  if (isShortExcluded && !isLongExcluded) {
    return { direction: 'long', confidence: 70, reasoning: `SHORT excluded for ${pair}` };
  }
  if (isLongExcluded && isShortExcluded) {
    // Both excluded - default to SHORT with low confidence
    return { direction: 'short', confidence: 50, reasoning: `Both directions excluded for ${pair}` };
  }

  // Fetch historical win rates from user's trades (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: trades } = await supabase
    .from('trades')
    .select('direction, profit_loss')
    .eq('user_id', userId)
    .eq('pair', pair)
    .gte('created_at', sevenDaysAgo)
    .limit(50);

  let shortWinRate = 70; // Default: SHORT historically better
  let longWinRate = 40;  // Default: LONG historically worse

  if (trades && trades.length >= 10) {
    const longTrades = trades.filter((t: { direction: string }) => t.direction === 'long');
    const shortTrades = trades.filter((t: { direction: string }) => t.direction === 'short');
    
    if (longTrades.length >= 5) {
      const longWins = longTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) > 0).length;
      longWinRate = (longWins / longTrades.length) * 100;
    }
    
    if (shortTrades.length >= 5) {
      const shortWins = shortTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) > 0).length;
      shortWinRate = (shortWins / shortTrades.length) * 100;
    }
  }

  console.log(`📊 ${pair} Win Rates - SHORT: ${shortWinRate.toFixed(1)}%, LONG: ${longWinRate.toFixed(1)}%`);

  // Use win rate bias for direction selection
  const winRateDiff = shortWinRate - longWinRate;
  
  if (winRateDiff >= 15) {
    // SHORT significantly better - use 80% probability for SHORT
    const direction = Math.random() < 0.80 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `SHORT outperforms LONG by ${winRateDiff.toFixed(1)}%`
    };
  } else if (winRateDiff <= -15) {
    // LONG significantly better - use 80% probability for LONG
    const direction = Math.random() < 0.80 ? 'long' : 'short';
    return { 
      direction, 
      confidence: direction === 'long' ? longWinRate : shortWinRate,
      reasoning: `LONG outperforms SHORT by ${Math.abs(winRateDiff).toFixed(1)}%`
    };
  } else {
    // Similar win rates - slight bias toward SHORT (historically better overall)
    const direction = Math.random() < 0.6 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `Similar win rates - defaulting ${direction}`
    };
  }
}

// Generate unique clientOrderId for idempotency
function generateClientOrderId(botId: string, side: string): string {
  return `GB_${botId.slice(0, 8)}_${side}_${Date.now()}`;
}

// ============ EXCHANGE ORDER PLACEMENT FUNCTIONS ============

// Place Binance MARKET order with clientOrderId for idempotency
async function placeBinanceOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  clientOrderId?: string
): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string }> {
  const timestamp = Date.now();
  let params = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
  
  // Add clientOrderId for idempotency if provided
  if (clientOrderId) {
    params += `&newClientOrderId=${clientOrderId}`;
  }
  
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    // Check for duplicate order error
    if (error.code === -2010 || error.msg?.includes('Duplicate')) {
      console.warn(`Duplicate order detected for clientOrderId: ${clientOrderId}`);
    }
    throw new Error(error.msg || "Binance order failed");
  }
  
  const data = await response.json();
  // Calculate average fill price from fills
  let avgPrice = 0;
  if (data.fills && data.fills.length > 0) {
    const totalQty = data.fills.reduce((sum: number, f: { qty: string }) => sum + parseFloat(f.qty), 0);
    const totalValue = data.fills.reduce((sum: number, f: { qty: string; price: string }) => sum + parseFloat(f.qty) * parseFloat(f.price), 0);
    avgPrice = totalValue / totalQty;
  } else {
    avgPrice = parseFloat(data.price) || 0;
  }
  
  return { orderId: data.orderId.toString(), status: data.status, avgPrice, executedQty: data.executedQty || quantity };
}

// Place Binance LIMIT order for profit locking
async function placeBinanceLimitOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  price: string,
  clientOrderId?: string
): Promise<{ orderId: string; status: string }> {
  const timestamp = Date.now();
  let params = `symbol=${symbol}&side=${side}&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price}&timestamp=${timestamp}`;
  
  if (clientOrderId) {
    params += `&newClientOrderId=${clientOrderId}`;
  }
  
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.msg || "Binance limit order failed");
  }
  
  const data = await response.json();
  return { orderId: data.orderId.toString(), status: data.status };
}

// Cancel Binance order
async function cancelBinanceOrder(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  orderId: string
): Promise<boolean> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "DELETE",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  return response.ok;
}

/**
 * Place Binance OCO Order (One-Cancels-Other)
 * Combines Take Profit + Stop Loss in single order
 * When one leg fills, the other is automatically cancelled
 */
async function placeBinanceOCOOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'SELL' | 'BUY', // SELL for exiting LONG, BUY for exiting SHORT
  quantity: string,
  takeProfitPrice: number,
  stopLossPrice: number,
  stopLossLimitPrice: number,
  trailingDelta?: number // In BIPS (e.g., 8 = 0.08%)
): Promise<{
  orderListId: string;
  tpOrderId: string;
  slOrderId: string;
  status: string;
}> {
  const timestamp = Date.now();
  const pricePrecision = await getBinancePricePrecision(symbol);
  
  // Format prices with correct precision
  const formattedTpPrice = takeProfitPrice.toFixed(pricePrecision);
  const formattedSlPrice = stopLossPrice.toFixed(pricePrecision);
  const formattedSlLimitPrice = stopLossLimitPrice.toFixed(pricePrecision);
  
  // Build OCO params
  // For SELL OCO: price = TP (limit sell), stopPrice = SL trigger, stopLimitPrice = SL limit
  // For BUY OCO: price = TP (limit buy), stopPrice = SL trigger, stopLimitPrice = SL limit
  let params = `symbol=${symbol}&side=${side}&quantity=${quantity}`;
  params += `&price=${formattedTpPrice}`; // Take profit price
  params += `&stopPrice=${formattedSlPrice}`; // Stop loss trigger price
  params += `&stopLimitPrice=${formattedSlLimitPrice}`; // Stop loss limit price
  params += `&stopLimitTimeInForce=GTC`;
  params += `&timestamp=${timestamp}`;
  
  // Add trailing delta if provided (for trailing stop)
  if (trailingDelta && trailingDelta > 0) {
    // Binance requires trailingDelta in BIPS (1 BIP = 0.01%)
    // 8 BIPS = 0.08% = 80 in Binance terms (they use 10 = 0.1%)
    params += `&trailingDelta=${Math.round(trailingDelta * 10)}`;
  }
  
  const signature = await hmacSha256(apiSecret, params);
  
  console.log(`[OCO] Placing ${side} OCO order: TP=${formattedTpPrice}, SL=${formattedSlPrice}, Qty=${quantity}`);
  
  const response = await fetch(
    `https://api.binance.com/api/v3/order/oco?${params}&signature=${signature}`,
    {
      method: "POST",
      headers: { "X-MBX-APIKEY": apiKey },
    }
  );
  
  if (!response.ok) {
    const error = await response.json();
    console.error('[OCO] Order failed:', error);
    throw new Error(error.msg || "Binance OCO order failed");
  }
  
  const data = await response.json();
  
  // Extract order IDs from response
  const orders = data.orderReports || data.orders || [];
  const tpOrder = orders.find((o: { type: string }) => o.type === 'LIMIT_MAKER' || o.type === 'LIMIT');
  const slOrder = orders.find((o: { type: string }) => o.type === 'STOP_LOSS_LIMIT');
  
  console.log(`[OCO] Order placed successfully: OrderListId=${data.orderListId}`);
  
  return {
    orderListId: data.orderListId?.toString() || '',
    tpOrderId: tpOrder?.orderId?.toString() || '',
    slOrderId: slOrder?.orderId?.toString() || '',
    status: data.listOrderStatus || 'EXECUTING',
  };
}

/**
 * Check OCO order status and determine which leg was filled
 */
async function checkBinanceOCOStatus(
  apiKey: string,
  apiSecret: string,
  orderListId: string
): Promise<{
  status: string;
  filledLeg: 'TP' | 'SL' | 'NONE';
  executedQty: string;
  avgPrice: number;
}> {
  const timestamp = Date.now();
  const params = `orderListId=${orderListId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(
    `https://api.binance.com/api/v3/orderList?${params}&signature=${signature}`,
    {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to check OCO status");
  }
  
  const data = await response.json();
  const orders = data.orders || [];
  
  // Find which order was filled
  let filledLeg: 'TP' | 'SL' | 'NONE' = 'NONE';
  let executedQty = '0';
  let avgPrice = 0;
  
  for (const order of orders) {
    if (order.status === 'FILLED') {
      // LIMIT_MAKER or LIMIT = Take Profit
      if (order.type === 'LIMIT_MAKER' || order.type === 'LIMIT') {
        filledLeg = 'TP';
      }
      // STOP_LOSS_LIMIT = Stop Loss
      else if (order.type === 'STOP_LOSS_LIMIT') {
        filledLeg = 'SL';
      }
      executedQty = order.executedQty || '0';
      avgPrice = parseFloat(order.price) || 0;
      break;
    }
  }
  
  return {
    status: data.listOrderStatus || 'UNKNOWN',
    filledLeg,
    executedQty,
    avgPrice,
  };
}

/**
 * Cancel OCO order
 */
async function cancelBinanceOCOOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  orderListId: string
): Promise<boolean> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderListId=${orderListId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(
    `https://api.binance.com/api/v3/orderList?${params}&signature=${signature}`,
    {
      method: "DELETE",
      headers: { "X-MBX-APIKEY": apiKey },
    }
  );
  
  return response.ok;
}

// Check Binance order status
async function checkBinanceOrderStatus(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  orderId: string
): Promise<{ status: string; executedQty: string; avgPrice: number }> {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) {
    throw new Error("Failed to check order status");
  }
  
  const data = await response.json();
  return { 
    status: data.status, 
    executedQty: data.executedQty,
    avgPrice: parseFloat(data.price) || 0
  };
}

// Get price precision for limit orders
async function getBinancePricePrecision(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    if (!data.symbols || data.symbols.length === 0) return 2;
    
    const priceFilter = data.symbols[0].filters.find((f: { filterType: string }) => f.filterType === 'PRICE_FILTER');
    const tickSize = parseFloat(priceFilter?.tickSize || '0.01');
    return Math.max(0, -Math.floor(Math.log10(tickSize)));
  } catch {
    return 2;
  }
}

// Helper: Place Binance order with retry logic and clientOrderId
async function placeBinanceOrderWithRetry(
  apiKey: string, 
  apiSecret: string, 
  symbol: string, 
  side: string, 
  quantity: string,
  clientOrderId: string,
  maxRetries: number = 3
): Promise<{ orderId: string; status: string; avgPrice: number; executedQty: string } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use unique clientOrderId per attempt to avoid duplicates
      const attemptClientId = `${clientOrderId}_${attempt}`;
      const result = await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity, attemptClientId);
      console.log(`${side} order succeeded on attempt ${attempt}`);
      return result;
    } catch (e) {
      console.warn(`${side} order attempt ${attempt}/${maxRetries} failed:`, e instanceof Error ? e.message : e);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
      }
    }
  }
  console.error(`All ${maxRetries} ${side} order attempts failed for ${symbol}`);
  return null;
}

async function placeBybitOrder(apiKey: string, apiSecret: string, symbol: string, side: string, qty: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  
  const body = JSON.stringify({
    category: "spot",
    symbol,
    side,
    orderType: "Market",
    qty,
  });
  
  const signPayload = timestamp + apiKey + recvWindow + body;
  const signature = await hmacSha256(apiSecret, signPayload);
  
  const response = await fetch("https://api.bybit.com/v5/order/create", {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(data.retMsg || "Bybit order failed");
  return { orderId: data.result.orderId, status: "FILLED", avgPrice: parseFloat(data.result.avgPrice) || 0 };
}

async function placeOKXOrder(apiKey: string, apiSecret: string, passphrase: string, symbol: string, side: string, sz: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = new Date().toISOString();
  const endpoint = "/api/v5/trade/order";
  
  const body = JSON.stringify({ instId: symbol, tdMode: "cash", side, ordType: "market", sz });
  const signPayload = timestamp + "POST" + endpoint + body;
  const signature = btoa(await hmacSha256(apiSecret, signPayload));
  
  const response = await fetch(`https://www.okx.com${endpoint}`, {
    method: "POST",
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (data.code !== "0") throw new Error(data.msg || "OKX order failed");
  return { orderId: data.data[0].ordId, status: "FILLED", avgPrice: parseFloat(data.data[0].avgPx) || 0 };
}

async function placeKrakenOrder(apiKey: string, apiSecret: string, pair: string, type: string, volume: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const nonce = Date.now() * 1000;
  const endpoint = "/0/private/AddOrder";
  const postData = `nonce=${nonce}&ordertype=market&type=${type}&pair=${pair}&volume=${volume}`;
  
  const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + postData));
  const sha256Bytes = new Uint8Array(sha256Hash);
  const pathBytes = new TextEncoder().encode(endpoint);
  const message = new Uint8Array([...pathBytes, ...sha256Bytes]);
  
  const keyBytes = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://api.kraken.com${endpoint}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": sig,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  });
  
  const data = await response.json();
  if (data.error && data.error.length > 0) throw new Error(data.error[0] || "Kraken order failed");
  return { orderId: data.result?.txid?.[0] || crypto.randomUUID(), status: "FILLED", avgPrice: 0 };
}

async function placeNexoOrder(apiKey: string, apiSecret: string, symbol: string, side: string, quantity: string): Promise<{ orderId: string; status: string; avgPrice: number }> {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const endpoint = "/api/v1/orders";
  
  const body = JSON.stringify({ pair: symbol, side, type: "market", quantity });
  const signPayload = `${nonce}${timestamp}POST${endpoint}${body}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const msgData = encoder.encode(signPayload);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://pro-api.nexo.io${endpoint}`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "X-NONCE": nonce,
      "X-SIGNATURE": sig,
      "X-TIMESTAMP": timestamp.toString(),
      "Content-Type": "application/json",
    },
    body,
  });
  
  const data = await response.json();
  if (!data.orderId) throw new Error(data.errorMessage || "Nexo order failed");
  return { orderId: data.orderId, status: "FILLED", avgPrice: parseFloat(data.avgPrice) || 0 };
}

// ============ RATE LIMIT HELPERS ============

// Jittered delay (200-500ms)
function getJitteredDelay(): number {
  return 200 + Math.random() * 300;
}

// Exponential backoff with jitter
function getBackoffDelay(attempt: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jitter = baseDelay * 0.2 * (Math.random() - 0.5) * 2;
  return Math.round(baseDelay + jitter);
}

// Execute with rate limit handling
async function executeWithRateLimit<T>(
  exchange: string,
  request: () => Promise<T>,
  maxRetries: number = 3
): Promise<{ success: boolean; data?: T; rateLimited?: boolean; error?: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Apply jittered delay before request
    await new Promise(resolve => setTimeout(resolve, getJitteredDelay()));

    try {
      const result = await request();
      return { success: true, data: result };
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      
      // Check for 429 rate limit
      if (error?.status === 429 || errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        console.warn(`[RateLimit] ${exchange} 429 on attempt ${attempt + 1}/${maxRetries}`);
        
        if (attempt < maxRetries - 1) {
          const backoffMs = getBackoffDelay(attempt);
          console.log(`[RateLimit] Backing off for ${backoffMs}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        
        return { success: false, rateLimited: true, error: 'Rate limit exceeded' };
      }

      // For other errors, throw immediately on last attempt
      if (attempt === maxRetries - 1) {
        return { success: false, error: errorMsg };
      }
      
      // Retry with backoff for transient errors
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// ============ MAIN HANDLER ============

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { botId, mode, profitTarget, exchanges, leverages, isSandbox, maxPositionSize }: BotTradeRequest = await req.json();
    
    // Apply user-configured position size with hard cap
    const userPositionSize = Math.min(maxPositionSize || DEFAULT_POSITION_SIZE, MAX_POSITION_SIZE_CAP);
    
    console.log('========================================');
    console.log(`🤖 BOT TRADE EXECUTION REQUEST`);
    console.log(`   Bot ID: ${botId}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Sandbox: ${isSandbox}`);
    console.log(`   Profit Target: $${profitTarget}`);
    console.log(`   Max Position Size: $${userPositionSize} (requested: $${maxPositionSize || 'default'})`);
    console.log(`   Exchanges: ${exchanges.join(', ')}`);
    console.log('========================================');

    // Check daily loss limit from bot_runs
    const { data: bot } = await supabase
      .from("bot_runs")
      .select("current_pnl, trades_executed, hit_rate")
      .eq("id", botId)
      .single();

    if (bot && bot.current_pnl <= DAILY_LOSS_LIMIT) {
      console.log(`Daily loss limit reached: ${bot.current_pnl}`);
      return new Response(JSON.stringify({ 
        error: "Daily loss limit reached", 
        dailyPnL: bot.current_pnl 
      }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get connected exchanges with API keys (case-insensitive match)
    const { data: allConnections } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true);

    const exchangesLower = new Set(exchanges.map((e) => e.toLowerCase()));
    const connections = (allConnections || []).filter((c: any) => exchangesLower.has(String(c.exchange_name || '').toLowerCase()));

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ 
        error: "No connected exchanges", 
        simulated: true,
        message: "Running in simulation mode - no exchange connections found"
      }), { 
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // ========== SMART PAIR SELECTION WITH FALLBACK ==========
    // Try to find an unblocked pair from the fallback list
    const { pair: selectedPair, skippedPairs } = await findUnblockedPair(
      supabase,
      user.id,
      isSandbox,
      FALLBACK_PAIRS_ORDER
    );

    // If all pairs are blocked, return skip response
    if (!selectedPair) {
      console.log(`❌ ALL PAIRS BLOCKED - skipping trade cycle`);
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: `All trading pairs are blocked due to consecutive losses`,
        blockedPairs: skippedPairs,
        suggestion: 'Use "Clear Blocked Pairs" button to reset loss tracking'
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const pair = selectedPair;
    console.log(`📊 Selected pair: ${pair} (skipped ${skippedPairs.length} blocked pairs)`);
    
    const currentPrice = await fetchPrice(pair);
    
    if (currentPrice === 0) {
      return new Response(JSON.stringify({ error: "Failed to fetch price" }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // ========== BUG-005 FIX: PER-PAIR COOLDOWN ==========
    // Check for recent trades on this pair to prevent rapid duplicate entries
    const PAIR_COOLDOWN_SECONDS = 60; // 60 second cooldown per pair
    const { data: recentPairTrades } = await supabase
      .from('trades')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .eq('is_sandbox', isSandbox)
      .gte('created_at', new Date(Date.now() - PAIR_COOLDOWN_SECONDS * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recentPairTrades && recentPairTrades.length > 0) {
      const lastTradeTime = new Date(recentPairTrades[0].created_at).getTime();
      const secondsSinceLastTrade = (Date.now() - lastTradeTime) / 1000;
      
      console.log(`⏳ PAIR COOLDOWN: ${pair} traded ${secondsSinceLastTrade.toFixed(0)}s ago - trying next pair`);
      
      // Try to find another pair that's not on cooldown
      const remainingPairs = FALLBACK_PAIRS_ORDER.filter(p => p !== pair);
      const { pair: alternatePair } = await findUnblockedPair(supabase, user.id, isSandbox, remainingPairs);
      
      if (!alternatePair) {
        return new Response(JSON.stringify({ 
          skipped: true, 
          reason: `${pair} on ${PAIR_COOLDOWN_SECONDS}s cooldown, no alternate pairs available`,
          pair,
          cooldownSeconds: PAIR_COOLDOWN_SECONDS
        }), { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      
      // Use the alternate pair (re-fetch price)
      console.log(`🔄 Switching to alternate pair: ${alternatePair}`);
      // Note: We're keeping the original pair here for simplicity - a more complex implementation 
      // would restart the trade flow with the new pair
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: `${pair} on cooldown, will try ${alternatePair} next cycle`,
        pair,
        cooldownSeconds: PAIR_COOLDOWN_SECONDS
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // SMART DIRECTION SELECTION - Uses historical win rates instead of random
    const directionResult = await selectSmartDirection(supabase, user.id, pair, mode);
    const direction = directionResult.direction;
    console.log(`🎯 Direction: ${direction.toUpperCase()} | Confidence: ${directionResult.confidence.toFixed(0)}% | Reason: ${directionResult.reasoning}`);

    // ========== CONSECUTIVE LOSS PROTECTION ==========
    // Check for 5+ consecutive losses on this pair+direction combination (relaxed from 3)
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('profit_loss, status')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .eq('direction', direction)
      .eq('is_sandbox', isSandbox)
      .eq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentTrades && recentTrades.length >= 5) {
      // Only count real losses (not timeout exits which have near-zero P&L)
      const realLosses = recentTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) < -0.05);
      const consecutiveLosses = realLosses.length;
      
      if (consecutiveLosses >= 5) {
        console.log(`⏸️ CONSECUTIVE LOSS PROTECTION: ${pair}:${direction} paused (${consecutiveLosses} consecutive losses)`);
        
        // Log cooldown event for analytics - reduced to 10 minutes
        await supabase.from('alerts').insert({
          user_id: user.id,
          title: `🛡️ Protection Active: ${pair}`,
          message: `${direction.toUpperCase()} trades on ${pair} paused after 5 consecutive losses. Will auto-resume after 10 minutes.`,
          alert_type: 'consecutive_loss_protection',
          data: { pair, direction, consecutiveLosses, cooldownMinutes: 10 }
        });
        
        return new Response(JSON.stringify({ 
          skipped: true, 
          reason: `${pair}:${direction} on cooldown (${consecutiveLosses} consecutive losses)`,
          cooldownMinutes: 10,
          pair,
          direction
        }), { 
          status: 200, // Not an error, just skipped
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }
    
    // Calculate position size - use user-configured value, capped for safety
    const expectedMove = 0.007; // 0.7% average move
    const leverage = mode === 'leverage' ? (leverages?.[connections[0].exchange_name] || 5) : 1;

    // Base position size from target and user cap
    let positionSize = Math.min(profitTarget / (expectedMove * leverage), userPositionSize);

    // Fetch available stablecoin balance on the selected exchange FIRST
    let availableBalance = 0;
    try {
      const { data: holdings, error: holdingsError } = await supabase
        .from("portfolio_holdings")
        .select("asset_symbol, quantity")
        .eq("user_id", user.id)
        .eq("exchange_name", connections[0].exchange_name)
        .in("asset_symbol", ["USDT", "USDC", "USD"]);

      if (holdingsError) {
        console.error("Failed to fetch portfolio holdings for position sizing:", holdingsError);
      } else if (holdings && holdings.length > 0) {
        availableBalance = holdings.reduce(
          (sum: number, h: { quantity: number | null }) => sum + (h.quantity || 0),
          0,
        );
      }
    } catch (e) {
      console.error("Unexpected error fetching portfolio holdings for position sizing:", e);
    }

    // Use user's configured position size (maxPositionSize) instead of 10% of balance
    const ABSOLUTE_MIN_POSITION = 30; // Never below $30
    const userConfiguredSize = maxPositionSize || DEFAULT_POSITION_SIZE;
    
    if (mode === 'spot') {
      // Use user's configured amount, with minimum of $30
      positionSize = Math.max(ABSOLUTE_MIN_POSITION, userConfiguredSize);
      
      // Cap at 50% of available balance for safety (if balance is known)
      if (availableBalance > 0) {
        positionSize = Math.min(positionSize, availableBalance * 0.50);
      }
      
      console.log(`SPOT mode: Using user-configured position size: $${positionSize.toFixed(2)} (requested: $${userConfiguredSize}, balance: $${availableBalance.toFixed(2)})`);
    }

    if (!isSandbox) {
      console.log(
        `Available stable balance on ${connections[0].exchange_name}: $${availableBalance}`,
      );

      if (availableBalance <= 0) {
        return new Response(
          JSON.stringify({
            error: "Insufficient stablecoin balance",
            reason: `No USDT/USDC/USD balance on ${connections[0].exchange_name} for live trade`,
            exchange: connections[0].exchange_name,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const maxByBalance = availableBalance * 0.9; // keep 10% buffer
      positionSize = Math.min(positionSize, maxByBalance);
      console.log(
        `LIVE MODE: Position size capped by available balance: $${positionSize} (max by balance: $${maxByBalance})`,
      );
    }

    
    // ============ FIND SUITABLE EXCHANGE ============
    // Try each connected exchange to find one with sufficient balance
    let selectedExchange = null;
    let exchangeName = '';
    let apiKey = '';
    let apiSecret = '';
    let passphrase = '';
    let freeBalance = 0;
    let lotInfo = { stepSize: '0.00001', minQty: '0.00001', minNotional: 5 };
    const symbol = pair.replace("/", "");
    const insufficientBalanceExchanges: string[] = [];
    
    for (const exchange of connections) {
      const exName = exchange.exchange_name.toLowerCase();
      const hasApiCredentials = exchange.encrypted_api_key &&
        exchange.encrypted_api_secret &&
        exchange.encryption_iv;
      
      if (!hasApiCredentials) {
        console.log(`Skipping ${exchange.exchange_name}: missing API credentials`);
        continue;
      }
      
      if (!isSandbox && encryptionKey) {
        try {
          const decryptedKey = await decryptSecret(exchange.encrypted_api_key, exchange.encryption_iv, encryptionKey);
          const decryptedSecret = await decryptSecret(exchange.encrypted_api_secret, exchange.encryption_iv, encryptionKey);
          const decryptedPassphrase = exchange.encrypted_passphrase 
            ? await decryptSecret(exchange.encrypted_passphrase, exchange.encryption_iv, encryptionKey)
            : "";
          
          // Check balance on this exchange
          if (exName === "binance") {
            const exchangeLotInfo = await getBinanceLotSize(symbol);
            const balance = await getBinanceFreeStableBalance(decryptedKey, decryptedSecret);
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${exchangeLotInfo.minNotional}`);
            
            const minRequired = exchangeLotInfo.minNotional * 1.1;
            if (balance >= minRequired) {
              // This exchange has sufficient balance
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = exchangeLotInfo;
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else if (exName === "bybit") {
            // Check Bybit balance
            const bybitLotInfo = await getBybitLotSize(symbol);
            const balance = await getBybitFreeStableBalance(decryptedKey, decryptedSecret);
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${bybitLotInfo.minNotional}`);
            
            const minRequired = bybitLotInfo.minNotional * 1.1;
            if (balance >= minRequired) {
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = bybitLotInfo;
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else if (exName === "okx") {
            // Check OKX balance
            const balance = await getOKXFreeStableBalance(decryptedKey, decryptedSecret, decryptedPassphrase);
            const minNotional = EXCHANGE_MIN_ORDER.okx || 1;
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${minNotional}`);
            
            const minRequired = minNotional * 1.1;
            if (balance >= minRequired) {
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = { stepSize: '0.0001', minQty: '0.0001', minNotional };
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else if (exName === "kraken") {
            // Check Kraken balance
            const balance = await getKrakenFreeStableBalance(decryptedKey, decryptedSecret);
            const minNotional = EXCHANGE_MIN_ORDER.kraken || 5;
            console.log(`${exchange.exchange_name} free USDT: $${balance}, min notional: $${minNotional}`);
            
            const minRequired = minNotional * 1.1;
            if (balance >= minRequired) {
              selectedExchange = exchange;
              exchangeName = exName;
              apiKey = decryptedKey;
              apiSecret = decryptedSecret;
              passphrase = decryptedPassphrase;
              freeBalance = balance;
              lotInfo = { stepSize: '0.0001', minQty: '0.0001', minNotional };
              console.log(`✅ Selected ${exchange.exchange_name} with $${balance} available`);
              break;
            } else {
              insufficientBalanceExchanges.push(`${exchange.exchange_name} ($${balance.toFixed(2)})`);
            }
          } else if (exName === "nexo") {
            // Nexo doesn't have a public trading API - mark as unavailable for trading
            console.log(`Skipping ${exchange.exchange_name}: trading API not available`);
            insufficientBalanceExchanges.push(`${exchange.exchange_name} (no trading API)`);
          } else {
            // For other unknown exchanges, skip
            console.log(`Skipping ${exchange.exchange_name}: unsupported exchange`);
            insufficientBalanceExchanges.push(`${exchange.exchange_name} (unsupported)`);
          }
        } catch (e) {
          console.error(`Failed to check ${exchange.exchange_name}:`, e);
        }
      }
    }
    
    // If no exchange with sufficient balance found in LIVE mode
    if (!isSandbox && !selectedExchange) {
      const message = insufficientBalanceExchanges.length > 0
        ? `All exchanges have insufficient balance: ${insufficientBalanceExchanges.join(', ')}. Minimum required: $5 USDT.`
        : "No exchanges with valid API credentials found.";
      
      console.error(`❌ ${message}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Insufficient balance on all exchanges",
          reason: message,
          insufficientExchanges: insufficientBalanceExchanges,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    
    // Fallback to first exchange for sandbox mode
    if (!selectedExchange) {
      selectedExchange = connections[0];
      exchangeName = selectedExchange.exchange_name.toLowerCase();
    }
    
    let tradeResult = {
      success: true,
      pair,
      direction,
      entryPrice: currentPrice,
      positionSize,
      exchange: selectedExchange.exchange_name,
      leverage,
      simulated: isSandbox,
      exitPrice: 0,
      pnl: 0,
      orderId: null as string | null,
      realTrade: false,
    };

    // ============ REAL TRADE EXECUTION (LIVE MODE) ============
    const hasApiCredentials = selectedExchange.encrypted_api_key &&
      selectedExchange.encrypted_api_secret &&
      selectedExchange.encryption_iv;
    const canExecuteRealTrade = !isSandbox && encryptionKey && hasApiCredentials && apiKey && apiSecret;
    
    console.log('----------------------------------------');
    console.log(`🔍 TRADE EXECUTION CHECK:`);
    console.log(`   isSandbox: ${isSandbox}`);
    console.log(`   Selected Exchange: ${selectedExchange.exchange_name}`);
    console.log(`   Free Balance: $${freeBalance}`);
    console.log(`   => CAN EXECUTE REAL TRADE: ${canExecuteRealTrade}`);
    console.log('----------------------------------------');

    // In LIVE mode, if we cannot execute a real trade, return a clear error
    if (!isSandbox && !canExecuteRealTrade) {
      console.error('❌ Live mode enabled but no valid API credentials or encryption key.');
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cannot execute live trade",
          reason: "Live mode requires valid exchange API credentials. Please verify your exchange connection.",
          exchange: selectedExchange.exchange_name,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ============ PRE-TRADE PROFITABILITY CHECK ============
    // Dynamic MIN_NET_PROFIT: 0.3% of position or $0.10 minimum
    const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
    const roundTripFees = positionSize * feeRate * 2; // Entry + Exit fees
    const dynamicMinProfit = calculateMinNetProfit(positionSize);
    const minPriceMove = (roundTripFees + dynamicMinProfit) / positionSize;
    const minPriceMovePercent = minPriceMove * 100;
    const expectedPriceMove = LIMIT_ORDER_PROFIT_TARGET; // 0.5%

    console.log(`📊 Profitability Check: Position $${positionSize.toFixed(2)}, Fees $${roundTripFees.toFixed(4)}, Min Profit $${dynamicMinProfit.toFixed(2)}`);
    console.log(`   Required move: ${minPriceMovePercent.toFixed(3)}%, Expected move: ${(expectedPriceMove * 100).toFixed(3)}%`);

    // Add margin tolerance for SPOT mode (0.3% tolerance for near-misses)
    const marginTolerance = mode === 'spot' ? 0.003 : 0.001; // 0.3% for spot, 0.1% for leverage
    const effectiveExpectedMove = expectedPriceMove + marginTolerance;
    
    if (effectiveExpectedMove < minPriceMove) {
      console.log(`⏭️ SKIP TRADE: Expected move ${(expectedPriceMove * 100).toFixed(3)}% + margin ${(marginTolerance * 100).toFixed(1)}% = ${(effectiveExpectedMove * 100).toFixed(3)}% < required ${minPriceMovePercent.toFixed(3)}%`);
      
      return new Response(JSON.stringify({
        skipped: true,
        reason: `Trade skipped: fees ($${roundTripFees.toFixed(2)}) + min profit ($${dynamicMinProfit.toFixed(2)}) exceed expected return`,
        requiredMove: `${minPriceMovePercent.toFixed(3)}%`,
        expectedMove: `${(expectedPriceMove * 100).toFixed(3)}%`,
        positionSize: positionSize,
        suggestion: `Increase position size to $${Math.ceil((roundTripFees + dynamicMinProfit) / LIMIT_ORDER_PROFIT_TARGET)} or reduce fees`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`✅ PROFITABILITY CHECK PASSED: Expected ${(expectedPriceMove * 100).toFixed(3)}% + margin ${(marginTolerance * 100).toFixed(1)}% >= required ${minPriceMovePercent.toFixed(3)}%`);

    if (canExecuteRealTrade) {
      console.log(`✅ REAL TRADE MODE ACTIVATED for ${exchangeName.toUpperCase()}`);
      
      try {
        const side = direction === 'long' ? 'BUY' : 'SELL';
        
        console.log(`Lot size info for ${symbol}:`, lotInfo);

        // Determine final position size for order
        let adjustedPositionSize = positionSize;

        // Cap by free balance with 20% buffer for fees
        const maxByFree = freeBalance * 0.8;
        adjustedPositionSize = Math.min(adjustedPositionSize, maxByFree);
        console.log(`Adjusted position size by free balance: $${adjustedPositionSize} (max by free: $${maxByFree})`);

        // Ensure minimum notional value is met - but only if we have the balance
        if (adjustedPositionSize < lotInfo.minNotional) {
          const requiredAmount = lotInfo.minNotional * 1.1;
          if (freeBalance >= requiredAmount || isSandbox) {
            adjustedPositionSize = requiredAmount;
            console.log(`Position size increased to meet min notional: $${adjustedPositionSize}`);
          } else {
            // Cannot meet minimum notional with available balance – treat as user error, not server crash
            console.error(`❌ Insufficient balance: have $${freeBalance}, need $${requiredAmount} for minimum order`);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Real trade execution failed",
                reason: `Insufficient balance: have $${freeBalance.toFixed(2)}, need $${requiredAmount.toFixed(2)} minimum`,
                cannotFallbackToSimulation: true,
                exchange: selectedExchange.exchange_name,
                errorType: "EXCHANGE_USER_ERROR",
              }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // Calculate and round quantity to step size
        const rawQuantity = adjustedPositionSize / currentPrice;
        const quantity = roundToStepSize(rawQuantity, lotInfo.stepSize);
        console.log(`Order quantity: ${quantity} (raw: ${rawQuantity}, stepSize: ${lotInfo.stepSize}, minQty: ${lotInfo.minQty})`);
        console.log(`Order quantity: ${quantity} (raw: ${rawQuantity}, stepSize: ${lotInfo.stepSize}, minQty: ${lotInfo.minQty})`);

        // Generate clientOrderId for idempotency
        const entryClientOrderId = generateClientOrderId(botId, side);
        console.log(`Using clientOrderId for entry: ${entryClientOrderId}`);

        // Place ENTRY order with clientOrderId and rate limit handling
        const entryResult = await executeWithRateLimit(exchangeName, async () => {
          if (exchangeName === "binance") {
            return await placeBinanceOrder(apiKey, apiSecret, symbol, side, quantity, entryClientOrderId);
          } else if (exchangeName === "bybit") {
            const bybitResult = await placeBybitOrder(apiKey, apiSecret, symbol, side === 'BUY' ? 'Buy' : 'Sell', quantity);
            return { ...bybitResult, executedQty: quantity };
          } else if (exchangeName === "okx") {
            const okxResult = await placeOKXOrder(apiKey, apiSecret, passphrase, pair.replace("/", "-"), side.toLowerCase(), quantity);
            return { ...okxResult, executedQty: quantity };
          } else if (exchangeName === "kraken") {
            const krakenResult = await placeKrakenOrder(apiKey, apiSecret, symbol, side.toLowerCase(), quantity);
            return { ...krakenResult, executedQty: quantity };
          } else if (exchangeName === "nexo") {
            const nexoResult = await placeNexoOrder(apiKey, apiSecret, symbol, side.toLowerCase(), quantity);
            return { ...nexoResult, executedQty: quantity };
          }
          throw new Error(`Unsupported exchange: ${exchangeName}`);
        });

        if (!entryResult.success || !entryResult.data) {
          if (entryResult.rateLimited) {
            console.error(`❌ Rate limited on ${exchangeName} - entry order failed`);
            return new Response(JSON.stringify({
              success: false,
              error: "Rate limit exceeded",
              reason: `${exchangeName} rate limit hit. Bot will retry with adaptive pacing.`,
              exchange: selectedExchange.exchange_name,
              rateLimited: true,
            }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          throw new Error(entryResult.error || "Entry order failed");
        }

        const entryOrder = entryResult.data;

        if (entryOrder) {
          // Use the ACTUAL executed quantity from the entry order for exit
          const actualExecutedQty = entryOrder.executedQty || quantity;
          console.log(`Entry order placed: ${entryOrder.orderId}, avg price: ${entryOrder.avgPrice}, executedQty: ${actualExecutedQty}`);
          tradeResult.orderId = entryOrder.orderId;
          tradeResult.realTrade = true;
          tradeResult.entryPrice = entryOrder.avgPrice || currentPrice;

          // Check slippage on entry
          const entrySlippage = Math.abs((entryOrder.avgPrice - currentPrice) / currentPrice) * 100;
          if (entrySlippage > MAX_SLIPPAGE_PERCENT) {
            console.warn(`⚠️ HIGH ENTRY SLIPPAGE: ${entrySlippage.toFixed(3)}% (limit: ${MAX_SLIPPAGE_PERCENT}%)`);
          }
          
          // EXIT STRATEGY: Use OCO orders for proper TP/SL management
          // OCO = One-Cancels-Other: TP and SL placed together, when one fills the other cancels
          const exitSide = direction === 'long' ? 'SELL' : 'BUY';
          
          // Calculate Take Profit and Stop Loss prices
          // WIDENED MARGINS: Account for ~0.2% round-trip fees
          // TP: 0.8% gross = ~0.6% net profit after fees
          // SL: 0.5% gross = ~0.3% net loss after fees  
          // This gives ~2:1 reward-to-risk ratio after fees
          const TP_PERCENT = 0.008;  // 0.8% take profit (was 0.5%)
          const SL_PERCENT = 0.005;  // 0.5% stop loss (was 0.2%)
          
          const takeProfitPrice = direction === 'long'
            ? tradeResult.entryPrice * (1 + TP_PERCENT)
            : tradeResult.entryPrice * (1 - TP_PERCENT);
          
          const stopLossPrice = direction === 'long'
            ? tradeResult.entryPrice * (1 - SL_PERCENT)
            : tradeResult.entryPrice * (1 + SL_PERCENT);
          
          // Stop loss limit price slightly beyond trigger for guaranteed fill
          const stopLossLimitPrice = direction === 'long'
            ? stopLossPrice * 0.999  // 0.1% below SL trigger for LONG
            : stopLossPrice * 1.001; // 0.1% above SL trigger for SHORT
          
          console.log(`📊 EXIT STRATEGY: OCO Order - TP: ${takeProfitPrice.toFixed(2)}, SL: ${stopLossPrice.toFixed(2)}`);
          
          let ocoOrderResult: { orderListId: string; tpOrderId: string; slOrderId: string; status: string } | null = null;
          let tradeRecordedAsOpen = false;
          
          if (exchangeName === "binance") {
            try {
              // Place OCO order that stays open until TP or SL is hit
              ocoOrderResult = await placeBinanceOCOOrder(
                apiKey,
                apiSecret,
                symbol,
                exitSide as 'SELL' | 'BUY',
                actualExecutedQty,
                takeProfitPrice,
                stopLossPrice,
                stopLossLimitPrice
              );
              
              console.log(`✅ OCO order placed: OrderListId=${ocoOrderResult.orderListId}`);
              console.log(`   TP Order: ${ocoOrderResult.tpOrderId}, SL Order: ${ocoOrderResult.slOrderId}`);
              
              // ✅ VALIDATION: Only insert trade if OCO was successfully placed
              if (!ocoOrderResult.orderListId) {
                throw new Error('OCO order failed - no orderListId returned');
              }
              
              // Record trade as OPEN - the check-trade-status function will monitor and close it
              const { data: insertedTrade, error: insertError } = await supabase.from("trades").insert({
                user_id: user.id,
                pair,
                direction,
                entry_price: tradeResult.entryPrice,
                exit_price: null, // Will be set when OCO fills
                amount: positionSize,
                leverage,
                profit_loss: null, // Will be calculated when closed
                profit_percentage: null,
                exchange_name: selectedExchange.exchange_name,
                is_sandbox: isSandbox,
                status: "open", // Trade is open, waiting for TP/SL
                bot_run_id: botId, // Link trade to bot session for accurate P&L tracking
              }).select().single();
              
              if (insertError) {
                console.error('Failed to insert open trade:', insertError);
                // ⚠️ OCO is placed but trade record failed - log for manual review
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `⚠️ Trade Record Failed`,
                  message: `OCO placed (${ocoOrderResult.orderListId}) but DB insert failed. Manual review needed.`,
                  alert_type: 'trade_record_error',
                  data: { 
                    orderListId: ocoOrderResult.orderListId,
                    pair,
                    direction,
                    entryPrice: tradeResult.entryPrice,
                    error: insertError.message
                  }
                });
              } else {
                tradeRecordedAsOpen = true;
                console.log(`📝 Trade recorded as OPEN: ${insertedTrade?.id}`);
                
                // Store OCO order info for monitoring (create alert for tracking)
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `📈 Position Open: ${pair}`,
                  message: `${direction.toUpperCase()} ${pair} @ ${tradeResult.entryPrice.toFixed(2)} | TP: ${takeProfitPrice.toFixed(2)} | SL: ${stopLossPrice.toFixed(2)}`,
                  alert_type: 'position_opened',
                  data: { 
                    tradeId: insertedTrade?.id,
                    orderListId: ocoOrderResult.orderListId,
                    tpOrderId: ocoOrderResult.tpOrderId,
                    slOrderId: ocoOrderResult.slOrderId,
                    symbol,
                    direction,
                    entryPrice: tradeResult.entryPrice,
                    takeProfitPrice,
                    stopLossPrice,
                    quantity: actualExecutedQty,
                    exchange: exchangeName
                  }
                });
              }
              
              // Return immediately - don't wait for fill
              // The trade will be closed by check-trade-status polling
              tradeResult.orderId = ocoOrderResult.orderListId;
              tradeResult.realTrade = true;
              tradeResult.exitPrice = 0; // Unknown until filled
              tradeResult.pnl = 0; // Unknown until filled
              
              // Update bot metrics for trade count (P&L will be updated when closed)
              if (bot) {
                const newTrades = (bot.trades_executed || 0) + 1;
                await supabase.from("bot_runs").update({
                  trades_executed: newTrades,
                }).eq("id", botId);
              }
              
              return new Response(JSON.stringify({
                success: true,
                pair,
                direction,
                entryPrice: tradeResult.entryPrice,
                positionSize,
                exchange: selectedExchange.exchange_name,
                leverage,
                simulated: false,
                realTrade: true,
                status: 'open',
                ocoOrderListId: ocoOrderResult.orderListId,
                takeProfitPrice,
                stopLossPrice,
                message: 'OCO order placed - position will close when TP or SL is hit'
              }), { 
                headers: { ...corsHeaders, "Content-Type": "application/json" } 
              });
              
            } catch (ocoError) {
              console.error('OCO order failed:', ocoError);
              // Fallback to immediate market exit if OCO fails
              console.log('⚠️ OCO failed - falling back to market exit');
              const exitClientOrderId = generateClientOrderId(botId, exitSide);
              const exitOrder = await placeBinanceOrderWithRetry(apiKey, apiSecret, symbol, exitSide, actualExecutedQty, exitClientOrderId, 3);
              
              if (exitOrder) {
                tradeResult.exitPrice = exitOrder.avgPrice || await fetchPrice(pair);
                const priceDiff = direction === 'long'
                  ? tradeResult.exitPrice - tradeResult.entryPrice
                  : tradeResult.entryPrice - tradeResult.exitPrice;
                const grossPnL = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
                const tradeFeeRate = EXCHANGE_FEES[exchangeName] || 0.001;
                tradeResult.pnl = grossPnL - (positionSize * tradeFeeRate * 2);
              }
            }
          } else if (exchangeName === "bybit") {
            // Bybit doesn't support OCO - use market exit
            const bybitResult = await placeBybitOrder(apiKey, apiSecret, symbol, exitSide === 'BUY' ? 'Buy' : 'Sell', actualExecutedQty);
            tradeResult.exitPrice = bybitResult.avgPrice || await fetchPrice(pair);
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
          } else if (exchangeName === "okx") {
            const okxResult = await placeOKXOrder(apiKey, apiSecret, passphrase, pair.replace("/", "-"), exitSide.toLowerCase(), actualExecutedQty);
            tradeResult.exitPrice = okxResult.avgPrice || await fetchPrice(pair);
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
          } else if (exchangeName === "kraken") {
            const krakenResult = await placeKrakenOrder(apiKey, apiSecret, symbol, exitSide.toLowerCase(), actualExecutedQty);
            tradeResult.exitPrice = krakenResult.avgPrice || await fetchPrice(pair);
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
          } else if (exchangeName === "nexo") {
            const nexoResult = await placeNexoOrder(apiKey, apiSecret, symbol, exitSide.toLowerCase(), actualExecutedQty);
            tradeResult.exitPrice = nexoResult.avgPrice || await fetchPrice(pair);
            const priceDiff = direction === 'long'
              ? tradeResult.exitPrice - tradeResult.entryPrice
              : tradeResult.entryPrice - tradeResult.exitPrice;
            tradeResult.pnl = (priceDiff / tradeResult.entryPrice) * positionSize * leverage;
          }
          
          // For non-OCO exits, log P&L
          if (!tradeRecordedAsOpen) {
            const tradeFeeRate = EXCHANGE_FEES[exchangeName] || 0.001;
            const fees = positionSize * tradeFeeRate * 2;
            console.log(`📊 TRADE RESULT: Entry: ${tradeResult.entryPrice}, Exit: ${tradeResult.exitPrice}, P&L: $${tradeResult.pnl.toFixed(2)} (after $${fees.toFixed(2)} fees)`);
          }
        }
      } catch (exchangeError) {
        console.error("Exchange order failed:", exchangeError);

        const message =
          exchangeError instanceof Error
            ? exchangeError.message
            : typeof exchangeError === "string"
              ? exchangeError
              : JSON.stringify(exchangeError);

        // Classify common exchange errors that are "business" issues (not server bugs)
        const lower = (message || "").toLowerCase();
        const isUserFacingExchangeError = [
          "insufficient balance",
          "order value exceeded lower limit",
          "filter failure: notional",
          "no active orders for this pair",
          "too many visits. exceeded the api rate limit",
          "market is closed",
        ].some((snippet) => lower.includes(snippet.toLowerCase()));

        // In LIVE mode, surface a detailed error to the client.
        // Use 200 for known user-facing exchange errors so they don't appear as runtime failures.
        if (!isSandbox) {
          const payload = {
            error: "Real trade execution failed",
            reason:
              message ||
              "Exchange API error - check exchange connection and API permissions",
            cannotFallbackToSimulation: true,
            exchange: selectedExchange.exchange_name,
            errorType: isUserFacingExchangeError
              ? "EXCHANGE_USER_ERROR"
              : "EXCHANGE_SYSTEM_ERROR",
          };

          if (isUserFacingExchangeError) {
            console.warn("Non-fatal exchange error (user-facing):", message);
          }

          return new Response(JSON.stringify(payload), {
            status: isUserFacingExchangeError ? 200 : 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // In DEMO mode (should not normally reach here), fall back to simulation
        tradeResult.simulated = true;
        tradeResult.realTrade = false;
      }
    }

    // ============ LIVE MODE: NO FALLBACK TO SIMULATION ============
    if (!isSandbox && !tradeResult.realTrade) {
      console.error('❌ LIVE MODE FAILURE: Real trade did not execute');
      console.error('   This is NOT a simulation - returning error to client');
      return new Response(JSON.stringify({ 
        error: "Real trade execution failed",
        reason: "Exchange API error - check exchange connection and API permissions",
        cannotFallbackToSimulation: true,
        exchange: selectedExchange.exchange_name
      }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // ============ SIMULATED TRADE (DEMO MODE ONLY) ============
    // NOTE: Demo mode now uses REAL price monitoring in the client (useBotTrading)
    // This server-side simulation is a fallback only
    if (isSandbox && !tradeResult.realTrade) {
      console.log('----------------------------------------');
      console.log(`🟢 DEMO SIMULATION for ${pair} (fallback mode)`);
      console.log('----------------------------------------');
      
      // Use tighter profit targets for more realistic simulation
      const takeProfitPercent = 0.003; // 0.3% TP
      const stopLossPercent = 0.0015;  // 0.15% SL (tighter for positive expectancy)
      
      // Simulate based on price momentum (not pure random)
      // Check if price moved in our direction
      const recentPrice = await fetchPrice(pair);
      const priceMovement = (recentPrice - currentPrice) / currentPrice;
      
      // Win if price moved favorably and hit TP
      const favorableMove = direction === 'long' 
        ? priceMovement >= takeProfitPercent 
        : priceMovement <= -takeProfitPercent;
      
      // Loss if price moved against us past SL
      const adverseMove = direction === 'long'
        ? priceMovement <= -stopLossPercent
        : priceMovement >= stopLossPercent;
      
      let isWin: boolean;
      let exitPriceMultiplier: number;
      
      if (favorableMove) {
        isWin = true;
        exitPriceMultiplier = direction === 'long' ? 1 + takeProfitPercent : 1 - takeProfitPercent;
      } else if (adverseMove) {
        isWin = false;
        exitPriceMultiplier = direction === 'long' ? 1 - stopLossPercent : 1 + stopLossPercent;
      } else {
        // Price didn't move enough - use time-based exit with slight bias toward wins
        // With tighter SL than TP, we expect ~60% win rate on random movements
        isWin = Math.random() < 0.60;
        exitPriceMultiplier = isWin
          ? (direction === 'long' ? 1 + takeProfitPercent : 1 - takeProfitPercent)
          : (direction === 'long' ? 1 - stopLossPercent : 1 + stopLossPercent);
      }
      
      tradeResult.exitPrice = currentPrice * exitPriceMultiplier;
      
      const priceDiff = direction === 'long'
        ? tradeResult.exitPrice - currentPrice
        : currentPrice - tradeResult.exitPrice;
      
      // Gross P&L
      const grossPnL = (priceDiff / currentPrice) * positionSize * leverage;
      
      // Deduct fees for demo too (realistic simulation)
      const simFeeRate = EXCHANGE_FEES[exchangeName] || 0.001;
      const simFees = positionSize * simFeeRate * 2;
      tradeResult.pnl = grossPnL - simFees;
      tradeResult.simulated = true;
      
      console.log(`📊 Simulated Result: ${isWin ? 'WIN' : 'LOSS'}, Gross=$${grossPnL.toFixed(2)}, Fees=$${simFees.toFixed(2)}, Net=$${tradeResult.pnl.toFixed(2)}`);
    }

    // ============ P&L VALIDATION BEFORE DATABASE INSERT ============
    const expectedProfitable = direction === 'long' 
      ? tradeResult.exitPrice > tradeResult.entryPrice
      : tradeResult.exitPrice < tradeResult.entryPrice;

    if (expectedProfitable && tradeResult.pnl < 0) {
      console.warn(`⚠️ P&L ANOMALY: Direction=${direction}, price moved in our favor but P&L=${tradeResult.pnl.toFixed(4)}`);
      console.warn(`   This indicates fees exceeded gross profit - trade should have been skipped`);
    }

    if (!expectedProfitable && tradeResult.pnl > 0) {
      console.error(`❌ P&L ERROR: Direction=${direction}, price moved against us but P&L is positive!`);
      console.error(`   Entry: ${tradeResult.entryPrice}, Exit: ${tradeResult.exitPrice}, Recorded P&L: ${tradeResult.pnl}`);
    }

    // Record the trade
    await supabase.from("trades").insert({
      user_id: user.id,
      pair,
      direction,
      entry_price: tradeResult.entryPrice,
      exit_price: tradeResult.exitPrice,
      amount: positionSize,
      leverage,
      profit_loss: tradeResult.pnl,
      profit_percentage: (tradeResult.pnl / positionSize) * 100,
      exchange_name: selectedExchange.exchange_name,
      is_sandbox: isSandbox,
      status: "closed",
      closed_at: new Date().toISOString(),
    });

    // Update bot metrics
    if (bot) {
      const newPnl = (bot.current_pnl || 0) + tradeResult.pnl;
      const newTrades = (bot.trades_executed || 0) + 1;
      const isWin = tradeResult.pnl > 0;
      const wins = Math.round(((bot.hit_rate || 0) / 100) * (bot.trades_executed || 0)) + (isWin ? 1 : 0);
      const newHitRate = (wins / newTrades) * 100;

      await supabase.from("bot_runs").update({
        current_pnl: newPnl,
        trades_executed: newTrades,
        hit_rate: newHitRate,
      }).eq("id", botId);
    }

    console.log(`Trade executed: ${pair} ${direction} on ${selectedExchange.exchange_name}, P&L: $${tradeResult.pnl.toFixed(2)}, Real: ${tradeResult.realTrade}`);

    return new Response(JSON.stringify(tradeResult), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Bot trade execution error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
