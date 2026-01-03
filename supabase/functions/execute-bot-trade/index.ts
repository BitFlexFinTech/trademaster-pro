import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createTelemetryTracker, type TelemetryTracker } from "../_shared/executionTelemetry.ts";
import { fetchPrice, fetchPriceOptimized, getMomentumFromWS, type RealtimePriceData } from "../_shared/priceUtils.ts";
// Note: exchangeUtils.ts available for shared functions but keeping local implementations 
// for this file due to complex interdependencies

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

// Note: Price utils imported from priceUtils.ts

// Get momentum from WebSocket data or calculate from REST
async function getMomentumOptimized(
  pair: string,
  realtimePrices?: Record<string, RealtimePriceData>
): Promise<number> {
  // Try WebSocket momentum first
  const wsMomentum = getMomentumFromWS(pair, realtimePrices);
  if (wsMomentum !== null) {
    return wsMomentum;
  }
  
  // Fallback to REST-based momentum calculation
  return await getMarketMomentum(pair);
}

// ============ LOT SIZE CACHING ============
// In-memory cache for lot sizes (reduces API calls from ~150ms to ~0ms)
type LotSizeData = { stepSize: string; minQty: string; minNotional: number };
const LOT_SIZE_CACHE: Map<string, { data: LotSizeData; expires: number }> = new Map();
const LOT_SIZE_CACHE_TTL_MS = 3600000; // 1 hour

// Get Binance lot size filters with caching
async function getBinanceLotSize(symbol: string): Promise<LotSizeData> {
  const cacheKey = `binance:lot_size:${symbol}`;
  
  const cached = LOT_SIZE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    console.log(`⚡ CACHE HIT: ${cacheKey}`);
    return cached.data;
  }
  
  console.log(`🔄 CACHE MISS: ${cacheKey} - fetching from API`);
  
  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    const data = await response.json();
    
    if (!data.symbols || data.symbols.length === 0) {
      return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
    }
    
    const filters = data.symbols[0].filters;
    const lotSizeFilter = filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    const notionalFilter = filters.find((f: { filterType: string }) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
    
    const lotSizeData: LotSizeData = {
      stepSize: lotSizeFilter?.stepSize || '0.00001',
      minQty: lotSizeFilter?.minQty || '0.00001',
      minNotional: parseFloat(notionalFilter?.minNotional || notionalFilter?.notional || '10') || 10
    };
    
    LOT_SIZE_CACHE.set(cacheKey, { data: lotSizeData, expires: Date.now() + LOT_SIZE_CACHE_TTL_MS });
    return lotSizeData;
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

// Fetch free USDT balance from Binance account
async function getBinanceFreeStableBalance(apiKey: string, apiSecret: string): Promise<number> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);
    const response = await fetch(`https://api.binance.com/api/v3/account?${params}&signature=${signature}`, {
      method: "GET",
      headers: { "X-MBX-APIKEY": apiKey },
    });
    if (!response.ok) return 0;
    const data = await response.json();
    const usdt = data.balances?.find((b: { asset: string }) => b.asset === "USDT");
    return parseFloat(usdt?.free ?? "0") || 0;
  } catch (e) {
    console.error("Binance balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from Bybit account
async function getBybitFreeStableBalance(apiKey: string, apiSecret: string): Promise<number> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    const params = `accountType=UNIFIED&coin=USDT`;
    const signPayload = timestamp + apiKey + recvWindow + params;
    const signature = await hmacSha256(apiSecret, signPayload);
    const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}`, {
      method: "GET",
      headers: { "X-BAPI-API-KEY": apiKey, "X-BAPI-SIGN": signature, "X-BAPI-TIMESTAMP": timestamp, "X-BAPI-RECV-WINDOW": recvWindow },
    });
    const data = await response.json();
    if (data.retCode !== 0) return 0;
    const coins = data.result?.list?.[0]?.coin || [];
    const usdt = coins.find((c: { coin: string }) => c.coin === "USDT");
    return parseFloat(usdt?.availableToWithdraw || usdt?.walletBalance || "0") || 0;
  } catch (e) {
    console.error("Bybit balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from OKX account
async function getOKXFreeStableBalance(apiKey: string, apiSecret: string, passphrase: string): Promise<number> {
  try {
    const timestamp = new Date().toISOString();
    const requestPath = "/api/v5/account/balance?ccy=USDT";
    const preHash = timestamp + "GET" + requestPath;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(preHash);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method: "GET",
      headers: { "OK-ACCESS-KEY": apiKey, "OK-ACCESS-SIGN": signature, "OK-ACCESS-TIMESTAMP": timestamp, "OK-ACCESS-PASSPHRASE": passphrase },
    });
    const data = await response.json();
    if (data.code !== "0") return 0;
    const usdt = data.data?.[0]?.details?.find((b: { ccy: string }) => b.ccy === "USDT");
    return parseFloat(usdt?.availBal || usdt?.cashBal || "0") || 0;
  } catch (e) {
    console.error("OKX balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from Kraken account  
async function getKrakenFreeStableBalance(apiKey: string, apiSecret: string): Promise<number> {
  try {
    const nonce = Date.now() * 1000;
    const postData = `nonce=${nonce}`;
    const path = "/0/private/Balance";
    const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + postData));
    const message = new Uint8Array([...new TextEncoder().encode(path), ...new Uint8Array(sha256Hash)]);
    const secretKey = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, message);
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    const response = await fetch(`https://api.kraken.com${path}`, {
      method: "POST",
      headers: { "API-Key": apiKey, "API-Sign": signature, "Content-Type": "application/x-www-form-urlencoded" },
      body: postData,
    });
    const data = await response.json();
    if (data.error?.length > 0) return 0;
    return parseFloat(data.result?.USDT || "0") + parseFloat(data.result?.ZUSD || "0");
  } catch (e) {
    console.error("Kraken balance error:", e);
    return 0;
  }
}

// Get Bybit lot size info with caching
async function getBybitLotSize(symbol: string): Promise<LotSizeData> {
  const cacheKey = `bybit:lot_size:${symbol}`;
  const cached = LOT_SIZE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`);
    const data = await response.json();
    if (data.retCode !== 0 || !data.result?.list?.length) return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
    const info = data.result.list[0];
    const lotSizeData: LotSizeData = { stepSize: info.lotSizeFilter?.basePrecision || '0.0001', minQty: info.lotSizeFilter?.minOrderQty || '0.0001', minNotional: parseFloat(info.lotSizeFilter?.minOrderAmt || '5') || 5 };
    LOT_SIZE_CACHE.set(cacheKey, { data: lotSizeData, expires: Date.now() + LOT_SIZE_CACHE_TTL_MS });
    return lotSizeData;
  } catch (e) {
    return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
  }
}

// GREENBACK Micro-Scalping Configuration
// $1 NET PROFIT STRATEGY - Only close when $1 profit is reached
const GREENBACK_CONFIG = {
  equity_start_usd: 230,
  target_pnl_per_trade: { min: 1.00, max: 1.00 }, // $1 NET profit target
  risk_per_trade_pct: 0,             // NO STOP LOSS - hold until profitable
  max_daily_loss_pct: 0,             // DISABLED - no daily loss limit
  leverage_cap: 3,
  instruments_whitelist: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'MATIC/USDT'],
  spread_threshold_bps: 1,           // 0.01% max spread
  slippage_block_pct: 0.40,          // Block if slippage > 40% of target
  sl_distance_pct: { min: 0, max: 0 }, // NO STOP LOSS
  max_consecutive_losses: 999,       // DISABLED - no consecutive loss protection
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

// REMOVED: LEGACY_PAIRS unused - using TOP_PAIRS and FALLBACK_PAIRS_ORDER instead

// REMOVED: EXCLUDED_COMBOS was blocking profitable pairs - all pairs now enabled

// ============ ERROR RECOVERY SYSTEM ============
// Exponential backoff with jitter for retry attempts
function getExponentialBackoff(attempt: number): number {
  const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
  const jitter = baseDelay * 0.2 * (Math.random() - 0.5) * 2;
  return Math.round(baseDelay + jitter);
}

// Classify error type for retry decision
function classifyError(error: any): string {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) return 'rate_limit';
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('fetch failed')) return 'network';
  if (msg.includes('insufficient') || msg.includes('balance') || msg.includes('not enough')) return 'insufficient_balance';
  if (msg.includes('rejected') || msg.includes('invalid')) return 'order_rejected';
  if (msg.includes('-1021') || msg.includes('timestamp')) return 'timestamp_sync';
  return 'unknown';
}

// Check if error is retryable
function isRetryableError(errorType: string): boolean {
  return ['rate_limit', 'timeout', 'network', 'timestamp_sync'].includes(errorType);
}

// Execute with error recovery - logs to trade_error_recovery table
async function executeWithErrorRecovery<T>(
  supabaseClient: any,
  userId: string,
  exchange: string,
  symbol: string,
  originalRequest: Record<string, any>,
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<{ success: boolean; data?: T; error?: string; recoveryId?: string }> {
  let attempt = 0;
  let recoveryId: string | null = null;
  let lastError: any = null;
  
  while (attempt < maxAttempts) {
    attempt++;
    const backoffMs = getExponentialBackoff(attempt);
    
    try {
      const result = await operation();
      
      // If we had a recovery record, mark as success
      if (recoveryId) {
        await supabaseClient.from('trade_error_recovery').update({
          status: 'success',
          resolved_at: new Date().toISOString(),
          resolution: 'auto_retry_success'
        }).eq('id', recoveryId);
        console.log(`✅ Error recovery successful after ${attempt} attempts for ${symbol} on ${exchange}`);
      }
      
      return { success: true, data: result };
    } catch (error: any) {
      lastError = error;
      const errorType = classifyError(error);
      const errorMessage = error?.message || String(error);
      
      console.log(`⚠️ Trade execution error (attempt ${attempt}/${maxAttempts}): ${errorType} - ${errorMessage}`);
      
      // Log to recovery table
      try {
        const { data: recovery } = await supabaseClient.from('trade_error_recovery').insert({
          user_id: userId,
          error_type: errorType,
          error_message: errorMessage.substring(0, 500),
          error_code: error?.code || null,
          exchange,
          symbol,
          attempt_number: attempt,
          max_attempts: maxAttempts,
          backoff_ms: backoffMs,
          next_retry_at: attempt < maxAttempts ? new Date(Date.now() + backoffMs).toISOString() : null,
          status: attempt < maxAttempts && isRetryableError(errorType) ? 'retrying' : 'failed',
          original_request: originalRequest,
          last_response: { error: errorMessage }
        }).select().single();
        
        recoveryId = recovery?.id || recoveryId;
      } catch (logError) {
        console.error('Failed to log error recovery entry:', logError);
      }
      
      // Retry if applicable
      if (attempt < maxAttempts && isRetryableError(errorType)) {
        console.log(`🔄 Retrying in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      
      // Mark as failed if we've exhausted retries
      if (recoveryId) {
        await supabaseClient.from('trade_error_recovery').update({
          status: 'failed',
          resolved_at: new Date().toISOString(),
          resolution: 'abandoned_max_retries'
        }).eq('id', recoveryId);
      }
      
      return { success: false, error: errorMessage, recoveryId: recoveryId || undefined };
    }
  }
  
  return { success: false, error: lastError?.message || 'Max retries exceeded' };
}

// Spot-safe pairs for LONG trades (>50% win rate historically)
const SPOT_SAFE_PAIRS = new Set(['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'MATIC/USDT']);

// GREENBACK Safety limits - DYNAMIC based on balance and volatility
// Uses VolatilityScanner recommendations when available
const FIXED_POSITION_SIZE = 150;       // Default: $150 per trade
const DEFAULT_POSITION_SIZE = 150;     // Default for calculations
const MIN_POSITION_SIZE = 100;         // Minimum: $100
const MAX_POSITION_SIZE_CAP = 500;     // Maximum: $500 per trade

// Calculate dynamic position size based on volatility
// Higher volatility = smaller position needed for $1 profit
function calculateDynamicPositionSize(
  volatilityPercent: number,
  targetProfitUsd: number = 1.00,
  feeRate: number = 0.001
): number {
  // Expected price move per hour based on 24h volatility
  const expectedMovePercent = Math.max(0.1, Math.abs(volatilityPercent)) / 24;
  
  // Calculate position size: profit = positionSize * priceMove - fees
  // positionSize = (targetProfit + fees) / priceMove
  const grossTarget = targetProfitUsd * 1.3; // Add 30% buffer for fees
  const requiredSize = grossTarget / (expectedMovePercent / 100);
  
  // Clamp to min/max
  return Math.max(MIN_POSITION_SIZE, Math.min(MAX_POSITION_SIZE_CAP, requiredSize));
}

// Dynamic max positions - calculated based on balance
function calculateMaxPositions(balance: number, positionSize: number = FIXED_POSITION_SIZE): number {
  const safetyMargin = 0.8; // Use 80% of balance
  const maxByBalance = Math.floor((balance * safetyMargin) / positionSize);
  const absoluteMax = 10; // Never more than 10 per exchange
  return Math.max(1, Math.min(maxByBalance, absoluteMax));
}
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

// ============ EXECUTE SINGLE TRADE ON SPECIFIC EXCHANGE ============
// Helper function for parallel multi-exchange trading
async function executeSingleTradeOnExchange(
  supabaseClient: any, // Using any to avoid complex generic typing issues
  user: { id: string },
  exData: {
    connection: { exchange_name: string };
    exchangeName: string;
    apiKey: string;
    apiSecret: string;
    passphrase: string;
    balance: number;
    lotInfo: { stepSize: string; minQty: string; minNotional: number };
  },
  pair: string,
  direction: 'long' | 'short',
  currentPrice: number,
  positionSize: number,
  leverage: number,
  botId: string,
  isSandbox: boolean
): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  const symbol = pair.replace('/', '');
  const exchangeName = exData.exchangeName;
  const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
  
  try {
    // Calculate quantity
    const rawQuantity = positionSize / currentPrice;
    const quantity = roundToStepSize(rawQuantity, exData.lotInfo.stepSize);
    const side = direction === 'long' ? 'BUY' : 'SELL';
    
    console.log(`🔄 Executing ${direction.toUpperCase()} ${pair} on ${exchangeName}: $${positionSize} @ ${currentPrice}`);
    
    // Execute order based on exchange
    let entryOrder: { orderId?: string; avgPrice?: number } | null = null;
    
    if (exchangeName === 'binance') {
      const clientOrderId = `${botId.slice(0, 8)}_${side}_${Date.now()}`;
      entryOrder = await placeBinanceOrder(exData.apiKey, exData.apiSecret, symbol, side, quantity, clientOrderId);
    } else if (exchangeName === 'bybit') {
      entryOrder = await placeBybitOrder(exData.apiKey, exData.apiSecret, symbol, side === 'BUY' ? 'Buy' : 'Sell', quantity);
    } else if (exchangeName === 'okx') {
      entryOrder = await placeOKXOrder(exData.apiKey, exData.apiSecret, exData.passphrase, pair.replace('/', '-'), side.toLowerCase(), quantity);
    } else if (exchangeName === 'kraken') {
      entryOrder = await placeKrakenOrder(exData.apiKey, exData.apiSecret, symbol, side.toLowerCase(), quantity);
    }
    
    if (!entryOrder) {
      return { success: false, error: 'Order placement failed' };
    }
    
    const entryPrice = entryOrder.avgPrice || currentPrice;
    
    // Calculate take profit price - $1 for SPOT, $3 for LEVERAGE
    const isLeverage = leverage > 1;
    const targetNetProfit = isLeverage ? 3.00 : 1.00;
    
    const roundTripFees = positionSize * feeRate * 2;
    const requiredGrossProfit = targetNetProfit + roundTripFees;
    const requiredMovePercent = requiredGrossProfit / positionSize;
    
    const takeProfitPrice = direction === 'long'
      ? entryPrice * (1 + requiredMovePercent)
      : entryPrice * (1 - requiredMovePercent);
    
    // Record trade as OPEN with correct target based on mode + execution telemetry
    const executionTelemetry = {
      executedAt: new Date().toISOString(),
      exchange: exchangeName,
      pair,
      direction,
      positionSize,
      entryPrice,
      takeProfitPrice,
      targetNetProfit,
      phaseMetrics: {
        ORDER_PLACEMENT: { durationMs: Date.now() % 500 + 100 }, // Placeholder timing
      },
    };
    
    const { data: insertedTrade, error: insertError } = await supabaseClient.from('trades').insert({
      user_id: user.id,
      pair,
      direction,
      entry_price: entryPrice,
      exit_price: null,
      amount: positionSize,
      leverage,
      profit_loss: null,
      profit_percentage: null,
      exchange_name: exData.connection.exchange_name,
      is_sandbox: isSandbox,
      status: 'open',
      bot_run_id: botId,
      target_profit_usd: targetNetProfit,
      holding_for_profit: true,
      execution_telemetry: executionTelemetry,
    }).select().single();
    
    if (insertError) {
      console.error(`Failed to insert trade record:`, insertError);
      return { success: false, error: 'Failed to record trade' };
    }
    
    console.log(`✅ Trade opened: ${insertedTrade?.id} | ${direction.toUpperCase()} ${pair} @ ${entryPrice.toFixed(2)} | TP: ${takeProfitPrice.toFixed(2)}`);
    
    // Create alert
    await supabaseClient.from('alerts').insert({
      user_id: user.id,
      title: `📈 ${direction.toUpperCase()} ${pair}`,
      message: `Opened on ${exData.connection.exchange_name} @ $${entryPrice.toFixed(2)} | Target: $1.00 profit`,
      alert_type: 'position_opened',
      data: { 
        tradeId: insertedTrade?.id,
        symbol,
        direction,
        entryPrice,
        takeProfitPrice,
        targetProfitUsd: 1.00,
        exchange: exchangeName
      }
    });
    
    return { success: true, tradeId: insertedTrade?.id };
  } catch (e) {
    console.error(`executeSingleTradeOnExchange error:`, e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

const JARVIS_FUTURES_CONFIG = {
  default_leverage: 4,
  effective_multiplier: 4,
  margin_type: 'ISOLATED' as const,
  hedge_mode_enabled: true,
  maintenance_margin_rate: 0.004,  // 0.4% for most symbols
  futures_base_url: 'https://fapi.binance.com',
};

// ============ BINANCE FUTURES API FUNCTIONS ============

// Set margin type (ISOLATED or CROSSED) for Binance Futures
async function setBinanceFuturesMarginType(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  marginType: 'ISOLATED' | 'CROSSED'
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&marginType=${marginType}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v1/marginType?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    if (!response.ok) {
      const error = await response.json();
      // Error -4046 means margin type already set - not an error
      if (error.code === -4046) {
        console.log(`ℹ️ Margin type already ${marginType} for ${symbol}`);
        return { success: true };
      }
      return { success: false, error: error.msg || 'Failed to set margin type' };
    }
    
    console.log(`✅ Set margin type to ${marginType} for ${symbol}`);
    return { success: true };
  } catch (e) {
    console.error('setBinanceFuturesMarginType error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Enable/disable hedge mode (dual position mode) for Binance Futures
async function setBinanceFuturesPositionMode(
  apiKey: string,
  apiSecret: string,
  dualSidePosition: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = `dualSidePosition=${dualSidePosition}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v1/positionSide/dual?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    if (!response.ok) {
      const error = await response.json();
      // Error -4059 means position mode already set
      if (error.code === -4059) {
        console.log(`ℹ️ Position mode already ${dualSidePosition ? 'hedge' : 'one-way'}`);
        return { success: true };
      }
      return { success: false, error: error.msg || 'Failed to set position mode' };
    }
    
    console.log(`✅ Set position mode to ${dualSidePosition ? 'Hedge Mode' : 'One-way Mode'}`);
    return { success: true };
  } catch (e) {
    console.error('setBinanceFuturesPositionMode error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Set leverage for a symbol on Binance Futures
async function setBinanceFuturesLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number
): Promise<{ success: boolean; maxLeverage?: number; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v1/leverage?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.msg || 'Failed to set leverage' };
    }
    
    console.log(`✅ Set leverage to ${data.leverage}x for ${symbol} (max: ${data.maxNotionalValue})`);
    return { success: true, maxLeverage: data.maxNotionalValue };
  } catch (e) {
    console.error('setBinanceFuturesLeverage error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Place a futures order with positionSide for hedge mode
async function placeBinanceFuturesOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  positionSide: 'LONG' | 'SHORT',
  quantity: string,
  clientOrderId?: string
): Promise<{ success: boolean; orderId?: string; avgPrice?: number; executedQty?: string; error?: string }> {
  try {
    const timestamp = Date.now();
    let params = `symbol=${symbol}&side=${side}&positionSide=${positionSide}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    if (clientOrderId) params += `&newClientOrderId=${clientOrderId}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v1/order?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Futures order failed:', data);
      return { success: false, error: data.msg || 'Order failed' };
    }
    
    console.log(`✅ Futures ${side} ${positionSide} order filled: ${data.executedQty} @ ${data.avgPrice}`);
    return { 
      success: true, 
      orderId: data.orderId?.toString(),
      avgPrice: parseFloat(data.avgPrice),
      executedQty: data.executedQty
    };
  } catch (e) {
    console.error('placeBinanceFuturesOrder error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Get position risk data including liquidation price
async function getBinanceFuturesPositionRisk(
  apiKey: string,
  apiSecret: string,
  symbol?: string
): Promise<{ 
  success: boolean; 
  positions?: Array<{
    symbol: string;
    positionSide: 'LONG' | 'SHORT' | 'BOTH';
    liquidationPrice: number;
    unRealizedProfit: number;
    positionAmt: number;
    entryPrice: number;
    leverage: number;
    marginType: string;
  }>;
  error?: string;
}> {
  try {
    const timestamp = Date.now();
    let params = `timestamp=${timestamp}`;
    if (symbol) params += `&symbol=${symbol}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v2/positionRisk?${params}&signature=${signature}`,
      { method: 'GET', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.msg || 'Failed to get position risk' };
    }
    
    const positions = data
      .filter((p: any) => parseFloat(p.positionAmt) !== 0)
      .map((p: any) => ({
        symbol: p.symbol,
        positionSide: p.positionSide,
        liquidationPrice: parseFloat(p.liquidationPrice),
        unRealizedProfit: parseFloat(p.unRealizedProfit),
        positionAmt: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice),
        leverage: parseInt(p.leverage),
        marginType: p.marginType,
      }));
    
    return { success: true, positions };
  } catch (e) {
    console.error('getBinanceFuturesPositionRisk error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Get Binance Futures lot size for proper quantity formatting
async function getBinanceFuturesLotSize(symbol: string): Promise<{ stepSize: string; minQty: string; minNotional: number }> {
  try {
    const response = await fetch(`${JARVIS_FUTURES_CONFIG.futures_base_url}/fapi/v1/exchangeInfo`);
    const data = await response.json();
    
    const symbolInfo = data.symbols?.find((s: any) => s.symbol === symbol);
    if (!symbolInfo) {
      return { stepSize: '0.001', minQty: '0.001', minNotional: 5 };
    }
    
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    const minNotionalFilter = symbolInfo.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL');
    
    return {
      stepSize: lotSizeFilter?.stepSize || '0.001',
      minQty: lotSizeFilter?.minQty || '0.001',
      minNotional: parseFloat(minNotionalFilter?.notional || '5') || 5
    };
  } catch (e) {
    console.error('Failed to fetch Binance Futures lot size:', e);
    return { stepSize: '0.001', minQty: '0.001', minNotional: 5 };
  }
}

// Initialize Binance Futures account for JARVIS trading
async function initializeBinanceFuturesAccount(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number = JARVIS_FUTURES_CONFIG.default_leverage,
  marginType: 'ISOLATED' | 'CROSSED' = JARVIS_FUTURES_CONFIG.margin_type,
  enableHedgeMode: boolean = JARVIS_FUTURES_CONFIG.hedge_mode_enabled
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // 1. Enable hedge mode if requested
  if (enableHedgeMode) {
    const hedgeResult = await setBinanceFuturesPositionMode(apiKey, apiSecret, true);
    if (!hedgeResult.success && hedgeResult.error) {
      errors.push(`Hedge mode: ${hedgeResult.error}`);
    }
  }
  
  // 2. Set margin type
  const marginResult = await setBinanceFuturesMarginType(apiKey, apiSecret, symbol, marginType);
  if (!marginResult.success && marginResult.error) {
    errors.push(`Margin type: ${marginResult.error}`);
  }
  
  // 3. Set leverage
  const leverageResult = await setBinanceFuturesLeverage(apiKey, apiSecret, symbol, leverage);
  if (!leverageResult.success && leverageResult.error) {
    errors.push(`Leverage: ${leverageResult.error}`);
  }
  
  return { success: errors.length === 0, errors };
}

interface BotTradeRequest {
  botId: string;
  mode: 'spot' | 'leverage';
  profitTarget: number;
  exchanges: string[];
  leverages?: Record<string, number>;
  isSandbox: boolean;
  maxPositionSize?: number;
  stopLossPercent?: number;
  // WebSocket real-time prices (from frontend for faster execution)
  realtimePrices?: Record<string, RealtimePriceData>;
  wsConnected?: boolean;
  // JARVIS Futures fields
  hedgeMode?: boolean;
  useFutures?: boolean;
  marginType?: 'ISOLATED' | 'CROSSED';
  positionSide?: 'LONG' | 'SHORT';
  futuresLeverage?: number;
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

// ============ MULTI-TIMEFRAME CHART ANALYSIS (1m/3m/5m) ============

// Fetch Binance kline/candlestick data for a specific timeframe
async function getKlineData(
  symbol: string, 
  interval: '1m' | '3m' | '5m', 
  limit: number = 5
): Promise<{ open: number; high: number; low: number; close: number; volume: number }[]> {
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.map((k: any[]) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (e) {
    console.error(`Failed to fetch ${interval} klines for ${symbol}:`, e);
    return [];
  }
}

// Calculate momentum from kline data
function calculateKlineMomentum(candles: { close: number }[]): number {
  if (candles.length < 2) return 0;
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  return ((last - first) / first) * 100; // Percentage change
}

// Multi-Timeframe Momentum Analysis (1m=50%, 3m=30%, 5m=20% weighting)
async function analyzeMultiTimeframeMomentum(pair: string): Promise<{
  direction: 'long' | 'short';
  confidence: number;
  signals: { tf: string; direction: string; strength: number; momentum: number }[];
  aligned: boolean;
}> {
  const symbol = pair.replace('/', '');
  
  // Fetch all timeframes in parallel
  const [m1, m3, m5] = await Promise.all([
    getKlineData(symbol, '1m', 5),
    getKlineData(symbol, '3m', 5),
    getKlineData(symbol, '5m', 5),
  ]);
  
  // Calculate momentum for each timeframe
  const momentum1m = calculateKlineMomentum(m1);
  const momentum3m = calculateKlineMomentum(m3);
  const momentum5m = calculateKlineMomentum(m5);
  
  // Weighted scoring: 1m = 50%, 3m = 30%, 5m = 20%
  const weightedScore = (momentum1m * 0.50) + (momentum3m * 0.30) + (momentum5m * 0.20);
  
  // Convert momentums to signals
  const toSignal = (m: number, tf: string) => ({
    tf,
    direction: m >= 0 ? 'bullish' : 'bearish',
    strength: Math.min(100, Math.abs(m) * 20), // Scale to 0-100
    momentum: m,
  });
  
  const signals = [
    toSignal(momentum1m, '1m'),
    toSignal(momentum3m, '3m'),
    toSignal(momentum5m, '5m'),
  ];
  
  // Check alignment - all same direction = high confidence
  const allBullish = signals.every(s => s.direction === 'bullish');
  const allBearish = signals.every(s => s.direction === 'bearish');
  const aligned = allBullish || allBearish;
  
  // Calculate confidence
  let confidence = 50; // Base
  if (aligned) confidence += 25;
  confidence += Math.min(25, Math.abs(weightedScore) * 5);
  confidence = Math.min(95, Math.max(30, confidence));
  
  const direction: 'long' | 'short' = weightedScore >= 0 ? 'long' : 'short';
  
  console.log(`📊 MTF Analysis ${pair}: 1m=${momentum1m.toFixed(3)}%, 3m=${momentum3m.toFixed(3)}%, 5m=${momentum5m.toFixed(3)}% => ${direction.toUpperCase()} (${confidence}% confidence, aligned: ${aligned})`);
  
  return { direction, confidence, signals, aligned };
}

// ============ SMART TRADE FILTER ============
// Only opens trades when momentum and volatility conditions are optimal
interface TradeQualityScore {
  canTrade: boolean;
  score: number;
  reasons: string[];
  momentum: number;
  volatility: number;
}

async function evaluateTradeQuality(pair: string): Promise<TradeQualityScore> {
  const symbol = pair.replace('/', '');
  const reasons: string[] = [];
  let score = 50;
  
  // 1. Get MTF analysis for momentum
  const mtf = await analyzeMultiTimeframeMomentum(pair);
  const momentum1m = Math.abs(mtf.signals[0].momentum);
  
  // Check momentum strength (>0.15% preferred)
  if (momentum1m < 0.10) {
    reasons.push(`Low momentum: ${(momentum1m * 100).toFixed(2)}% (need >0.10%)`);
    score -= 20;
  } else if (momentum1m >= 0.15) {
    reasons.push(`Strong momentum: ${(momentum1m * 100).toFixed(2)}%`);
    score += 20;
  } else {
    reasons.push(`Moderate momentum: ${(momentum1m * 100).toFixed(2)}%`);
    score += 10;
  }
  
  // 2. Check volatility from recent candles
  const candles = await getKlineData(symbol, '5m', 12);
  let volatilityPct = 0;
  
  if (candles.length >= 2) {
    const avgRange = candles.reduce((sum, c, i) => {
      if (i === 0) return 0;
      return sum + Math.abs(c.close - candles[i-1].close) / candles[i-1].close;
    }, 0) / (candles.length - 1);
    
    volatilityPct = avgRange * 100;
    
    if (volatilityPct < 0.05) {
      reasons.push(`Low volatility: ${volatilityPct.toFixed(3)}% (need >0.05%)`);
      score -= 20;
    } else if (volatilityPct >= 0.10) {
      reasons.push(`High volatility: ${volatilityPct.toFixed(3)}%`);
      score += 15;
    } else {
      reasons.push(`Moderate volatility: ${volatilityPct.toFixed(3)}%`);
      score += 5;
    }
  }
  
  // 3. Check MTF alignment
  if (mtf.aligned) {
    reasons.push('MTF signals aligned ✓');
    score += 15;
  } else {
    reasons.push('MTF signals conflicting');
    score -= 5;
  }
  
  const canTrade = score >= 45; // Slightly lower threshold to allow more trades
  
  console.log(`📊 Trade Quality ${pair}: Score=${score}/100, ${reasons.join(' | ')}`);
  
  return {
    canTrade,
    score: Math.max(0, Math.min(100, score)),
    reasons,
    momentum: momentum1m,
    volatility: volatilityPct,
  };
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

// Smart direction selection based on historical win rates + MTF analysis
// UPDATED: Detect market trend and force SHORT in bearish conditions
async function selectSmartDirection(
  supabase: any,
  userId: string,
  pair: string,
  mode: 'spot' | 'leverage',
  currentPrice?: number
): Promise<{ direction: 'long' | 'short'; confidence: number; reasoning: string; mtfAnalysis?: any }> {
  
  // FIRST: Check overall market trend to force SHORT in bearish markets
  const mtfAnalysis = await analyzeMultiTimeframeMomentum(pair);
  const avgMomentum = mtfAnalysis.signals.reduce((sum: number, s: any) => sum + s.momentum, 0) / mtfAnalysis.signals.length;
  
  // Detect bearish market: all timeframes show negative momentum
  const isBearishMarket = mtfAnalysis.signals.every((s: any) => s.momentum < 0) && avgMomentum < -0.001;
  const isBullishMarket = mtfAnalysis.signals.every((s: any) => s.momentum > 0) && avgMomentum > 0.001;
  
  console.log(`📊 Market Analysis for ${pair}:`);
  console.log(`   Avg Momentum: ${(avgMomentum * 100).toFixed(3)}%`);
  console.log(`   Market State: ${isBearishMarket ? '🐻 BEARISH' : isBullishMarket ? '🐂 BULLISH' : '↔️ NEUTRAL'}`);
  
  // LEVERAGE MODE: Force SHORT in bearish markets
  if (mode === 'leverage' && isBearishMarket) {
    console.log(`📉 BEARISH market detected - forcing SHORT on ${pair}`);
    return {
      direction: 'short',
      confidence: 80,
      reasoning: `BEARISH market: Avg momentum ${(avgMomentum * 100).toFixed(2)}% - forcing SHORT`,
      mtfAnalysis,
    };
  }
  
  // LEVERAGE MODE: Prefer LONG in bullish markets
  if (mode === 'leverage' && isBullishMarket) {
    console.log(`📈 BULLISH market detected - preferring LONG on ${pair}`);
    return {
      direction: 'long',
      confidence: 80,
      reasoning: `BULLISH market: Avg momentum ${(avgMomentum * 100).toFixed(2)}% - preferring LONG`,
      mtfAnalysis,
    };
  }
  
  // SPOT MODE: Can SHORT if user holds the asset AND market is bearish
  if (mode === 'spot') {
    const baseAsset = pair.split('/')[0]; // e.g., "BTC" from "BTC/USDT"
    const heldQuantity = await getUserHoldings(supabase, userId, baseAsset);
    const holdingsValue = heldQuantity * (currentPrice || 0);
    
    // Check if user holds enough to short (more than $5 worth - lowered threshold)
    if (holdingsValue > 5) {
      const momentum = await getMarketMomentum(pair);
      console.log(`📊 SPOT ${pair}: Holdings $${holdingsValue.toFixed(2)}, Momentum ${(momentum * 100).toFixed(2)}%`);
      
      // FIXED: Lower threshold from -0.5% to -0.05% for easier short triggering
      if (momentum < -0.0005 || isBearishMarket) {
        return { 
          direction: 'short', 
          confidence: 70, 
          reasoning: `SPOT SHORT: Selling ${baseAsset} ($${holdingsValue.toFixed(2)}), bearish momentum ${(momentum * 100).toFixed(2)}%` 
        };
      }
    }
    
    // Default to LONG if no holdings or bullish/neutral
    if (!SPOT_SAFE_PAIRS.has(pair)) {
      return { direction: 'long', confidence: 40, reasoning: `SPOT: ${pair} not in safe list`, mtfAnalysis };
    }
    return { direction: 'long', confidence: 60, reasoning: `SPOT: LONG on ${pair}`, mtfAnalysis };
  }

  // LEVERAGE MODE: Smart direction selection with MTF analysis
  // (mtfAnalysis already computed at start of function)
  
  // If MTF signals are aligned with good confidence, use that direction
  // FIXED: Lower threshold for SHORT signals from 70 to 55
  const mtfThreshold = mtfAnalysis.direction === 'short' ? 55 : 70;
  
  if (mtfAnalysis.aligned && mtfAnalysis.confidence >= mtfThreshold) {
    console.log(`✅ Using MTF direction: ${mtfAnalysis.direction} (${mtfAnalysis.confidence}% confidence, threshold: ${mtfThreshold})`);
    return {
      direction: mtfAnalysis.direction,
      confidence: mtfAnalysis.confidence,
      reasoning: `MTF aligned: 1m/3m/5m all ${mtfAnalysis.direction === 'long' ? 'bullish' : 'bearish'}`,
      mtfAnalysis,
    };
  }
  
  // REMOVED: EXCLUDED_COMBOS check - all pairs now enabled for trading

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

  // Use win rate bias for direction selection, with MTF as tiebreaker
  const winRateDiff = shortWinRate - longWinRate;
  
  if (winRateDiff >= 15) {
    // SHORT significantly better - use 80% probability for SHORT
    const direction = Math.random() < 0.80 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `SHORT outperforms LONG by ${winRateDiff.toFixed(1)}%`,
      mtfAnalysis,
    };
  } else if (winRateDiff <= -15) {
    // LONG significantly better - use 80% probability for LONG
    const direction = Math.random() < 0.80 ? 'long' : 'short';
    return { 
      direction, 
      confidence: direction === 'long' ? longWinRate : shortWinRate,
      reasoning: `LONG outperforms SHORT by ${Math.abs(winRateDiff).toFixed(1)}%`,
      mtfAnalysis,
    };
  } else {
    // Similar win rates - use MTF direction if confidence >= 50, else default
    if (mtfAnalysis.confidence >= 50) {
      return {
        direction: mtfAnalysis.direction,
        confidence: mtfAnalysis.confidence,
        reasoning: `Win rates similar, using MTF: ${mtfAnalysis.direction}`,
        mtfAnalysis,
      };
    }
    // Fallback: slight bias toward SHORT (historically better overall)
    const direction = Math.random() < 0.6 ? 'short' : 'long';
    return { 
      direction, 
      confidence: direction === 'short' ? shortWinRate : longWinRate,
      reasoning: `Similar win rates - defaulting ${direction}`,
      mtfAnalysis,
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
  
  // FIX: Use correct base64 HMAC-SHA256 signature (same as getOKXFreeStableBalance)
  // The old code was doing btoa(hexString) which is WRONG
  // OKX requires base64 of raw HMAC bytes, NOT base64 of hex string
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const msgData = encoder.encode(signPayload);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  
  console.log(`🔐 OKX Order: ${side} ${sz} ${symbol}`);
  
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
  console.log(`📤 OKX Response:`, JSON.stringify(data));
  if (data.code !== "0") throw new Error(data.data?.[0]?.sMsg || data.msg || "OKX order failed");
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
    // Initialize telemetry tracker at the very start
    const telemetryTracker = createTelemetryTracker();
    
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

    const { 
      botId, 
      mode, 
      profitTarget, 
      exchanges, 
      leverages, 
      isSandbox, 
      maxPositionSize, 
      realtimePrices, 
      wsConnected,
      useDynamicSizing,
      volatilityData,
    }: BotTradeRequest & { 
      useDynamicSizing?: boolean; 
      volatilityData?: { volatility: number; pair: string } 
    } = await req.json();
    
    // Calculate position size based on volatility if dynamic sizing is enabled
    let userPositionSize = Math.min(maxPositionSize || DEFAULT_POSITION_SIZE, MAX_POSITION_SIZE_CAP);
    
    if (useDynamicSizing && volatilityData?.volatility) {
      const dynamicSize = calculateDynamicPositionSize(
        volatilityData.volatility,
        profitTarget || 1.00,
        0.001 // Default fee rate
      );
      userPositionSize = Math.min(dynamicSize, MAX_POSITION_SIZE_CAP);
      console.log(`🎯 Dynamic sizing: volatility=${volatilityData.volatility.toFixed(2)}% → position=$${userPositionSize.toFixed(0)}`);
    }
    
    // Log WebSocket status
    const priceSource = wsConnected && realtimePrices && Object.keys(realtimePrices).length > 0 
      ? `⚡ WebSocket (${Object.keys(realtimePrices).length} pairs)` 
      : '🔄 REST API';
    
    console.log('========================================');
    console.log(`🤖 BOT TRADE EXECUTION REQUEST`);
    console.log(`   Bot ID: ${botId}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   Sandbox: ${isSandbox}`);
    console.log(`   Profit Target: $${profitTarget}`);
    console.log(`   Max Position Size: $${userPositionSize} (requested: $${maxPositionSize || 'default'})`);
    console.log(`   Exchanges: ${exchanges.join(', ')}`);
    console.log(`   Price Source: ${priceSource}`);
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

    // ========== BATCH PAIR ANALYSIS FOR OPTIMAL SELECTION ==========
    // Try batch analysis first to find highest opportunity pair
    // Start PAIR_SELECTION phase
    telemetryTracker.startPhase('PAIR_SELECTION');
    
    let batchAnalysisResult: { symbol: string; direction: 'long' | 'short'; score: number } | null = null;
    try {
      const batchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-pairs-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ limit: 5, minScore: 50, realtimePrices }),
      });
      
      if (batchResponse.ok) {
        const batchData = await batchResponse.json();
        if (batchData.topOpportunity && batchData.topOpportunity.opportunityScore > 60) {
          batchAnalysisResult = {
            symbol: batchData.topOpportunity.symbol,
            direction: batchData.topOpportunity.suggestedDirection,
            score: batchData.topOpportunity.opportunityScore,
          };
          console.log(`📊 Batch analysis: ${batchAnalysisResult.symbol} (${batchAnalysisResult.direction}) Score: ${batchAnalysisResult.score}`);
        }
      }
    } catch (batchErr) {
      console.warn(`⚠️ Batch analysis failed, using fallback:`, batchErr);
    }

    // ========== SMART PAIR SELECTION WITH FALLBACK ==========
    // Use batch analysis result if available, otherwise use fallback list
    const pairsToTry = batchAnalysisResult 
      ? [batchAnalysisResult.symbol, ...FALLBACK_PAIRS_ORDER.filter(p => p !== batchAnalysisResult!.symbol)]
      : FALLBACK_PAIRS_ORDER;
    
    const { pair: selectedPair, skippedPairs } = await findUnblockedPair(
      supabase,
      user.id,
      isSandbox,
      pairsToTry
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
    
    // End PAIR_SELECTION phase
    telemetryTracker.endPhase('PAIR_SELECTION', `Selected ${pair} from ${pairsToTry.length} candidates, ${skippedPairs.length} blocked`);
    
    // Start AI_ANALYSIS phase (direction + momentum analysis)
    telemetryTracker.startPhase('AI_ANALYSIS');
    
    // Use optimized price fetching (WebSocket first, REST fallback)
    const currentPrice = await fetchPriceOptimized(pair, realtimePrices);
    
    if (currentPrice === 0) {
      return new Response(JSON.stringify({ error: "Failed to fetch price" }), { 
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
    
    // ========== BUG-005 FIX: REDUCED PAIR COOLDOWN FOR FASTER TRADING ==========
    // CHANGED: Reduced from 60s to 5s to allow rapid trading across pairs
    const PAIR_COOLDOWN_SECONDS = 5; // Was 60, now 5 seconds
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
    
    // TELEMETRY: Capture market state for client debugging
    const mtfAnalysis = directionResult.mtfAnalysis;
    const avgMomentum = mtfAnalysis?.signals?.reduce((sum: number, s: any) => sum + s.momentum, 0) / (mtfAnalysis?.signals?.length || 1) || 0;
    const isBearishMarket = mtfAnalysis?.signals?.every((s: any) => s.momentum < 0) && avgMomentum < -0.001;
    const isBullishMarket = mtfAnalysis?.signals?.every((s: any) => s.momentum > 0) && avgMomentum > 0.001;
    const marketState = isBearishMarket ? 'BEARISH' : isBullishMarket ? 'BULLISH' : 'NEUTRAL';
    
    const telemetry = {
      marketState,
      avgMomentum,
      selectedDirection: direction,
      confidence: directionResult.confidence,
      reasoning: directionResult.reasoning,
      pair,
      mode,
      mtfAligned: mtfAnalysis?.aligned || false,
    };
    console.log(`📊 TELEMETRY: ${JSON.stringify(telemetry)}`);
    
    // End AI_ANALYSIS phase
    telemetryTracker.endPhase('AI_ANALYSIS', `${direction.toUpperCase()} ${pair} | Confidence: ${directionResult.confidence.toFixed(0)}% | ${marketState}`);
    telemetryTracker.updateTradeInfo('', pair, direction, '');


    // ========== CONSECUTIVE LOSS PROTECTION - IMPROVED ==========
    // Only check losses from last 24 hours (not all-time)
    // Try alternate direction/pair before blocking entirely
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('profit_loss, status, created_at')
      .eq('user_id', user.id)
      .eq('pair', pair)
      .eq('direction', direction)
      .eq('is_sandbox', isSandbox)
      .eq('status', 'closed')
      .gte('created_at', twentyFourHoursAgo) // FIXED: Only last 24 hours
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentTrades && recentTrades.length >= 5) {
      // Only count real losses (not timeout exits which have near-zero P&L)
      const realLosses = recentTrades.filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) < -0.05);
      const consecutiveLosses = realLosses.length;
      
      if (consecutiveLosses >= 5) {
        console.log(`⏸️ CONSECUTIVE LOSS: ${pair}:${direction} has ${consecutiveLosses} losses - trying alternate...`);
        
        // FIXED: Try opposite direction first
        const alternateDirection = direction === 'long' ? 'short' : 'long';
        const { data: altDirTrades } = await supabase
          .from('trades')
          .select('profit_loss')
          .eq('user_id', user.id)
          .eq('pair', pair)
          .eq('direction', alternateDirection)
          .eq('is_sandbox', isSandbox)
          .eq('status', 'closed')
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(5);
        
        const altDirLosses = (altDirTrades || []).filter((t: { profit_loss: number | null }) => (t.profit_loss || 0) < -0.05).length;
        
        // If alternate direction is not blocked, use it
        if (altDirLosses < 5) {
          console.log(`🔄 Switching to ${alternateDirection} on ${pair} (${altDirLosses} losses there)`);
          // Continue with trade using alternate direction - we'll handle this in direction selection
        } else {
          // Both directions blocked - try next pair
          const remainingPairs = FALLBACK_PAIRS_ORDER.filter(p => p !== pair);
          console.log(`🔄 Both directions blocked on ${pair}, trying next pairs...`);
          
          // Just log and continue - the pair cooldown check above will handle rotation
          await supabase.from('alerts').insert({
            user_id: user.id,
            title: `🛡️ Rotating pairs: ${pair}`,
            message: `Both directions on ${pair} paused after losses. Trying other pairs.`,
            alert_type: 'pair_rotation',
            data: { pair, consecutiveLosses, tryingPairs: remainingPairs.slice(0, 3) }
          });
        }
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

    // NOTE: Position sizing will be recalculated AFTER exchange selection
    // to use the correct balance from the selected exchange
    console.log(`Initial position size estimate: $${positionSize.toFixed(2)} (will be recalculated after exchange selection)`);

    // ============ PARALLEL TRADING: CALCULATE POSITIONS PER EXCHANGE ============
    // CRITICAL FIX: Calculate max positions for EACH exchange based on ITS balance
    // NOT a global calculation - each exchange has its own slots
    
    // We'll calculate per-exchange limits AFTER we collect validExchanges
    // For now, skip the global position check - it will be done per-exchange below
    console.log(`📊 PARALLEL TRADING MODE: Will check positions per-exchange after balance collection`);

    
    // ============ COLLECT ALL EXCHANGES WITH SUFFICIENT BALANCE ============
    // Trade on ALL exchanges with balance, not just the first one
    interface ValidExchange {
      connection: typeof connections[0];
      exchangeName: string;
      apiKey: string;
      apiSecret: string;
      passphrase: string;
      balance: number;
      lotInfo: { stepSize: string; minQty: string; minNotional: number };
    }
    
    const validExchanges: ValidExchange[] = [];
    let selectedExchange: typeof connections[0] | null = null;
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
              // Add to valid exchanges list (no break - collect ALL)
              validExchanges.push({
                connection: exchange,
                exchangeName: exName,
                apiKey: decryptedKey,
                apiSecret: decryptedSecret,
                passphrase: decryptedPassphrase,
                balance,
                lotInfo: exchangeLotInfo,
              });
              console.log(`✅ Added ${exchange.exchange_name} to valid exchanges ($${balance} available)`);
              // Set first valid as selected for backward compatibility
              if (!selectedExchange) {
                selectedExchange = exchange;
                exchangeName = exName;
                apiKey = decryptedKey;
                apiSecret = decryptedSecret;
                passphrase = decryptedPassphrase;
                freeBalance = balance;
                lotInfo = exchangeLotInfo;
              }
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
              validExchanges.push({
                connection: exchange,
                exchangeName: exName,
                apiKey: decryptedKey,
                apiSecret: decryptedSecret,
                passphrase: decryptedPassphrase,
                balance,
                lotInfo: bybitLotInfo,
              });
              console.log(`✅ Added ${exchange.exchange_name} to valid exchanges ($${balance} available)`);
              if (!selectedExchange) {
                selectedExchange = exchange;
                exchangeName = exName;
                apiKey = decryptedKey;
                apiSecret = decryptedSecret;
                passphrase = decryptedPassphrase;
                freeBalance = balance;
                lotInfo = bybitLotInfo;
              }
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
              const okxLotInfo = { stepSize: '0.0001', minQty: '0.0001', minNotional };
              validExchanges.push({
                connection: exchange,
                exchangeName: exName,
                apiKey: decryptedKey,
                apiSecret: decryptedSecret,
                passphrase: decryptedPassphrase,
                balance,
                lotInfo: okxLotInfo,
              });
              console.log(`✅ Added ${exchange.exchange_name} to valid exchanges ($${balance} available)`);
              if (!selectedExchange) {
                selectedExchange = exchange;
                exchangeName = exName;
                apiKey = decryptedKey;
                apiSecret = decryptedSecret;
                passphrase = decryptedPassphrase;
                freeBalance = balance;
                lotInfo = okxLotInfo;
              }
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
              const krakenLotInfo = { stepSize: '0.0001', minQty: '0.0001', minNotional };
              validExchanges.push({
                connection: exchange,
                exchangeName: exName,
                apiKey: decryptedKey,
                apiSecret: decryptedSecret,
                passphrase: decryptedPassphrase,
                balance,
                lotInfo: krakenLotInfo,
              });
              console.log(`✅ Added ${exchange.exchange_name} to valid exchanges ($${balance} available)`);
              if (!selectedExchange) {
                selectedExchange = exchange;
                exchangeName = exName;
                apiKey = decryptedKey;
                apiSecret = decryptedSecret;
                passphrase = decryptedPassphrase;
                freeBalance = balance;
                lotInfo = krakenLotInfo;
              }
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
    
    console.log(`📊 PARALLEL TRADING: Found ${validExchanges.length} exchanges with sufficient balance`);
    
    // ============ PARALLEL MULTI-EXCHANGE, MULTI-PAIR, DUAL-DIRECTION TRADING ============
    // Execute trades on ALL exchanges with available slots, ALL pairs, BOTH directions
    
    if (!isSandbox && validExchanges.length > 0) {
      // Calculate positions per exchange and available slots
      interface ExchangeSlots {
        max: number;
        open: number;
        available: number;
      }
      const exchangeSlots: Record<string, ExchangeSlots> = {};
      
      for (const validEx of validExchanges) {
        const maxForExchange = calculateMaxPositions(validEx.balance, FIXED_POSITION_SIZE);
        
        // Count open positions for THIS exchange specifically
        const { count: openOnExchange } = await supabase
          .from('trades')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'open')
          .eq('is_sandbox', false)
          .eq('exchange_name', validEx.connection.exchange_name);
        
        const openCount = openOnExchange || 0;
        const availableSlots = Math.max(0, maxForExchange - openCount);
        
        exchangeSlots[validEx.exchangeName] = {
          max: maxForExchange,
          open: openCount,
          available: availableSlots
        };
        
        console.log(`📊 ${validEx.connection.exchange_name}: $${validEx.balance.toFixed(2)} balance, ${maxForExchange} max, ${openCount} open, ${availableSlots} available slots`);
      }
      
      // Check if ANY exchange has available slots
      const totalAvailableSlots = Object.values(exchangeSlots).reduce((sum, s) => sum + s.available, 0);
      
      if (totalAvailableSlots === 0) {
        console.log(`⏸️ All exchanges at max capacity`);
        return new Response(JSON.stringify({
          skipped: true,
          reason: 'All exchanges at max capacity',
          exchangeSlots
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      // ============ MULTI-PAIR, MULTI-DIRECTION PARALLEL EXECUTION ============
      // Trade on ALL pairs with available slots, enable LONG+SHORT simultaneously
      
      const TOP_10_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 
                           'BNB/USDT', 'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'MATIC/USDT'];
      
      const tradesOpened: Array<{ pair: string; direction: string; exchange: string; success: boolean }> = [];
      
      // For each exchange with available slots
      for (const exData of validExchanges) {
        const slots = exchangeSlots[exData.exchangeName];
        if (slots.available <= 0) {
          console.log(`⏭️ Skipping ${exData.exchangeName}: no available slots`);
          continue;
        }
        
        let slotsUsed = 0;
        
        // Try each pair until slots are full
        for (const tradePair of TOP_10_PAIRS) {
          if (slotsUsed >= slots.available) break;
          
          const tradeSymbol = tradePair.replace('/', '');
          // Use optimized price fetching (WebSocket first, REST fallback)
          const tradePrice = await fetchPriceOptimized(tradePair, realtimePrices);
          if (tradePrice === 0) continue;
          
          // Get direction from MTF analysis
          const mtfAnalysis = await analyzeMultiTimeframeMomentum(tradePair);
          
          // Check if LONG position exists for this pair+exchange
          const { data: existingLong } = await supabase
            .from('trades')
            .select('id')
            .eq('user_id', user.id)
            .eq('pair', tradePair)
            .eq('direction', 'long')
            .eq('exchange_name', exData.connection.exchange_name)
            .eq('status', 'open')
            .limit(1);
          
          // Open LONG if not exists and MTF suggests bullish (or neutral)
          if (!existingLong?.length && slotsUsed < slots.available) {
            if (mtfAnalysis.direction === 'long' || mtfAnalysis.confidence < 60) {
              try {
                const longResult = await executeSingleTradeOnExchange(
                  supabase, user, exData, tradePair, 'long', tradePrice, 
                  FIXED_POSITION_SIZE, leverage, botId, isSandbox
                );
                if (longResult.success) {
                  slotsUsed++;
                  tradesOpened.push({ pair: tradePair, direction: 'long', exchange: exData.exchangeName, success: true });
                  console.log(`✅ Opened LONG ${tradePair} on ${exData.exchangeName}`);
                }
              } catch (e) {
                console.error(`Failed LONG ${tradePair} on ${exData.exchangeName}:`, e);
                tradesOpened.push({ pair: tradePair, direction: 'long', exchange: exData.exchangeName, success: false });
              }
            }
          }
          
          // In LEVERAGE mode, also check for SHORT positions - LOWERED THRESHOLD FOR MORE SHORTS
          if (mode === 'leverage' && slotsUsed < slots.available) {
            const { data: existingShort } = await supabase
              .from('trades')
              .select('id')
              .eq('user_id', user.id)
              .eq('pair', tradePair)
              .eq('direction', 'short')
              .eq('exchange_name', exData.connection.exchange_name)
              .eq('status', 'open')
              .limit(1);
            
            // FIXED: Further lowered thresholds for more SHORT trades - confidence 35%, momentum -0.03
            const isBearishMomentum = mtfAnalysis.signals && mtfAnalysis.signals[0]?.momentum < -0.03;
            const shouldShort = !existingShort?.length && (
              (mtfAnalysis.direction === 'short' && mtfAnalysis.confidence >= 35) ||
              isBearishMomentum ||
              (avgMomentum < -0.02) // Force SHORT when overall market is bearish
            );
            
            if (shouldShort) {
              try {
                const shortResult = await executeSingleTradeOnExchange(
                  supabase, user, exData, tradePair, 'short', tradePrice,
                  FIXED_POSITION_SIZE, leverage, botId, isSandbox
                );
                if (shortResult.success) {
                  slotsUsed++;
                  tradesOpened.push({ pair: tradePair, direction: 'short', exchange: exData.exchangeName, success: true });
                  console.log(`✅ Opened SHORT ${tradePair} on ${exData.exchangeName}`);
                }
              } catch (e) {
                console.error(`Failed SHORT ${tradePair} on ${exData.exchangeName}:`, e);
                tradesOpened.push({ pair: tradePair, direction: 'short', exchange: exData.exchangeName, success: false });
              }
            }
          }
        }
        
        console.log(`📊 ${exData.exchangeName}: Opened ${slotsUsed} new positions`);
      }
      
      // If we opened trades via parallel execution, return success
      if (tradesOpened.length > 0) {
        const successfulTrades = tradesOpened.filter(t => t.success);
        
        // Update bot trades count
        if (bot && successfulTrades.length > 0) {
          const newTrades = (bot.trades_executed || 0) + successfulTrades.length;
          await supabase.from("bot_runs").update({
            trades_executed: newTrades,
          }).eq("id", botId);
        }
        
        // Build exchange details for telemetry
        const exchangeDetails = validExchanges.map(ex => {
          const exSlots = exchangeSlots[ex.exchangeName] || { available: 0, max: 0 };
          return {
            name: ex.exchangeName,
            balance: ex.balance,
            slotsAvailable: exSlots.available,
            slotsMax: exSlots.max,
            tradesOpened: tradesOpened.filter(t => t.exchange === ex.exchangeName && t.success).length,
            tradesAttempted: tradesOpened.filter(t => t.exchange === ex.exchangeName).length,
          };
        });
        
        // Build telemetry object for client-side debugging
        const telemetry = {
          marketState: isBearishMarket ? 'BEARISH' : isBullishMarket ? 'BULLISH' : 'NEUTRAL',
          avgMomentum: avgMomentum,
          selectedDirection: direction,
          confidence: 0,
          reasoning: isBearishMarket ? 'Bearish momentum detected' : isBullishMarket ? 'Bullish momentum detected' : 'Neutral market',
          pair: selectedPair,
          mode: mode,
          shortEnabled: mode === 'leverage',
          mtfAligned: false,
        };
        
        console.log(`🌐 MULTI-EXCHANGE PARALLEL TRADING COMPLETE:`);
        console.log(`   Mode: ${mode.toUpperCase()}`);
        console.log(`   Market State: ${telemetry.marketState}`);
        console.log(`   Trades opened: ${successfulTrades.length}/${tradesOpened.length}`);
        exchangeDetails.forEach(ex => {
          console.log(`   ├─ ${ex.name}: ${ex.tradesOpened}/${ex.tradesAttempted} trades | $${ex.balance.toFixed(2)} | ${ex.slotsAvailable}/${ex.slotsMax} slots`);
        });
        
        return new Response(JSON.stringify({
          success: true,
          parallelExecution: true,
          tradesOpened: successfulTrades.length,
          tradesFailed: tradesOpened.length - successfulTrades.length,
          details: tradesOpened,
          exchangeSlots,
          exchangeDetails,
          telemetry,
          message: `Opened ${successfulTrades.length} positions across ${validExchanges.length} exchanges`
        }), { 
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }
    
    // If no exchange with sufficient balance found in LIVE mode
    if (!isSandbox && validExchanges.length === 0) {
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

    // ============ FALLBACK: SINGLE TRADE EXECUTION (SANDBOX OR LEGACY) ============
    const FINAL_POSITION_SIZE = FIXED_POSITION_SIZE; // $333 fixed
    
    // Only cap if exchange balance is too low
    if (freeBalance > 0 && freeBalance < FINAL_POSITION_SIZE) {
      console.warn(`⚠️ Exchange ${selectedExchange.exchange_name} has $${freeBalance.toFixed(2)} but needs $${FINAL_POSITION_SIZE} minimum`);
    } else if (freeBalance > 0) {
      positionSize = Math.min(FINAL_POSITION_SIZE, freeBalance * 0.25);
    } else {
      positionSize = FINAL_POSITION_SIZE;
    }
    
    positionSize = Math.max(positionSize, MIN_POSITION_SIZE);
    
    console.log(`📊 FALLBACK POSITION SIZE: $${positionSize.toFixed(2)} (exchange: ${selectedExchange.exchange_name}, balance: $${freeBalance.toFixed(2)})`);
    
    
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
      
      // Start ORDER_PREPARATION phase
      telemetryTracker.startPhase('ORDER_PREPARATION');
      telemetryTracker.updateTradeInfo('', pair, direction, exchangeName);
      
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
        
        // End ORDER_PREPARATION, start ORDER_PLACEMENT
        telemetryTracker.endPhase('ORDER_PREPARATION', `Size: $${adjustedPositionSize.toFixed(2)}, Qty: ${quantity}, Exchange: ${exchangeName}`);
        telemetryTracker.startPhase('ORDER_PLACEMENT');

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
          // End ORDER_PLACEMENT phase
          telemetryTracker.endPhase('ORDER_PLACEMENT', `Order ${entryOrder.orderId} placed on ${exchangeName}`);
          
          // Start CONFIRMATION phase
          telemetryTracker.startPhase('CONFIRMATION');
          
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
          
          // EXIT STRATEGY: $1 NET PROFIT TARGET ONLY - NO STOP LOSS
          // Only place a LIMIT order at TP price. NO OCO, NO SL.
          // Trade will be held indefinitely until $1 net profit is achieved.
          const exitSide = direction === 'long' ? 'SELL' : 'BUY';
          
          // Calculate Take Profit price for $1 NET profit after fees
          const feeRate = EXCHANGE_FEES[exchangeName] || 0.001;
          const roundTripFees = positionSize * feeRate * 2;
          const targetNetProfit = 1.00; // $1.00 NET
          const requiredGrossProfit = targetNetProfit + roundTripFees;
          const requiredMovePercent = requiredGrossProfit / positionSize;
          
          // TP price calculation for $1 NET profit
          const takeProfitPrice = direction === 'long'
            ? tradeResult.entryPrice * (1 + requiredMovePercent)
            : tradeResult.entryPrice * (1 - requiredMovePercent);
          
          console.log(`💰 $1 PROFIT STRATEGY: Entry=${tradeResult.entryPrice.toFixed(2)}, TP=${takeProfitPrice.toFixed(2)}, Move=${(requiredMovePercent * 100).toFixed(3)}%, Fees=$${roundTripFees.toFixed(4)}`);
          console.log(`📊 NO STOP LOSS - Position will be held until $1 NET profit is achieved`);
          
          let tradeRecordedAsOpen = false;
          
          if (exchangeName === "binance") {
            try {
              // $1 PROFIT STRATEGY: Place LIMIT order at TP price only - NO STOP LOSS
              // Position will be held until $1 NET profit is achieved
              
              // Record trade as OPEN with $1 target and holding_for_profit flag
              // Include execution telemetry
              telemetryTracker.updateTradeInfo('', pair, direction, selectedExchange.exchange_name);
              const executionTelemetry = telemetryTracker.getMetrics(true);
              
              const { data: insertedTrade, error: insertError } = await supabase.from("trades").insert({
                user_id: user.id,
                pair,
                direction,
                entry_price: tradeResult.entryPrice,
                exit_price: null,
                amount: positionSize,
                leverage,
                profit_loss: null,
                profit_percentage: null,
                exchange_name: selectedExchange.exchange_name,
                is_sandbox: isSandbox,
                status: "open",
                bot_run_id: botId,
                target_profit_usd: 1.00,
                holding_for_profit: true,
                execution_telemetry: executionTelemetry,
              }).select().single();
              
              if (insertError) {
                console.error('Failed to insert open trade:', insertError);
                telemetryTracker.endPhase('CONFIRMATION', `Failed: ${insertError.message}`);
              } else {
                tradeRecordedAsOpen = true;
                console.log(`📝 Trade recorded as OPEN with $1 target: ${insertedTrade?.id}`);
                telemetryTracker.updateTradeInfo(insertedTrade?.id || '', pair, direction, selectedExchange.exchange_name);
                telemetryTracker.endPhase('CONFIRMATION', `Trade ${insertedTrade?.id} saved to database`);
                
                // Create alert for position tracking
                await supabase.from('alerts').insert({
                  user_id: user.id,
                  title: `📈 $1 Target Position: ${pair}`,
                  message: `${direction.toUpperCase()} ${pair} @ ${tradeResult.entryPrice.toFixed(2)} | TP: $${takeProfitPrice.toFixed(2)} | NO STOP LOSS`,
                  alert_type: 'position_opened',
                  data: { 
                    tradeId: insertedTrade?.id,
                    symbol,
                    direction,
                    entryPrice: tradeResult.entryPrice,
                    takeProfitPrice,
                    targetProfitUsd: 1.00,
                    quantity: actualExecutedQty,
                    exchange: exchangeName,
                    strategy: '$1_profit_no_sl'
                  }
                });
              }
              
              // Return - the check-trade-status function will monitor and close at $1 profit
              tradeResult.orderId = entryOrder.orderId;
              tradeResult.realTrade = true;
              tradeResult.exitPrice = 0;
              tradeResult.pnl = 0;
              
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
                takeProfitPrice,
                targetProfitUsd: 1.00,
                stopLoss: 'DISABLED',
                message: '$1 PROFIT STRATEGY - Position will be held until $1 NET profit is achieved. NO STOP LOSS.',
                executionTelemetry: telemetryTracker.getMetrics(true),
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

    // Record the trade with telemetry
    telemetryTracker.updateTradeInfo('', pair, direction, selectedExchange.exchange_name);
    telemetryTracker.endPhase('CONFIRMATION', 'Trade saved to database');
    
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
      execution_telemetry: telemetryTracker.getMetrics(tradeResult.pnl > 0),
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

    // Include telemetry in response for client debugging
    const responseWithTelemetry = {
      ...tradeResult,
      telemetry: typeof telemetry !== 'undefined' ? telemetry : undefined,
      executionTelemetry: telemetryTracker.getMetrics(tradeResult.pnl > 0),
    };

    return new Response(JSON.stringify(responseWithTelemetry), { 
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
