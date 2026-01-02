import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Zap, 
  Calendar,
  RefreshCw,
  Download,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import { WinRateOverTimeChart } from './WinRateOverTimeChart';
import { CumulativePnLChart } from './CumulativePnLChart';
import { PairComparisonChart } from './PairComparisonChart';
import { TradingHoursHeatmap } from './TradingHoursHeatmap';

interface Trade {
  id: string;
  pair: string;
  direction: string;
  pnl: number;
  createdAt: string;
  closedAt?: string;
  exchange?: string;
  regime?: string;
}

interface ComprehensiveAnalyticsDashboardProps {
  trades: Trade[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

type TimeRange = '7d' | '14d' | '30d' | '90d' | 'all';

export function ComprehensiveAnalyticsDashboard({
  trades,
  isLoading = false,
  onRefresh,
}: ComprehensiveAnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const filteredTrades = useMemo(() => {
    if (timeRange === 'all') return trades;
    
    const days = parseInt(timeRange);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return trades.filter(t => new Date(t.createdAt) >= cutoff);
  }, [trades, timeRange]);

  const stats = useMemo(() => {
    const closedTrades = filteredTrades.filter(t => t.pnl !== null && t.pnl !== undefined);
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl <= 0);
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

    // Calculate streaks
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempStreak = 0;
    let lastWasWin: boolean | null = null;

    closedTrades
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach(t => {
        const isWin = t.pnl > 0;
        if (lastWasWin === null || isWin === lastWasWin) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
        
        if (isWin) {
          maxWinStreak = Math.max(maxWinStreak, tempStreak);
        } else {
          maxLossStreak = Math.max(maxLossStreak, tempStreak);
        }
        
        lastWasWin = isWin;
        currentStreak = tempStreak;
      });

    return {
      totalTrades: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      totalPnL,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      maxWinStreak,
      maxLossStreak,
      currentStreak,
      lastWasWin,
    };
  }, [filteredTrades]);

  // Generate win rate over time data
  const winRateData = useMemo(() => {
    const closedTrades = filteredTrades.filter(t => t.closedAt);
    const grouped = new Map<string, { wins: number; total: number }>();
    
    closedTrades.forEach(t => {
      const date = new Date(t.closedAt!).toISOString().split('T')[0];
      const existing = grouped.get(date) || { wins: 0, total: 0 };
      existing.total++;
      if (t.pnl > 0) existing.wins++;
      grouped.set(date, existing);
    });

    // Calculate rolling 7-day win rate
    const sortedDates = Array.from(grouped.keys()).sort();
    const result: Array<{ date: string; winRate: number; trades: number; wins: number; losses: number }> = [];
    
    sortedDates.forEach((date, index) => {
      const last7Days = sortedDates.slice(Math.max(0, index - 6), index + 1);
      let totalWins = 0;
      let totalTrades = 0;
      
      last7Days.forEach(d => {
        const data = grouped.get(d)!;
        totalWins += data.wins;
        totalTrades += data.total;
      });

      const dayData = grouped.get(date)!;
      result.push({
        date,
        winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
        trades: dayData.total,
        wins: dayData.wins,
        losses: dayData.total - dayData.wins,
      });
    });

    return result;
  }, [filteredTrades]);

  // Generate cumulative P&L data
  const pnlData = useMemo(() => {
    const closedTrades = filteredTrades.filter(t => t.closedAt);
    const grouped = new Map<string, { pnl: number; trades: number }>();
    
    closedTrades.forEach(t => {
      const date = new Date(t.closedAt!).toISOString().split('T')[0];
      const existing = grouped.get(date) || { pnl: 0, trades: 0 };
      existing.pnl += t.pnl || 0;
      existing.trades++;
      grouped.set(date, existing);
    });

    const sortedDates = Array.from(grouped.keys()).sort();
    let cumulative = 0;
    
    return sortedDates.map(date => {
      const data = grouped.get(date)!;
      cumulative += data.pnl;
      return {
        date,
        pnl: data.pnl,
        cumulative,
        trades: data.trades,
      };
    });
  }, [filteredTrades]);

  // Generate pair performance data
  const pairData = useMemo(() => {
    const grouped = new Map<string, { pnl: number; trades: number; wins: number }>();
    
    filteredTrades.forEach(t => {
      const existing = grouped.get(t.pair) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += t.pnl || 0;
      existing.trades++;
      if (t.pnl > 0) existing.wins++;
      grouped.set(t.pair, existing);
    });

    return Array.from(grouped.entries()).map(([pair, data]) => ({
      pair,
      pnl: data.pnl,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
      avgProfit: data.trades > 0 ? data.pnl / data.trades : 0,
    }));
  }, [filteredTrades]);

  // Generate hourly data
  const hourlyData = useMemo(() => {
    const grouped = new Map<number, { pnl: number; trades: number; wins: number }>();
    
    filteredTrades.forEach(t => {
      const hour = new Date(t.createdAt).getUTCHours();
      const existing = grouped.get(hour) || { pnl: 0, trades: 0, wins: 0 };
      existing.pnl += t.pnl || 0;
      existing.trades++;
      if (t.pnl > 0) existing.wins++;
      grouped.set(hour, existing);
    });

    return Array.from(grouped.entries()).map(([hour, data]) => ({
      hour,
      pnl: data.pnl,
      trades: data.trades,
      winRate: data.trades > 0 ? (data.wins / data.trades) * 100 : 0,
    }));
  }, [filteredTrades]);

  // Direction analysis
  const directionStats = useMemo(() => {
    const long = filteredTrades.filter(t => t.direction === 'long' || t.direction === 'LONG');
    const short = filteredTrades.filter(t => t.direction === 'short' || t.direction === 'SHORT');
    
    const calcStats = (trades: Trade[]) => {
      const pnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const wins = trades.filter(t => t.pnl > 0).length;
      return {
        trades: trades.length,
        pnl,
        winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
      };
    };

    return {
      long: calcStats(long),
      short: calcStats(short),
    };
  }, [filteredTrades]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Trading Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive performance analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v: TimeRange) => setTimeRange(v)}>
            <SelectTrigger className="w-[120px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="14d">14 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          {onRefresh && (
            <Button variant="outline" size="icon" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total P&L</p>
                <p className={`text-xl font-bold font-mono ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                  ${stats.totalPnL.toFixed(2)}
                </p>
              </div>
              {stats.totalPnL >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-500/20" />
              ) : (
                <TrendingDown className="h-8 w-8 text-destructive/20" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-xl font-bold">{stats.winRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{stats.wins}W / {stats.losses}L</p>
              </div>
              <Target className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Profit Factor</p>
                <p className="text-xl font-bold">{stats.profitFactor.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  Avg: ${stats.avgWin.toFixed(2)} / ${Math.abs(stats.avgLoss).toFixed(2)}
                </p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Best Streak</p>
                <p className="text-xl font-bold text-green-500">{stats.maxWinStreak} wins</p>
                <p className="text-xs text-muted-foreground">
                  Current: {stats.currentStreak} {stats.lastWasWin ? 'wins' : 'losses'}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance">
            <TrendingUp className="h-4 w-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="pairs">
            <PieChart className="h-4 w-4 mr-2" />
            Pairs
          </TabsTrigger>
          <TabsTrigger value="timing">
            <Calendar className="h-4 w-4 mr-2" />
            Timing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <WinRateOverTimeChart data={winRateData} />
            <CumulativePnLChart data={pnlData} />
          </div>
          
          {/* Direction Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Direction Analysis</CardTitle>
              <CardDescription>LONG vs SHORT performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="font-medium">LONG</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>Trades: {directionStats.long.trades}</p>
                    <p className={directionStats.long.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>
                      P&L: ${directionStats.long.pnl.toFixed(2)}
                    </p>
                    <p>Win Rate: {directionStats.long.winRate.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <span className="font-medium">SHORT</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>Trades: {directionStats.short.trades}</p>
                    <p className={directionStats.short.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>
                      P&L: ${directionStats.short.pnl.toFixed(2)}
                    </p>
                    <p>Win Rate: {directionStats.short.winRate.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <CumulativePnLChart data={pnlData} milestones={[25, 50, 100, 250, 500]} />
          <WinRateOverTimeChart data={winRateData} targetWinRate={65} />
        </TabsContent>

        <TabsContent value="pairs" className="space-y-4">
          <PairComparisonChart data={pairData} />
        </TabsContent>

        <TabsContent value="timing" className="space-y-4">
          <TradingHoursHeatmap data={hourlyData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
