// Shared price fetching utilities for edge functions
// Consolidates duplicate fetchPrice and fetchPriceOptimized functions

export interface RealtimePriceData {
  price: number;
  priceChangePercent?: number;
  volume?: number;
  lastUpdated: number;
  bidPrice?: number;
  askPrice?: number;
  spread?: number;
}

// WS data staleness threshold (5 seconds)
const WS_STALE_THRESHOLD_MS = 5000;

/**
 * Fetch price from Binance REST API
 * Fallback when WebSocket data is unavailable or stale
 */
export async function fetchPrice(symbol: string): Promise<number> {
  try {
    const normalizedSymbol = symbol.replace('/', '').toUpperCase();
    const response = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${normalizedSymbol}`
    );
    if (!response.ok) {
      console.warn(`[priceUtils] REST price fetch failed for ${normalizedSymbol}: ${response.status}`);
      return 0;
    }
    const data = await response.json();
    return parseFloat(data.price) || 0;
  } catch (error) {
    console.error(`[priceUtils] fetchPrice error for ${symbol}:`, error);
    return 0;
  }
}

/**
 * Fetch price with WebSocket optimization
 * Uses cached WS prices when available (0ms latency)
 * Falls back to REST API if WS data is stale or missing (50-200ms)
 */
export async function fetchPriceOptimized(
  symbol: string,
  realtimePrices?: Record<string, RealtimePriceData>
): Promise<number> {
  const normalizedSymbol = symbol.replace('/', '').toUpperCase();

  // Try WebSocket price first (0ms latency)
  if (realtimePrices) {
    const wsData = realtimePrices[normalizedSymbol];
    if (wsData && wsData.price > 0 && Date.now() - wsData.lastUpdated < WS_STALE_THRESHOLD_MS) {
      console.log(`⚡ [priceUtils] WS price for ${normalizedSymbol}: $${wsData.price.toFixed(2)} (${Date.now() - wsData.lastUpdated}ms old)`);
      return wsData.price;
    }
  }

  // Fallback to REST (50-200ms latency)
  console.log(`🔄 [priceUtils] REST fallback for ${normalizedSymbol}`);
  return await fetchPrice(symbol);
}

/**
 * Batch fetch prices for multiple symbols
 * More efficient than individual calls when fetching many prices
 */
export async function fetchPricesBatch(symbols: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (symbols.length === 0) return priceMap;
  
  try {
    // Use Binance ticker/price endpoint for batch fetching
    const response = await fetch('https://api.binance.com/api/v3/ticker/price');
    if (!response.ok) {
      console.warn('[priceUtils] Batch price fetch failed');
      return priceMap;
    }
    
    const tickers = await response.json();
    const normalizedSymbols = new Set(symbols.map(s => s.replace('/', '').toUpperCase()));
    
    for (const ticker of tickers) {
      if (normalizedSymbols.has(ticker.symbol)) {
        priceMap.set(ticker.symbol, parseFloat(ticker.price));
      }
    }
  } catch (error) {
    console.error('[priceUtils] fetchPricesBatch error:', error);
  }
  
  return priceMap;
}

/**
 * Get momentum from WebSocket data
 * Returns price change percent as decimal (e.g., 0.05 for 5%)
 */
export function getMomentumFromWS(
  pair: string,
  realtimePrices?: Record<string, RealtimePriceData>
): number | null {
  if (!realtimePrices) return null;
  
  const normalizedSymbol = pair.replace('/', '').toUpperCase();
  const wsData = realtimePrices[normalizedSymbol];
  
  if (wsData && wsData.priceChangePercent !== undefined && Date.now() - wsData.lastUpdated < WS_STALE_THRESHOLD_MS) {
    return wsData.priceChangePercent / 100; // Convert percent to decimal
  }
  
  return null;
}
