import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Trade {
  timestamp: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  isWin: boolean;
  holdingPeriod: number;
}

// Fetch historical klines from Binance
async function fetchHistoricalData(
  symbol: string,
  startTime: number,
  endTime: number,
  interval: string = '5m'
): Promise<Candle[]> {
  const candles: Candle[] = [];
  let currentStart = startTime;
  const limit = 1000;
  
  while (currentStart < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${currentStart}&endTime=${endTime}&limit=${limit}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.length) break;
    
    for (const k of data) {
      candles.push({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      });
    }
    
    currentStart = data[data.length - 1][0] + 1;
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  return candles;
}

// Calculate Simple Moving Average
function calculateSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Calculate RSI
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate Bollinger Bands
function calculateBollingerBands(closes: number[], period: number = 20): { upper: number; middle: number; lower: number } {
  const sma = calculateSMA(closes, period);
  const slice = closes.slice(-period);
  const squaredDiffs = slice.map(c => Math.pow(c - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (2 * stdDev),
    middle: sma,
    lower: sma - (2 * stdDev),
  };
}

// Generate trading signal based on strategy
function generateSignal(
  closes: number[],
  volumes: number[],
  strategy: string
): { direction: 'long' | 'short' | null; confidence: number } {
  const rsi = calculateRSI(closes);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const bb = calculateBollingerBands(closes);
  const currentPrice = closes[closes.length - 1];
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  let signal: 'long' | 'short' | null = null;
  let confidence = 0;
  
  switch (strategy) {
    case 'mean_reversion':
      // Buy when oversold near lower BB, sell when overbought near upper BB
      if (rsi < 30 && currentPrice <= bb.lower * 1.01) {
        signal = 'long';
        confidence = Math.min(0.9, (30 - rsi) / 30 + (bb.lower - currentPrice) / bb.lower);
      } else if (rsi > 70 && currentPrice >= bb.upper * 0.99) {
        signal = 'short';
        confidence = Math.min(0.9, (rsi - 70) / 30 + (currentPrice - bb.upper) / bb.upper);
      }
      break;
      
    case 'momentum':
      // Follow the trend with SMA crossovers
      if (sma20 > sma50 && currentPrice > sma20 && volumeRatio > 1.2) {
        signal = 'long';
        confidence = Math.min(0.85, (sma20 - sma50) / sma50 * 10 + volumeRatio * 0.2);
      } else if (sma20 < sma50 && currentPrice < sma20 && volumeRatio > 1.2) {
        signal = 'short';
        confidence = Math.min(0.85, (sma50 - sma20) / sma50 * 10 + volumeRatio * 0.2);
      }
      break;
      
    case 'scalping':
      // Quick trades based on short-term RSI
      if (rsi < 35 && volumeRatio > 0.8) {
        signal = 'long';
        confidence = 0.6 + (35 - rsi) / 100;
      } else if (rsi > 65 && volumeRatio > 0.8) {
        signal = 'short';
        confidence = 0.6 + (rsi - 65) / 100;
      }
      break;
  }
  
  return { direction: signal, confidence };
}

// Find exit point for a trade
function findExit(
  candles: Candle[],
  entryIndex: number,
  entryPrice: number,
  direction: 'long' | 'short',
  takeProfitPercent: number,
  stopLossPercent: number,
  maxHoldingPeriod: number = 50
): { exitPrice: number; exitIndex: number; isWin: boolean } {
  const tpPrice = direction === 'long' 
    ? entryPrice * (1 + takeProfitPercent / 100)
    : entryPrice * (1 - takeProfitPercent / 100);
  const slPrice = direction === 'long'
    ? entryPrice * (1 - stopLossPercent / 100)
    : entryPrice * (1 + stopLossPercent / 100);
  
  for (let i = entryIndex + 1; i < Math.min(candles.length, entryIndex + maxHoldingPeriod); i++) {
    const candle = candles[i];
    
    if (direction === 'long') {
      // Check stop loss first (high priority)
      if (candle.low <= slPrice) {
        return { exitPrice: slPrice, exitIndex: i, isWin: false };
      }
      // Check take profit
      if (candle.high >= tpPrice) {
        return { exitPrice: tpPrice, exitIndex: i, isWin: true };
      }
    } else {
      // Short position
      if (candle.high >= slPrice) {
        return { exitPrice: slPrice, exitIndex: i, isWin: false };
      }
      if (candle.low <= tpPrice) {
        return { exitPrice: tpPrice, exitIndex: i, isWin: true };
      }
    }
  }
  
  // Max holding period reached - exit at current price
  const exitIndex = Math.min(candles.length - 1, entryIndex + maxHoldingPeriod);
  const exitPrice = candles[exitIndex].close;
  const isWin = direction === 'long' 
    ? exitPrice > entryPrice 
    : exitPrice < entryPrice;
  
  return { exitPrice, exitIndex, isWin };
}

// Calculate max drawdown
function calculateMaxDrawdown(equity: number[]): number {
  let maxDrawdown = 0;
  let peak = equity[0];
  
  for (const value of equity) {
    if (value > peak) peak = value;
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return maxDrawdown * 100;
}

// Calculate Sharpe ratio
function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualize (assuming 5-minute candles, ~105120 per year)
  const annualizedReturn = avgReturn * 105120;
  const annualizedStdDev = stdDev * Math.sqrt(105120);
  
  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      asset, 
      startDate, 
      endDate, 
      initialBalance,
      strategy = 'mean_reversion',
      positionSizePercent = 5,
      takeProfitPercent = 0.5,
      stopLossPercent = 0.3,
    } = await req.json();

    if (!asset || !startDate || !endDate || !initialBalance) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Running backtest: ${asset} from ${startDate} to ${endDate}, strategy: ${strategy}`);

    // Convert asset to Binance symbol format
    const symbol = asset.replace("/", "").replace("-", "").toUpperCase();
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    // Fetch historical data
    console.log(`Fetching historical data for ${symbol}...`);
    const candles = await fetchHistoricalData(symbol, startMs, endMs, '5m');
    console.log(`Fetched ${candles.length} candles`);

    if (candles.length < 100) {
      return new Response(JSON.stringify({ error: "Insufficient historical data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run backtest simulation
    const trades: Trade[] = [];
    let balance = initialBalance;
    const equity: number[] = [balance];
    const returns: number[] = [];
    const positionSize = initialBalance * (positionSizePercent / 100);
    
    // Monthly tracking
    const monthlyStats: Record<string, { pnl: number; trades: number; wins: number }> = {};
    
    // Skip first 50 candles for indicator warmup
    let i = 50;
    while (i < candles.length - 50) {
      const closes = candles.slice(0, i + 1).map(c => c.close);
      const volumes = candles.slice(0, i + 1).map(c => c.volume);
      
      const signal = generateSignal(closes, volumes, strategy);
      
      // Only trade on strong signals (confidence > 0.6)
      if (signal.direction && signal.confidence > 0.6) {
        const entryPrice = candles[i].close;
        const { exitPrice, exitIndex, isWin } = findExit(
          candles, i, entryPrice, signal.direction, 
          takeProfitPercent, stopLossPercent
        );
        
        // Calculate P&L
        const priceDiff = signal.direction === 'long'
          ? exitPrice - entryPrice
          : entryPrice - exitPrice;
        const pnl = (priceDiff / entryPrice) * positionSize;
        const pnlPercent = (priceDiff / entryPrice) * 100;
        
        // Apply trading fee (0.1% each way = 0.2% total)
        const fee = positionSize * 0.002;
        const netPnl = pnl - fee;
        
        balance += netPnl;
        equity.push(balance);
        returns.push(netPnl / positionSize);
        
        // Track monthly stats
        const monthKey = new Date(candles[i].timestamp).toISOString().slice(0, 7);
        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = { pnl: 0, trades: 0, wins: 0 };
        }
        monthlyStats[monthKey].pnl += netPnl;
        monthlyStats[monthKey].trades += 1;
        if (isWin) monthlyStats[monthKey].wins += 1;
        
        trades.push({
          timestamp: new Date(candles[i].timestamp).toISOString(),
          pair: asset,
          direction: signal.direction,
          entryPrice,
          exitPrice,
          pnl: netPnl,
          pnlPercent,
          isWin,
          holdingPeriod: exitIndex - i,
        });
        
        // Move to after exit
        i = exitIndex + 1;
      } else {
        i++;
      }
    }

    // Calculate performance metrics
    const wins = trades.filter(t => t.isWin).length;
    const losses = trades.length - wins;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const totalPnl = balance - initialBalance;
    const maxDrawdown = calculateMaxDrawdown(equity);
    const sharpeRatio = calculateSharpeRatio(returns);
    
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl <= 0);
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((a, t) => a + t.pnl, 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? Math.abs(losingTrades.reduce((a, t) => a + t.pnl, 0) / losingTrades.length)
      : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : 0;

    // Format monthly breakdown
    const monthlyBreakdown = Object.entries(monthlyStats).map(([period, stats]) => ({
      period,
      pnl: Math.round(stats.pnl * 100) / 100,
      trades: stats.trades,
      winRate: stats.trades > 0 ? Math.round((stats.wins / stats.trades) * 100) : 0,
    })).sort((a, b) => a.period.localeCompare(b.period));

    console.log(`Backtest complete: ${trades.length} trades, ${winRate.toFixed(1)}% win rate, $${totalPnl.toFixed(2)} P&L`);

    return new Response(JSON.stringify({
      totalTrades: trades.length,
      wins,
      losses,
      winRate: Math.round(winRate * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      finalBalance: Math.round(balance * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      monthlyBreakdown,
      trades: trades.slice(-100), // Return last 100 trades for display
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Backtest error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
