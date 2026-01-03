/**
 * Continuous Market Scanner - Parallel Non-Blocking Scanning
 * Scans 1m, 3m, 5m timeframes simultaneously for fast trade opportunities
 */

import { tradeQualificationFilter, type TradeSignal, type QualificationResult } from './tradeQualificationFilter';

export interface ScanOpportunity {
  symbol: string;
  exchange: string;
  timeframe: string;
  signal: TradeSignal;
  qualification: QualificationResult;
  timestamp: number;
  priority: number; // Higher = better opportunity
}

interface PriorityQueueItem {
  opportunity: ScanOpportunity;
  score: number;
}

class OpportunityPriorityQueue {
  private items: PriorityQueueItem[] = [];
  private maxSize: number = 50;

  enqueue(opportunity: ScanOpportunity): void {
    const score = this.calculateScore(opportunity);
    const item = { opportunity, score };

    // Find insert position (sorted by score descending)
    let insertIndex = this.items.findIndex(i => i.score < score);
    if (insertIndex === -1) insertIndex = this.items.length;

    this.items.splice(insertIndex, 0, item);

    // Trim to max size
    if (this.items.length > this.maxSize) {
      this.items.pop();
    }
  }

  dequeue(): ScanOpportunity | null {
    const item = this.items.shift();
    return item?.opportunity || null;
  }

  peek(): ScanOpportunity | null {
    return this.items[0]?.opportunity || null;
  }

  getAll(): ScanOpportunity[] {
    return this.items.map(i => i.opportunity);
  }

  getForExchange(exchange: string): ScanOpportunity[] {
    return this.items
      .filter(i => i.opportunity.exchange === exchange)
      .map(i => i.opportunity);
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  private calculateScore(opp: ScanOpportunity): number {
    // Weighted scoring:
    // - Confidence (40%)
    // - Speed prediction inverse (30%) - faster is better
    // - Freshness (20%) - recent scans preferred
    // - Timeframe (10%) - 1m preferred over 5m

    const confidenceScore = opp.qualification.confidence * 40;
    
    const expectedDuration = opp.qualification.expectedDuration || 300;
    const speedScore = Math.max(0, (300 - expectedDuration) / 300) * 30;
    
    const ageMs = Date.now() - opp.timestamp;
    const freshnessScore = Math.max(0, (60000 - ageMs) / 60000) * 20;
    
    const timeframeScores: Record<string, number> = { '1m': 10, '3m': 7, '5m': 5 };
    const tfScore = timeframeScores[opp.timeframe] || 5;

    return confidenceScore + speedScore + freshnessScore + tfScore;
  }
}

type ScanCallback = (opportunity: ScanOpportunity) => void;

class ContinuousMarketScanner {
  private isScanning: boolean = false;
  private opportunityQueue: OpportunityPriorityQueue = new OpportunityPriorityQueue();
  private scanIntervalMs: number = 500; // Scan every 500ms
  private symbolsToScan: string[] = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'];
  private exchanges: string[] = ['binance', 'bybit', 'okx'];
  private timeframes = ['1m', '3m', '5m'] as const;
  private callbacks: ScanCallback[] = [];
  private rejectionCounts: Map<string, number> = new Map();
  private rejectionsByReason: Map<string, number> = new Map(); // Track by reason
  private lastScanTime: Map<string, number> = new Map();

  /**
   * Register callback for new opportunities
   */
  onOpportunity(callback: ScanCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Start continuous scanning
   */
  start(
    priceGetter: (symbol: string) => { price: number; change: number; volume: number } | null,
    userId?: string
  ): void {
    if (this.isScanning) return;
    this.isScanning = true;

    console.log('🔍 Starting continuous market scanner...');

    // Start parallel scanning loops for each timeframe
    this.timeframes.forEach(tf => {
      this.scanTimeframeLoop(tf, priceGetter, userId);
    });
  }

  /**
   * Stop scanning
   */
  stop(): void {
    this.isScanning = false;
    this.opportunityQueue.clear();
    console.log('🛑 Market scanner stopped');
  }

  /**
   * Get best opportunity for an exchange
   */
  getBestOpportunity(exchange?: string): ScanOpportunity | null {
    if (exchange) {
      const opportunities = this.opportunityQueue.getForExchange(exchange);
      return opportunities[0] || null;
    }
    return this.opportunityQueue.peek();
  }

  /**
   * Get all qualified opportunities
   */
  getAllOpportunities(): ScanOpportunity[] {
    return this.opportunityQueue.getAll();
  }

  /**
   * Get scanner statistics
   */
  getStats(): {
    isScanning: boolean;
    opportunityCount: number;
    rejectionsLast5Min: number;
    symbolsActive: number;
  } {
    const recentRejections = Array.from(this.rejectionCounts.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      isScanning: this.isScanning,
      opportunityCount: this.opportunityQueue.size(),
      rejectionsLast5Min: recentRejections,
      symbolsActive: this.symbolsToScan.length,
    };
  }

  /**
   * Get detailed statistics with rejection breakdown
   */
  getDetailedStats(): {
    isScanning: boolean;
    opportunityCount: number;
    rejectionsLast5Min: number;
    symbolsActive: number;
    rejectionBreakdown: Array<{ reason: string; count: number; percentage: number }>;
    topOpportunities: Array<{ symbol: string; confidence: number; expectedDuration: number }>;
  } {
    const basicStats = this.getStats();
    const totalRejections = basicStats.rejectionsLast5Min;
    
    // Build rejection breakdown sorted by count
    const rejectionBreakdown = Array.from(this.rejectionsByReason.entries())
      .map(([reason, count]) => ({
        reason: this.formatRejectionReason(reason),
        count,
        percentage: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Get top opportunities
    const opportunities = this.opportunityQueue.getAll();
    const topOpportunities = opportunities.slice(0, 5).map(opp => ({
      symbol: opp.symbol,
      confidence: opp.qualification.confidence,
      expectedDuration: opp.qualification.expectedDuration || 300,
    }));

    return {
      ...basicStats,
      rejectionBreakdown,
      topOpportunities,
    };
  }

  /**
   * Format rejection reason for display
   */
  private formatRejectionReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'momentum': 'Low momentum',
      'volatility': 'Weak volatility',
      'volume': 'Low volume',
      'spread': 'Wide spread',
      'timeOfDay': 'Poor trading hour',
      'historical': 'Slow historical avg',
      'duration': 'Expected >5min',
    };
    
    // Check if reason matches any known pattern
    for (const [key, label] of Object.entries(reasonMap)) {
      if (reason.toLowerCase().includes(key)) {
        return label;
      }
    }
    
    // Truncate long reasons
    return reason.length > 20 ? reason.slice(0, 20) + '...' : reason;
  }

  /**
   * Clear rejection stats (call periodically)
   */
  clearRejectionStats(): void {
    this.rejectionCounts.clear();
    this.rejectionsByReason.clear();
  }

  /**
   * Scan loop for a specific timeframe
   */
  private async scanTimeframeLoop(
    timeframe: string,
    priceGetter: (symbol: string) => { price: number; change: number; volume: number } | null,
    userId?: string
  ): Promise<void> {
    while (this.isScanning) {
      try {
        const startTime = Date.now();
        let qualified = 0;
        let scanned = 0;

        // Scan all symbols in parallel for this timeframe
        await Promise.all(
          this.symbolsToScan.map(async symbol => {
            try {
              const result = await this.analyzeSymbol(symbol, timeframe, priceGetter, userId);
              scanned++;
              if (result) {
                qualified++;
                this.opportunityQueue.enqueue(result);
                this.callbacks.forEach(cb => cb(result));
              }
            } catch (e) {
              // Don't let one symbol error stop scanning
            }
          })
        );

        const scanTime = Date.now() - startTime;
        
        if (qualified > 0) {
          console.log(`📊 ${timeframe} scan: ${qualified}/${scanned} qualified (${scanTime}ms)`);
        }

        // Wait before next scan
        await this.sleep(this.scanIntervalMs);
      } catch (error) {
        console.error(`Error in ${timeframe} scanner:`, error);
        await this.sleep(1000);
      }
    }
  }

  /**
   * Analyze a single symbol
   */
  private async analyzeSymbol(
    symbol: string,
    timeframe: string,
    priceGetter: (symbol: string) => { price: number; change: number; volume: number } | null,
    userId?: string
  ): Promise<ScanOpportunity | null> {
    const scanKey = `${symbol}:${timeframe}`;
    const lastScan = this.lastScanTime.get(scanKey) || 0;
    
    // Rate limit per symbol-timeframe to avoid spam
    if (Date.now() - lastScan < 2000) return null;
    this.lastScanTime.set(scanKey, Date.now());

    const priceData = priceGetter(symbol);
    if (!priceData) return null;

    const pair = `${symbol}/USDT`;
    const direction = priceData.change > 0 ? 'long' : 'short';

    // Create trade signal
    const signal: TradeSignal = {
      symbol,
      pair,
      exchange: 'binance', // Default exchange
      direction: direction as 'long' | 'short',
      entryPrice: priceData.price,
      profitTargetPercent: 0.003, // 0.3% target
      timeframe,
    };

    // Calculate market data for qualification
    const marketData = {
      momentum: Math.abs(priceData.change) / 100, // Convert % to decimal
      volatility: Math.abs(priceData.change) / 50, // Rough volatility estimate
      volumeSurge: priceData.volume > 0 ? 1.5 : 1.0, // Placeholder
      spread: 0.0005, // Placeholder 0.05% spread
      currentPrice: priceData.price,
    };

    // Run qualification filter
    const result = await tradeQualificationFilter.shouldEnterTrade(signal, marketData, userId);

    if (!result.enter) {
      // Track rejection by symbol
      const rejectKey = `${symbol}:${result.reason.split(':')[0]}`;
      this.rejectionCounts.set(rejectKey, (this.rejectionCounts.get(rejectKey) || 0) + 1);
      
      // Track rejection by reason for breakdown display
      const reasonKey = result.reason.split(':')[0].trim();
      this.rejectionsByReason.set(reasonKey, (this.rejectionsByReason.get(reasonKey) || 0) + 1);
      
      // Log rejection if user provided
      if (userId) {
        tradeQualificationFilter.logRejection(signal, result, userId);
      }
      return null;
    }

    return {
      symbol,
      exchange: 'binance',
      timeframe,
      signal,
      qualification: result,
      timestamp: Date.now(),
      priority: result.confidence * 100,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const continuousMarketScanner = new ContinuousMarketScanner();
