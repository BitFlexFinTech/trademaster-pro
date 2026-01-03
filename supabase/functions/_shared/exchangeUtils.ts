// Shared exchange utilities for edge functions
// Consolidates balance fetching, order placement, and lot size functions

// ============= TYPES =============
export interface LotSizeData {
  stepSize: string;
  minQty: string;
  minNotional: number;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  avgPrice?: number;
  executedQty?: string;
  error?: string;
}

// ============= SIGNATURE UTILITIES =============

// HMAC-SHA256 signature (hex encoded)
export async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 signature (base64 encoded) - for OKX
export async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ============= DECRYPTION =============

export async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, encryptedBytes);
  return new TextDecoder().decode(decrypted);
}

// ============= BALANCE FUNCTIONS =============

// Fetch free USDT balance from Binance account
export async function getBinanceFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${params}&signature=${signature}`,
      { method: "GET", headers: { "X-MBX-APIKEY": apiKey } },
    );

    if (!response.ok) {
      console.error("[exchangeUtils] Binance balance fetch failed:", response.status);
      return 0;
    }

    const data = await response.json();
    if (!data.balances || !Array.isArray(data.balances)) return 0;

    const usdt = data.balances.find((b: { asset: string }) => b.asset === "USDT");
    if (!usdt) return 0;

    const free = parseFloat(usdt.free ?? "0");
    return Number.isFinite(free) ? free : 0;
  } catch (e) {
    console.error("[exchangeUtils] Binance balance error:", e);
    return 0;
  }
}

// Fetch Binance Futures USDT balance
export async function getBinanceFuturesBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
  try {
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `https://fapi.binance.com/fapi/v2/balance?${params}&signature=${signature}`,
      { method: "GET", headers: { "X-MBX-APIKEY": apiKey } },
    );

    if (!response.ok) return 0;

    const data = await response.json();
    const usdt = (data || []).find((b: { asset: string }) => b.asset === "USDT");
    if (!usdt) return 0;

    const available = parseFloat(usdt.availableBalance || usdt.balance || "0");
    return Number.isFinite(available) ? available : 0;
  } catch (e) {
    console.error("[exchangeUtils] Binance Futures balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from Bybit account
export async function getBybitFreeStableBalance(
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
      console.error("[exchangeUtils] Bybit balance failed:", data.retMsg);
      return 0;
    }

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
    console.error("[exchangeUtils] Bybit balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from OKX account
export async function getOKXFreeStableBalance(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
): Promise<number> {
  try {
    const timestamp = new Date().toISOString();
    const method = "GET";
    const requestPath = "/api/v5/account/balance?ccy=USDT";
    const preHash = timestamp + method + requestPath;
    const signature = await hmacSha256Base64(apiSecret, preHash);

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
      console.error("[exchangeUtils] OKX balance failed:", data.msg);
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
    console.error("[exchangeUtils] OKX balance error:", e);
    return 0;
  }
}

// Fetch free USDT balance from Kraken account
export async function getKrakenFreeStableBalance(
  apiKey: string,
  apiSecret: string,
): Promise<number> {
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
      console.error("[exchangeUtils] Kraken balance failed:", data.error);
      return 0;
    }

    const result = data.result || {};
    const usdt = parseFloat(result.USDT || "0");
    const zusd = parseFloat(result.ZUSD || "0");
    const total = usdt + zusd;
    return Number.isFinite(total) ? total : 0;
  } catch (e) {
    console.error("[exchangeUtils] Kraken balance error:", e);
    return 0;
  }
}

// ============= LOT SIZE FUNCTIONS =============

// In-memory cache for lot sizes
const LOT_SIZE_CACHE: Map<string, { data: LotSizeData; expires: number }> = new Map();
const LOT_SIZE_CACHE_TTL_MS = 3600000; // 1 hour

// Get Binance lot size filters with caching
export async function getBinanceLotSize(symbol: string): Promise<LotSizeData> {
  const cacheKey = `binance:lot_size:${symbol}`;
  
  const cached = LOT_SIZE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    console.log(`⚡ [exchangeUtils] CACHE HIT: ${cacheKey}`);
    return cached.data;
  }
  
  console.log(`🔄 [exchangeUtils] CACHE MISS: ${cacheKey}`);
  
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
    console.error('[exchangeUtils] Binance lot size error:', e);
    return { stepSize: '0.00001', minQty: '0.00001', minNotional: 10 };
  }
}

// Get Bybit lot size info with caching
export async function getBybitLotSize(symbol: string): Promise<LotSizeData> {
  const cacheKey = `bybit:lot_size:${symbol}`;
  
  const cached = LOT_SIZE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    console.log(`⚡ [exchangeUtils] CACHE HIT: ${cacheKey}`);
    return cached.data;
  }
  
  console.log(`🔄 [exchangeUtils] CACHE MISS: ${cacheKey}`);
  
  try {
    const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=spot&symbol=${symbol}`);
    const data = await response.json();
    
    if (data.retCode !== 0 || !data.result?.list?.length) {
      return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
    }
    
    const info = data.result.list[0];
    const lotSizeData: LotSizeData = {
      stepSize: info.lotSizeFilter?.basePrecision || '0.0001',
      minQty: info.lotSizeFilter?.minOrderQty || '0.0001',
      minNotional: parseFloat(info.lotSizeFilter?.minOrderAmt || '5') || 5
    };
    
    LOT_SIZE_CACHE.set(cacheKey, { data: lotSizeData, expires: Date.now() + LOT_SIZE_CACHE_TTL_MS });
    return lotSizeData;
  } catch (e) {
    console.error('[exchangeUtils] Bybit lot size error:', e);
    return { stepSize: '0.0001', minQty: '0.0001', minNotional: 5 };
  }
}

// Get Binance Futures lot size
export async function getBinanceFuturesLotSize(symbol: string): Promise<LotSizeData> {
  const cacheKey = `binance_futures:lot_size:${symbol}`;
  
  const cached = LOT_SIZE_CACHE.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/exchangeInfo`);
    const data = await response.json();
    
    const symbolInfo = data.symbols?.find((s: { symbol: string }) => s.symbol === symbol);
    if (!symbolInfo) {
      return { stepSize: '0.001', minQty: '0.001', minNotional: 5 };
    }
    
    const lotSizeFilter = symbolInfo.filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    const minNotionalFilter = symbolInfo.filters.find((f: { filterType: string }) => f.filterType === 'MIN_NOTIONAL');
    
    const lotSizeData: LotSizeData = {
      stepSize: lotSizeFilter?.stepSize || '0.001',
      minQty: lotSizeFilter?.minQty || '0.001',
      minNotional: parseFloat(minNotionalFilter?.notional || '5') || 5
    };
    
    LOT_SIZE_CACHE.set(cacheKey, { data: lotSizeData, expires: Date.now() + LOT_SIZE_CACHE_TTL_MS });
    return lotSizeData;
  } catch (e) {
    console.error('[exchangeUtils] Binance Futures lot size error:', e);
    return { stepSize: '0.001', minQty: '0.001', minNotional: 5 };
  }
}

// Round quantity to valid step size
export function roundToStepSize(quantity: number, stepSize: string): string {
  const step = parseFloat(stepSize);
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const rounded = Math.floor(quantity / step) * step;
  return rounded.toFixed(precision);
}

// ============= ORDER PLACEMENT =============

// Place Binance Spot order
export async function placeBinanceSpotOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: string,
  clientOrderId?: string
): Promise<OrderResult> {
  try {
    const timestamp = Date.now();
    let params = `symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    if (clientOrderId) params += `&newClientOrderId=${clientOrderId}`;
    const signature = await hmacSha256(apiSecret, params);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/order?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.msg || 'Order failed' };
    }
    
    console.log(`✅ [exchangeUtils] Binance ${side} order filled: ${data.executedQty} @ ${data.fills?.[0]?.price || 'market'}`);
    
    // Calculate average fill price
    let avgPrice = 0;
    if (data.fills?.length > 0) {
      const totalQty = data.fills.reduce((sum: number, f: { qty: string }) => sum + parseFloat(f.qty), 0);
      const totalValue = data.fills.reduce((sum: number, f: { qty: string; price: string }) => 
        sum + parseFloat(f.qty) * parseFloat(f.price), 0);
      avgPrice = totalValue / totalQty;
    }
    
    return { 
      success: true, 
      orderId: data.orderId?.toString(),
      avgPrice: avgPrice || parseFloat(data.price),
      executedQty: data.executedQty
    };
  } catch (e) {
    console.error('[exchangeUtils] Binance order error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Place Bybit Spot order
export async function placeBybitSpotOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'Buy' | 'Sell',
  quantity: string
): Promise<OrderResult> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    
    const body = JSON.stringify({
      category: 'spot',
      symbol,
      side,
      orderType: 'Market',
      qty: quantity,
    });
    
    const signPayload = timestamp + apiKey + recvWindow + body;
    const signature = await hmacSha256(apiSecret, signPayload);
    
    const response = await fetch('https://api.bybit.com/v5/order/create', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': recvWindow,
        'Content-Type': 'application/json',
      },
      body,
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      return { success: false, error: data.retMsg || 'Order failed' };
    }
    
    console.log(`✅ [exchangeUtils] Bybit ${side} order placed: ${data.result.orderId}`);
    return { 
      success: true, 
      orderId: data.result.orderId 
    };
  } catch (e) {
    console.error('[exchangeUtils] Bybit order error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Place Binance Futures order (hedge mode)
export async function placeBinanceFuturesOrder(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'BUY' | 'SELL',
  positionSide: 'LONG' | 'SHORT',
  quantity: string,
  clientOrderId?: string
): Promise<OrderResult> {
  try {
    const timestamp = Date.now();
    let params = `symbol=${symbol}&side=${side}&positionSide=${positionSide}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    if (clientOrderId) params += `&newClientOrderId=${clientOrderId}`;
    const signature = await hmacSha256(apiSecret, params);

    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/order?${params}&signature=${signature}`,
      { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey } }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('[exchangeUtils] Futures order failed:', data);
      return { success: false, error: data.msg || 'Order failed' };
    }
    
    console.log(`✅ [exchangeUtils] Futures ${side} ${positionSide} filled: ${data.executedQty} @ ${data.avgPrice}`);
    return { 
      success: true, 
      orderId: data.orderId?.toString(),
      avgPrice: parseFloat(data.avgPrice),
      executedQty: data.executedQty
    };
  } catch (e) {
    console.error('[exchangeUtils] Futures order error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Place OKX order
export async function placeOKXOrder(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  instId: string,
  side: 'buy' | 'sell',
  sz: string
): Promise<OrderResult> {
  try {
    const timestamp = new Date().toISOString();
    const endpoint = '/api/v5/trade/order';
    const body = JSON.stringify({ instId, tdMode: 'cash', side, ordType: 'market', sz });
    const signPayload = timestamp + 'POST' + endpoint + body;
    const signature = await hmacSha256Base64(apiSecret, signPayload);
    
    const response = await fetch(`https://www.okx.com${endpoint}`, {
      method: 'POST',
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json',
      },
      body,
    });
    
    const data = await response.json();
    if (data.code !== '0') {
      return { success: false, error: data.msg || 'Order failed' };
    }
    
    return { success: true, orderId: data.data?.[0]?.ordId };
  } catch (e) {
    console.error('[exchangeUtils] OKX order error:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============= EXCHANGE FEE RATES =============
export const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,
  bybit: 0.001,
  okx: 0.0008,
  kraken: 0.0016,
  nexo: 0.002,
  kucoin: 0.001,
  hyperliquid: 0.0002,
};
