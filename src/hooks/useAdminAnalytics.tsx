import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PlatformStats {
  totalUsers: number;
  activeTraders: number;
  totalBots: number;
  runningBots: number;
  platformPnL: number;
  totalTrades: number;
  avgHitRate: number;
  totalVolume: number;
}

interface BotPerformanceData {
  botId: string;
  botName: string;
  userId: string;
  pnl: number;
  trades: number;
  hitRate: number;
  status: string;
  startedAt: string;
}

interface DailyTradeVolume {
  date: string;
  tradeCount: number;
  totalPnL: number;
  volume: number;
}

interface ExchangeDistribution {
  exchange: string;
  tradeCount: number;
  percentage: number;
}

interface ErrorStat {
  level: string;
  count: number;
  lastOccurred: string;
}

export function useAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0,
    activeTraders: 0,
    totalBots: 0,
    runningBots: 0,
    platformPnL: 0,
    totalTrades: 0,
    avgHitRate: 0,
    totalVolume: 0,
  });
  const [topBots, setTopBots] = useState<BotPerformanceData[]>([]);
  const [dailyVolume, setDailyVolume] = useState<DailyTradeVolume[]>([]);
  const [exchangeDistribution, setExchangeDistribution] = useState<ExchangeDistribution[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStat[]>([]);
  const [recentErrors, setRecentErrors] = useState<any[]>([]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch platform-wide bot stats
      const { data: botData } = await supabase
        .from('bot_runs')
        .select('id, bot_name, user_id, current_pnl, trades_executed, hit_rate, status, started_at');

      // Fetch trade data for volume calculations
      const { data: tradeData } = await supabase
        .from('trades')
        .select('id, exchange_name, profit_loss, amount, created_at')
        .order('created_at', { ascending: false })
        .limit(10000);

      // Fetch user count
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id');

      // Fetch error logs
      const { data: errorData } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      // Calculate platform stats
      const totalBots = botData?.length || 0;
      const runningBots = botData?.filter(b => b.status === 'running').length || 0;
      const platformPnL = botData?.reduce((sum, b) => sum + (b.current_pnl || 0), 0) || 0;
      const totalTrades = botData?.reduce((sum, b) => sum + (b.trades_executed || 0), 0) || 0;
      const avgHitRate = totalBots > 0
        ? botData!.reduce((sum, b) => sum + (b.hit_rate || 0), 0) / totalBots
        : 0;

      // Calculate active traders (users with bot runs in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const activeTraders = new Set(
        botData?.filter(b => new Date(b.started_at) > sevenDaysAgo).map(b => b.user_id)
      ).size;

      // Calculate total volume
      const totalVolume = tradeData?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

      setStats({
        totalUsers: profileData?.length || 0,
        activeTraders,
        totalBots,
        runningBots,
        platformPnL,
        totalTrades,
        avgHitRate,
        totalVolume,
      });

      // Top performing bots by P&L
      const sortedBots = [...(botData || [])].sort((a, b) => (b.current_pnl || 0) - (a.current_pnl || 0));
      setTopBots(sortedBots.slice(0, 10).map(b => ({
        botId: b.id,
        botName: b.bot_name,
        userId: b.user_id,
        pnl: b.current_pnl || 0,
        trades: b.trades_executed || 0,
        hitRate: b.hit_rate || 0,
        status: b.status || 'stopped',
        startedAt: b.started_at,
      })));

      // Daily trade volume (last 30 days)
      const volumeByDate = new Map<string, { count: number; pnl: number; volume: number }>();
      tradeData?.forEach(t => {
        const date = new Date(t.created_at).toISOString().split('T')[0];
        const existing = volumeByDate.get(date) || { count: 0, pnl: 0, volume: 0 };
        volumeByDate.set(date, {
          count: existing.count + 1,
          pnl: existing.pnl + (t.profit_loss || 0),
          volume: existing.volume + (t.amount || 0),
        });
      });
      
      const dailyData = Array.from(volumeByDate.entries())
        .map(([date, data]) => ({
          date,
          tradeCount: data.count,
          totalPnL: data.pnl,
          volume: data.volume,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);
      setDailyVolume(dailyData);

      // Exchange distribution
      const exchangeCounts = new Map<string, number>();
      tradeData?.forEach(t => {
        if (t.exchange_name) {
          exchangeCounts.set(t.exchange_name, (exchangeCounts.get(t.exchange_name) || 0) + 1);
        }
      });
      const totalExchangeTrades = Array.from(exchangeCounts.values()).reduce((a, b) => a + b, 0);
      setExchangeDistribution(
        Array.from(exchangeCounts.entries())
          .map(([exchange, count]) => ({
            exchange,
            tradeCount: count,
            percentage: totalExchangeTrades > 0 ? (count / totalExchangeTrades) * 100 : 0,
          }))
          .sort((a, b) => b.tradeCount - a.tradeCount)
      );

      // Error stats
      const errorCounts = new Map<string, { count: number; lastOccurred: string }>();
      errorData?.forEach(e => {
        const existing = errorCounts.get(e.level) || { count: 0, lastOccurred: e.created_at };
        errorCounts.set(e.level, {
          count: existing.count + 1,
          lastOccurred: e.created_at > existing.lastOccurred ? e.created_at : existing.lastOccurred,
        });
      });
      setErrorStats(
        Array.from(errorCounts.entries()).map(([level, data]) => ({
          level,
          count: data.count,
          lastOccurred: data.lastOccurred,
        }))
      );
      setRecentErrors(errorData || []);

    } catch (err) {
      console.error('Failed to fetch admin analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    loading,
    stats,
    topBots,
    dailyVolume,
    exchangeDistribution,
    errorStats,
    recentErrors,
    refetch: fetchAnalytics,
  };
}
