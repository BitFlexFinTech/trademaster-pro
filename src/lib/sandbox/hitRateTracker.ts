import { eventBus } from '../eventBus';

class HitRateTracker {
  private wins = 0;
  private total = 0;
  private targetHitRate = 80;
  private recentTrades: { isWin: boolean; timestamp: Date }[] = [];

  recordTrade(isWin: boolean): number {
    this.total++;
    if (isWin) this.wins++;
    
    // Track recent trades for trend analysis
    this.recentTrades.push({ isWin, timestamp: new Date() });
    if (this.recentTrades.length > 100) {
      this.recentTrades.shift();
    }
    
    const hitRate = this.getCurrentHitRate();
    eventBus.emit('hitrate:updated', { current: hitRate, target: this.targetHitRate });
    
    return hitRate;
  }

  getCurrentHitRate(): number {
    return this.total > 0 ? (this.wins / this.total) * 100 : 0;
  }

  getRecentHitRate(lastN: number = 20): number {
    const recent = this.recentTrades.slice(-lastN);
    if (recent.length === 0) return 0;
    
    const wins = recent.filter(t => t.isWin).length;
    return (wins / recent.length) * 100;
  }

  getTrend(): 'improving' | 'declining' | 'stable' {
    if (this.recentTrades.length < 20) return 'stable';
    
    const first10 = this.recentTrades.slice(0, 10);
    const last10 = this.recentTrades.slice(-10);
    
    const firstWinRate = first10.filter(t => t.isWin).length / 10;
    const lastWinRate = last10.filter(t => t.isWin).length / 10;
    
    const diff = lastWinRate - firstWinRate;
    if (diff > 0.1) return 'improving';
    if (diff < -0.1) return 'declining';
    return 'stable';
  }

  setTargetHitRate(target: number): void {
    this.targetHitRate = target;
  }

  getStats() {
    return {
      wins: this.wins,
      total: this.total,
      losses: this.total - this.wins,
      hitRate: this.getCurrentHitRate(),
      targetHitRate: this.targetHitRate,
      recentHitRate: this.getRecentHitRate(),
      trend: this.getTrend(),
    };
  }

  reset(): void {
    this.wins = 0;
    this.total = 0;
    this.recentTrades = [];
  }
}

export const hitRateTracker = new HitRateTracker();
