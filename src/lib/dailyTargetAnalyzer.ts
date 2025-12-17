/**
 * Daily Target Analyzer - Deep analysis when daily target is not met
 * Provides actionable insights and strategy adjustments
 */

export interface TradeRecord {
  timestamp: number;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  isWin: boolean;
  exitReason: string;
  holdTimeMs: number;
}

export interface DailyAnalysisResult {
  date: string;
  targetMet: boolean;
  dailyTarget: number;
  actualPnL: number;
  shortfall: number;
  
  // Performance breakdown
  totalTrades: number;
  wins: number;
  losses: number;
  hitRate: number;
  
  // Failure patterns
  patterns: FailurePattern[];
  
  // Root causes
  rootCauses: RootCause[];
  
  // Recommendations
  recommendations: StrategyRecommendation[];
  
  // Time-based analysis
  bestTradingHours: number[];
  worstTradingHours: number[];
  
  // Pair analysis
  bestPairs: string[];
  worstPairs: string[];
  
  // Exchange analysis
  bestExchanges: string[];
  worstExchanges: string[];
}

export interface FailurePattern {
  type: 'time_stop' | 'stop_loss' | 'consecutive_losses' | 'overtrading' | 'bad_timing' | 'wrong_pairs';
  description: string;
  occurrences: number;
  percentageOfLosses: number;
  impact: number; // PnL impact
}

export interface RootCause {
  cause: string;
  confidence: number; // 0-100
  evidence: string[];
  suggestedFix: string;
}

export interface StrategyRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'signal_threshold' | 'trade_frequency' | 'position_size' | 'pairs' | 'timing' | 'stop_loss';
  title: string;
  description: string;
  currentValue: string | number;
  suggestedValue: string | number;
  expectedImpact: string;
  implementationSteps: string[];
}

class DailyTargetAnalyzerClass {
  private todaysTrades: TradeRecord[] = [];
  private lastAnalysisTime: number = 0;
  
  /**
   * Record a trade for analysis
   */
  recordTrade(trade: TradeRecord): void {
    this.todaysTrades.push(trade);
    
    // Clean up trades older than 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.todaysTrades = this.todaysTrades.filter(t => t.timestamp > cutoff);
  }
  
  /**
   * Perform deep analysis when daily target not met
   */
  analyze(dailyTarget: number): DailyAnalysisResult {
    const trades = this.todaysTrades;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = trades.filter(t => t.isWin);
    const losses = trades.filter(t => !t.isWin);
    const hitRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    
    const patterns = this.identifyFailurePatterns(trades, losses);
    const rootCauses = this.identifyRootCauses(trades, losses, patterns, hitRate, dailyTarget, totalPnL);
    const recommendations = this.generateRecommendations(patterns, rootCauses, trades, hitRate, dailyTarget, totalPnL);
    
    // Time analysis
    const tradesByHour = this.groupByHour(trades);
    const winsByHour = this.groupByHour(wins);
    const lossHours = Object.entries(tradesByHour)
      .filter(([hour, count]) => {
        const hourWins = winsByHour[hour] || 0;
        return count > 2 && hourWins / count < 0.7; // Less than 70% win rate
      })
      .map(([hour]) => parseInt(hour));
    
    const goodHours = Object.entries(tradesByHour)
      .filter(([hour, count]) => {
        const hourWins = winsByHour[hour] || 0;
        return count > 2 && hourWins / count >= 0.85; // 85%+ win rate
      })
      .map(([hour]) => parseInt(hour));
    
    // Pair analysis
    const pairPerformance = this.analyzePairs(trades);
    const bestPairs = pairPerformance
      .filter(p => p.hitRate >= 80 && p.trades >= 3)
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5)
      .map(p => p.pair);
    
    const worstPairs = pairPerformance
      .filter(p => p.hitRate < 70 && p.trades >= 3)
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 5)
      .map(p => p.pair);
    
    // Exchange analysis
    const exchangePerformance = this.analyzeExchanges(trades);
    const bestExchanges = exchangePerformance
      .filter(e => e.hitRate >= 80 && e.trades >= 3)
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 3)
      .map(e => e.exchange);
    
    const worstExchanges = exchangePerformance
      .filter(e => e.hitRate < 70 && e.trades >= 3)
      .sort((a, b) => a.pnl - b.pnl)
      .slice(0, 3)
      .map(e => e.exchange);
    
    this.lastAnalysisTime = Date.now();
    
    return {
      date: new Date().toISOString().split('T')[0],
      targetMet: totalPnL >= dailyTarget,
      dailyTarget,
      actualPnL: totalPnL,
      shortfall: Math.max(0, dailyTarget - totalPnL),
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      hitRate,
      patterns,
      rootCauses,
      recommendations,
      bestTradingHours: goodHours,
      worstTradingHours: lossHours,
      bestPairs,
      worstPairs,
      bestExchanges,
      worstExchanges,
    };
  }
  
  /**
   * Identify failure patterns in losing trades
   */
  private identifyFailurePatterns(trades: TradeRecord[], losses: TradeRecord[]): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    
    if (losses.length === 0) return patterns;
    
    // Time stop pattern
    const timeStops = losses.filter(t => t.exitReason === 'TIME_EXIT');
    if (timeStops.length > 0) {
      patterns.push({
        type: 'time_stop',
        description: 'Trades expiring at max hold time without hitting TP',
        occurrences: timeStops.length,
        percentageOfLosses: (timeStops.length / losses.length) * 100,
        impact: timeStops.reduce((sum, t) => sum + t.pnl, 0),
      });
    }
    
    // Stop loss pattern
    const stopLosses = losses.filter(t => t.exitReason === 'STOP_LOSS');
    if (stopLosses.length > 0) {
      patterns.push({
        type: 'stop_loss',
        description: 'Trades hitting stop loss',
        occurrences: stopLosses.length,
        percentageOfLosses: (stopLosses.length / losses.length) * 100,
        impact: stopLosses.reduce((sum, t) => sum + t.pnl, 0),
      });
    }
    
    // Consecutive losses pattern
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    for (const trade of trades) {
      if (!trade.isWin) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }
    if (maxConsecutive >= 3) {
      patterns.push({
        type: 'consecutive_losses',
        description: `Had ${maxConsecutive} consecutive losses`,
        occurrences: maxConsecutive,
        percentageOfLosses: (maxConsecutive / losses.length) * 100,
        impact: 0, // Calculated separately
      });
    }
    
    // Overtrading pattern (more than 100 trades/hour)
    const tradesByHour = this.groupByHour(trades);
    const overtradingHours = Object.entries(tradesByHour).filter(([, count]) => count > 100);
    if (overtradingHours.length > 0) {
      patterns.push({
        type: 'overtrading',
        description: `Overtrading detected in ${overtradingHours.length} hours`,
        occurrences: overtradingHours.reduce((sum, [, count]) => sum + count, 0),
        percentageOfLosses: 0,
        impact: 0,
      });
    }
    
    return patterns;
  }
  
  /**
   * Identify root causes of underperformance
   */
  private identifyRootCauses(
    trades: TradeRecord[],
    losses: TradeRecord[],
    patterns: FailurePattern[],
    hitRate: number,
    dailyTarget: number,
    totalPnL: number
  ): RootCause[] {
    const causes: RootCause[] = [];
    
    // Low hit rate
    if (hitRate < 85) {
      causes.push({
        cause: 'Hit rate below minimum threshold',
        confidence: 95,
        evidence: [
          `Current hit rate: ${hitRate.toFixed(1)}%`,
          `Required: 85%+`,
          `${losses.length} losses out of ${trades.length} trades`,
        ],
        suggestedFix: 'Increase signal threshold to filter out lower-quality trades',
      });
    }
    
    // TP/SL ratio issue
    const avgWin = trades.filter(t => t.isWin).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, trades.filter(t => t.isWin).length);
    const avgLoss = Math.abs(trades.filter(t => !t.isWin).reduce((sum, t) => sum + t.pnl, 0) / Math.max(1, losses.length));
    
    if (avgLoss > avgWin * 0.5) {
      causes.push({
        cause: 'Stop loss too wide relative to take profit',
        confidence: 85,
        evidence: [
          `Average win: $${avgWin.toFixed(2)}`,
          `Average loss: $${avgLoss.toFixed(2)}`,
          `Loss/Win ratio: ${(avgLoss / avgWin).toFixed(2)}`,
        ],
        suggestedFix: 'Tighten stop loss to 20% of profit target (current may be higher)',
      });
    }
    
    // Too few trades
    const hoursElapsed = (Date.now() - (trades[0]?.timestamp || Date.now())) / 1000 / 60 / 60;
    const tradesPerHour = trades.length / Math.max(1, hoursElapsed);
    const neededTradesPerHour = dailyTarget / avgWin / 24;
    
    if (tradesPerHour < neededTradesPerHour * 0.5 && totalPnL < dailyTarget) {
      causes.push({
        cause: 'Insufficient trade frequency',
        confidence: 80,
        evidence: [
          `Current: ${tradesPerHour.toFixed(1)} trades/hour`,
          `Needed: ~${neededTradesPerHour.toFixed(1)} trades/hour`,
          `To reach $${dailyTarget} target`,
        ],
        suggestedFix: 'Reduce trade interval or lower signal threshold slightly',
      });
    }
    
    // Time stop exits
    const timeStopPattern = patterns.find(p => p.type === 'time_stop');
    if (timeStopPattern && timeStopPattern.percentageOfLosses > 30) {
      causes.push({
        cause: 'Many trades timing out before hitting targets',
        confidence: 75,
        evidence: [
          `${timeStopPattern.occurrences} time-stop exits`,
          `${timeStopPattern.percentageOfLosses.toFixed(0)}% of losses`,
        ],
        suggestedFix: 'Increase max hold time or adjust TP levels for faster fills',
      });
    }
    
    return causes;
  }
  
  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    patterns: FailurePattern[],
    rootCauses: RootCause[],
    trades: TradeRecord[],
    hitRate: number,
    dailyTarget: number,
    totalPnL: number
  ): StrategyRecommendation[] {
    const recommendations: StrategyRecommendation[] = [];
    
    // Hit rate improvement
    if (hitRate < 90) {
      const newThreshold = hitRate < 80 ? 95 : hitRate < 85 ? 93 : 91;
      recommendations.push({
        id: `rec-${Date.now()}-1`,
        priority: hitRate < 80 ? 'critical' : 'high',
        type: 'signal_threshold',
        title: 'Increase Signal Quality Threshold',
        description: `Current hit rate ${hitRate.toFixed(1)}% is below target. Stricter signal filtering required.`,
        currentValue: 90,
        suggestedValue: newThreshold,
        expectedImpact: `+${(newThreshold - hitRate).toFixed(0)}% hit rate improvement`,
        implementationSteps: [
          'Increase minimum signal score threshold',
          'Require 3+ indicator confluence instead of 2',
          'Add volume confirmation requirement',
        ],
      });
    }
    
    // Position sizing
    if (totalPnL < dailyTarget * 0.5 && trades.length > 20) {
      recommendations.push({
        id: `rec-${Date.now()}-2`,
        priority: 'high',
        type: 'position_size',
        title: 'Adjust Position Sizing',
        description: 'Current position size may be suboptimal for your balance and risk parameters.',
        currentValue: '$100',
        suggestedValue: '$150',
        expectedImpact: '+50% profit per winning trade',
        implementationSteps: [
          'Verify account balance supports larger positions',
          'Maintain same stop loss percentage',
          'Monitor drawdown closely after change',
        ],
      });
    }
    
    // Trade frequency
    const avgTradesPerHour = trades.length / 24;
    if (avgTradesPerHour < 5 && totalPnL < dailyTarget) {
      recommendations.push({
        id: `rec-${Date.now()}-3`,
        priority: 'medium',
        type: 'trade_frequency',
        title: 'Increase Trade Frequency',
        description: `Only ${avgTradesPerHour.toFixed(1)} trades/hour may be insufficient to reach daily target.`,
        currentValue: `${avgTradesPerHour.toFixed(1)}/hr`,
        suggestedValue: '10-15/hr',
        expectedImpact: 'More opportunities to reach daily target',
        implementationSteps: [
          'Reduce trade interval from current setting',
          'Consider slightly lower signal threshold if hit rate allows',
          'Add more trading pairs to scan',
        ],
      });
    }
    
    // Stop loss optimization
    const timeStopPattern = patterns.find(p => p.type === 'time_stop');
    if (timeStopPattern && timeStopPattern.percentageOfLosses > 20) {
      recommendations.push({
        id: `rec-${Date.now()}-4`,
        priority: 'medium',
        type: 'stop_loss',
        title: 'Optimize Exit Strategy',
        description: `${timeStopPattern.percentageOfLosses.toFixed(0)}% of losses are time-stops. Adjust for faster fills.`,
        currentValue: '60s max hold',
        suggestedValue: '90s max hold with tighter TP',
        expectedImpact: 'Better exit timing, fewer time-stop losses',
        implementationSteps: [
          'Increase max hold time to 90 seconds',
          'Tighten take-profit to 0.15% from 0.2%',
          'Enable trailing stop at 50% profit',
        ],
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }
  
  /**
   * Group trades by hour
   */
  private groupByHour(trades: TradeRecord[]): Record<number, number> {
    const byHour: Record<number, number> = {};
    for (const trade of trades) {
      const hour = new Date(trade.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    }
    return byHour;
  }
  
  /**
   * Analyze pair performance
   */
  private analyzePairs(trades: TradeRecord[]): Array<{ pair: string; trades: number; wins: number; hitRate: number; pnl: number }> {
    const byPair: Record<string, TradeRecord[]> = {};
    for (const trade of trades) {
      if (!byPair[trade.pair]) byPair[trade.pair] = [];
      byPair[trade.pair].push(trade);
    }
    
    return Object.entries(byPair).map(([pair, pairTrades]) => ({
      pair,
      trades: pairTrades.length,
      wins: pairTrades.filter(t => t.isWin).length,
      hitRate: (pairTrades.filter(t => t.isWin).length / pairTrades.length) * 100,
      pnl: pairTrades.reduce((sum, t) => sum + t.pnl, 0),
    }));
  }
  
  /**
   * Analyze exchange performance
   */
  private analyzeExchanges(trades: TradeRecord[]): Array<{ exchange: string; trades: number; wins: number; hitRate: number; pnl: number }> {
    const byExchange: Record<string, TradeRecord[]> = {};
    for (const trade of trades) {
      if (!byExchange[trade.exchange]) byExchange[trade.exchange] = [];
      byExchange[trade.exchange].push(trade);
    }
    
    return Object.entries(byExchange).map(([exchange, exchangeTrades]) => ({
      exchange,
      trades: exchangeTrades.length,
      wins: exchangeTrades.filter(t => t.isWin).length,
      hitRate: (exchangeTrades.filter(t => t.isWin).length / exchangeTrades.length) * 100,
      pnl: exchangeTrades.reduce((sum, t) => sum + t.pnl, 0),
    }));
  }
  
  /**
   * Reset for new day
   */
  reset(): void {
    this.todaysTrades = [];
    this.lastAnalysisTime = 0;
  }
  
  /**
   * Get today's trades count
   */
  getTodaysTradesCount(): number {
    return this.todaysTrades.length;
  }
}

// Singleton
export const dailyTargetAnalyzer = new DailyTargetAnalyzerClass();
