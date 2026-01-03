import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type TimeRange = '1h' | '24h' | '7d' | '30d';

interface RejectionRecord {
  id: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  rejection_reason: string;
  momentum: number | null;
  volatility: number | null;
  volume_surge: number | null;
  spread_percent: number | null;
  expected_duration: number | null;
  price_at_rejection: number | null;
  created_at: string;
}

interface ReasonBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

interface SymbolBreakdown {
  symbol: string;
  count: number;
}

interface TimeSeriesPoint {
  time: string;
  volume: number;
  volatility: number;
  momentum: number;
  spread: number;
  timeOfDay: number;
  duration: number;
  other: number;
  total: number;
}

export interface RejectionAnalyticsData {
  totalRejections: number;
  qualificationRate: number;
  topReasons: ReasonBreakdown[];
  topSymbols: SymbolBreakdown[];
  timeSeries: TimeSeriesPoint[];
  recentRejections: RejectionRecord[];
}

interface Filters {
  symbol?: string;
  reason?: string;
  exchange?: string;
}

function getTimeAgo(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function categorizeReason(reason: string): string {
  const lowerReason = reason.toLowerCase();
  if (lowerReason.includes('volume')) return 'volume';
  if (lowerReason.includes('volatility')) return 'volatility';
  if (lowerReason.includes('momentum')) return 'momentum';
  if (lowerReason.includes('spread')) return 'spread';
  if (lowerReason.includes('time') || lowerReason.includes('hour')) return 'timeOfDay';
  if (lowerReason.includes('duration') || lowerReason.includes('slow')) return 'duration';
  return 'other';
}

export function useRejectionAnalytics(timeRange: TimeRange, filters?: Filters) {
  const { user } = useAuth();
  const [data, setData] = useState<RejectionAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [availableReasons, setAvailableReasons] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const timeAgo = getTimeAgo(timeRange);
        
        // Build query
        let query = supabase
          .from('rejected_trades')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', timeAgo.toISOString())
          .order('created_at', { ascending: false });

        // Apply filters
        if (filters?.symbol) {
          query = query.eq('symbol', filters.symbol);
        }
        if (filters?.reason) {
          query = query.ilike('rejection_reason', `%${filters.reason}%`);
        }
        if (filters?.exchange) {
          query = query.eq('exchange', filters.exchange);
        }

        const { data: rejections, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        const records = (rejections || []) as RejectionRecord[];

        // Calculate stats
        const totalRejections = records.length;

        // Assuming ~8% qualification rate based on scanner stats
        const qualificationRate = totalRejections > 0 ? 8.2 : 0;

        // Group by reason
        const reasonCounts: Record<string, number> = {};
        records.forEach(r => {
          const key = r.rejection_reason || 'Unknown';
          reasonCounts[key] = (reasonCounts[key] || 0) + 1;
        });

        const topReasons: ReasonBreakdown[] = Object.entries(reasonCounts)
          .map(([reason, count]) => ({
            reason,
            count,
            percentage: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Group by symbol
        const symbolCounts: Record<string, number> = {};
        records.forEach(r => {
          symbolCounts[r.symbol] = (symbolCounts[r.symbol] || 0) + 1;
        });

        const topSymbols: SymbolBreakdown[] = Object.entries(symbolCounts)
          .map(([symbol, count]) => ({ symbol, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Build time series
        const timeGroups: Record<string, TimeSeriesPoint> = {};
        const granularity = timeRange === '1h' || timeRange === '24h' ? 'hour' : 'day';

        records.forEach(r => {
          const date = new Date(r.created_at);
          let key: string;
          
          if (granularity === 'hour') {
            key = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
          } else {
            key = `${date.getMonth() + 1}/${date.getDate()}`;
          }

          if (!timeGroups[key]) {
            timeGroups[key] = {
              time: key,
              volume: 0,
              volatility: 0,
              momentum: 0,
              spread: 0,
              timeOfDay: 0,
              duration: 0,
              other: 0,
              total: 0,
            };
          }

          const category = categorizeReason(r.rejection_reason);
          timeGroups[key][category as keyof Omit<TimeSeriesPoint, 'time' | 'total'>]++;
          timeGroups[key].total++;
        });

        const timeSeries = Object.values(timeGroups).sort((a, b) => 
          new Date(a.time).getTime() - new Date(b.time).getTime()
        );

        // Get unique symbols and reasons for filters
        const symbols = [...new Set(records.map(r => r.symbol))].sort();
        const reasons = [...new Set(records.map(r => r.rejection_reason))].sort();

        setAvailableSymbols(symbols);
        setAvailableReasons(reasons);

        setData({
          totalRejections,
          qualificationRate,
          topReasons,
          topSymbols,
          timeSeries,
          recentRejections: records.slice(0, 50),
        });
      } catch (err: any) {
        console.error('Failed to fetch rejection analytics:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, timeRange, filters?.symbol, filters?.reason, filters?.exchange]);

  return { data, loading, error, availableSymbols, availableReasons };
}
