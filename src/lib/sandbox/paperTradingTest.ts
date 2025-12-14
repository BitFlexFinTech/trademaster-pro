import { 
  generateSignalScore, 
  calculateWinProbability 
} from '@/lib/technicalAnalysis';
import { 
  PaperTestResult, 
  FailedTradeReason, 
  ThresholdConfig,
  DEFAULT_THRESHOLDS 
} from './types';
import { MIN_NET_PROFIT, calculateNetProfit } from '@/lib/exchangeFees';

interface PricePoint {
  price: number;
  volume: number;
}

/**
 * Generate simulated price data for testing
 */
function generatePriceData(basePrice: number, numPoints: number): PricePoint[] {
  const data: PricePoint[] = [];
  let price = basePrice;
  
  for (let i = 0; i < numPoints; i++) {
    // Random walk with slight volatility
    const change = (Math.random() - 0.5) * 0.02 * price;
    price = Math.max(price + change, price * 0.5);
    
    // Random volume with some variance
    const volume = 1000000 + Math.random() * 2000000;
    
    data.push({ price, volume });
  }
  
  return data;
}

/**
 * Check if signal meets custom threshold criteria
 */
function meetsCustomCriteria(
  signal: { score: number; confluence: number; indicators: { volumeRatio: number } },
  thresholds: ThresholdConfig
): boolean {
  return (
    signal.score >= thresholds.minSignalScore &&
    signal.confluence >= thresholds.minConfluence &&
    signal.indicators.volumeRatio >= thresholds.minVolumeRatio
  );
}

/**
 * Run paper trading test with specified number of trades
 */
export async function runPaperTradingTest(
  numTrades: number = 100,
  thresholds: ThresholdConfig = DEFAULT_THRESHOLDS
): Promise<PaperTestResult> {
  const basePrice = 50000; // BTC-like price
  const positionSize = 100; // $100 position
  const profitPerTrade = Math.max(1, MIN_NET_PROFIT + 0.50); // Ensure min profit after fees
  const lossPerTrade = 0.60;
  
  let wins = 0;
  let losses = 0;
  let tradesSkipped = 0;
  let totalPnL = 0;
  let totalSignalScore = 0;
  let totalConfluence = 0;
  let signalsEvaluated = 0;
  
  const failureReasons: Map<string, { count: number; totalScore: number; totalConfluence: number }> = new Map();
  
  // Generate enough price data for all evaluations
  const priceData = generatePriceData(basePrice, numTrades + 50);
  
  for (let i = 0; i < numTrades + tradesSkipped && (wins + losses) < numTrades; i++) {
    if (i + 26 > priceData.length) break;
    
    const closes = priceData.slice(i, i + 26).map(p => p.price);
    const volumes = priceData.slice(i, i + 26).map(p => p.volume);
    
    const signal = generateSignalScore(closes, volumes, thresholds.minSignalScore);
    signalsEvaluated++;
    
    if (!signal) {
      tradesSkipped++;
      const reason = 'Insufficient data';
      const existing = failureReasons.get(reason) || { count: 0, totalScore: 0, totalConfluence: 0 };
      failureReasons.set(reason, { count: existing.count + 1, totalScore: 0, totalConfluence: 0 });
      continue;
    }
    
    totalSignalScore += signal.score;
    totalConfluence += signal.confluence;
    
    if (!meetsCustomCriteria(signal, thresholds)) {
      tradesSkipped++;
      
      // Categorize failure reason
      let reason = 'Unknown';
      if (signal.score < thresholds.minSignalScore) {
        reason = `Low signal score (<${(thresholds.minSignalScore * 100).toFixed(0)}%)`;
      } else if (signal.confluence < thresholds.minConfluence) {
        reason = `Low confluence (<${thresholds.minConfluence} indicators)`;
      } else if (signal.indicators.volumeRatio < thresholds.minVolumeRatio) {
        reason = `Low volume ratio (<${thresholds.minVolumeRatio}x)`;
      }
      
      const existing = failureReasons.get(reason) || { count: 0, totalScore: 0, totalConfluence: 0 };
      failureReasons.set(reason, {
        count: existing.count + 1,
        totalScore: existing.totalScore + signal.score,
        totalConfluence: existing.totalConfluence + signal.confluence,
      });
      continue;
    }
    
    // Trade passed criteria - simulate execution with fee check
    const winProbability = calculateWinProbability(signal);
    const isWin = Math.random() < winProbability;
    
    // Simulate exit price and check net profit after fees
    const entryPrice = closes[closes.length - 1];
    const priceChangePercent = profitPerTrade / positionSize;
    const exitPrice = isWin 
      ? entryPrice * (1 + priceChangePercent)
      : entryPrice * (1 - lossPerTrade / positionSize);
    
    // Check if net profit meets minimum threshold ($0.50)
    const netProfit = isWin ? calculateNetProfit(entryPrice, exitPrice, positionSize, 'binance') : -lossPerTrade;
    
    if (isWin && netProfit < MIN_NET_PROFIT) {
      tradesSkipped++;
      const reason = `Below minimum profit ($${MIN_NET_PROFIT.toFixed(2)})`;
      const existing = failureReasons.get(reason) || { count: 0, totalScore: 0, totalConfluence: 0 };
      failureReasons.set(reason, {
        count: existing.count + 1,
        totalScore: existing.totalScore + signal.score,
        totalConfluence: existing.totalConfluence + signal.confluence,
      });
      continue;
    }
    
    if (isWin) {
      wins++;
      totalPnL += netProfit;
    } else {
      losses++;
      totalPnL -= lossPerTrade;
      
      // Track losing trade
      const reason = 'Trade executed but lost';
      const existing = failureReasons.get(reason) || { count: 0, totalScore: 0, totalConfluence: 0 };
      failureReasons.set(reason, {
        count: existing.count + 1,
        totalScore: existing.totalScore + signal.score,
        totalConfluence: existing.totalConfluence + signal.confluence,
      });
    }
  }
  
  const totalTrades = wins + losses;
  const hitRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgSignalScore = signalsEvaluated > 0 ? totalSignalScore / signalsEvaluated : 0;
  const avgConfluence = signalsEvaluated > 0 ? totalConfluence / signalsEvaluated : 0;
  
  // Convert failure reasons map to array
  const failedTradesBreakdown: FailedTradeReason[] = [];
  failureReasons.forEach((data, reason) => {
    failedTradesBreakdown.push({
      reason,
      count: data.count,
      avgScore: data.count > 0 ? (data.totalScore / data.count) * 100 : 0,
      avgConfluence: data.count > 0 ? data.totalConfluence / data.count : 0,
    });
  });
  
  return {
    passed: hitRate >= thresholds.targetHitRate,
    hitRate,
    totalTrades,
    wins,
    losses,
    tradesSkipped,
    totalPnL,
    avgSignalScore: avgSignalScore * 100,
    avgConfluence,
    failedTradesBreakdown,
  };
}
