import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart
} from 'recharts';
import { TrendingUp, Calendar, Clock, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';
import { format, parseISO, startOfHour, startOfDay, startOfWeek } from 'date-fns';

type Granularity = 'hourly' | 'daily' | 'weekly';

interface TimelineDataPoint {
  timestamp: string;
  label: string;
  profit: number;
  cumulative: number;
  trades: number;
  isMilestone?: boolean;
  milestoneLabel?: string;
}

const MILESTONES = [25, 50, 100, 200, 500];

export function ProfitTimelineChart({ days = 30 }: { days?: number }) {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const { analytics, isLoading } = useTradeAnalytics(days);

  const timelineData = useMemo<TimelineDataPoint[]>(() => {
    if (!analytics.dailyProfits.length) return [];

    // For daily granularity, use dailyProfits directly
    if (granularity === 'daily') {
      let cumulative = 0;
      const data = analytics.dailyProfits.map(day => {
        cumulative += day.profit;
        const isMilestone = MILESTONES.some(m => cumulative >= m && cumulative - day.profit < m);
        const milestone = MILESTONES.find(m => cumulative >= m && cumulative - day.profit < m);
        
        return {
          timestamp: day.date,
          label: format(parseISO(day.date), 'MMM d'),
          profit: day.profit,
          cumulative,
          trades: day.trades,
          isMilestone,
          milestoneLabel: milestone ? `$${milestone}` : undefined,
        };
      });
      return data;
    }

    // For weekly, aggregate by week
    if (granularity === 'weekly') {
      const weekMap = new Map<string, { profit: number; trades: number }>();
      
      analytics.dailyProfits.forEach(day => {
        const weekStart = format(startOfWeek(parseISO(day.date)), 'yyyy-MM-dd');
        const existing = weekMap.get(weekStart) || { profit: 0, trades: 0 };
        existing.profit += day.profit;
        existing.trades += day.trades;
        weekMap.set(weekStart, existing);
      });

      let cumulative = 0;
      return Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => {
          cumulative += stats.profit;
          const isMilestone = MILESTONES.some(m => cumulative >= m && cumulative - stats.profit < m);
          const milestone = MILESTONES.find(m => cumulative >= m && cumulative - stats.profit < m);
          
          return {
            timestamp: date,
            label: format(parseISO(date), 'MMM d'),
            profit: stats.profit,
            cumulative,
            trades: stats.trades,
            isMilestone,
            milestoneLabel: milestone ? `$${milestone}` : undefined,
          };
        });
    }

    // For hourly, we'd need more granular data - use daily as fallback
    return analytics.dailyProfits.map(day => ({
      timestamp: day.date,
      label: format(parseISO(day.date), 'MMM d HH:mm'),
      profit: day.profit,
      cumulative: 0,
      trades: day.trades,
    }));
  }, [analytics, granularity]);

  const maxCumulative = useMemo(() => {
    return Math.max(...timelineData.map(d => d.cumulative), 0);
  }, [timelineData]);

  const activeMilestones = useMemo(() => {
    return MILESTONES.filter(m => m <= maxCumulative * 1.5);
  }, [maxCumulative]);

  if (isLoading) {
    return (
      <Card className="card-glass animate-pulse">
        <CardContent className="p-4 h-[350px]" />
      </Card>
    );
  }

  return (
    <Card className="card-glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Profit Timeline</CardTitle>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Granularity Toggle */}
            <div className="flex rounded-md border bg-secondary/30">
              {(['hourly', 'daily', 'weekly'] as Granularity[]).map(g => (
                <Button
                  key={g}
                  variant={granularity === g ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setGranularity(g)}
                  className={cn(
                    "h-6 px-2 text-[10px] rounded-none first:rounded-l-md last:rounded-r-md",
                    granularity === g && "bg-primary text-primary-foreground"
                  )}
                >
                  {g === 'hourly' && <Clock className="w-3 h-3 mr-1" />}
                  {g === 'daily' && <Calendar className="w-3 h-3 mr-1" />}
                  {g === 'weekly' && <BarChart3 className="w-3 h-3 mr-1" />}
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Button>
              ))}
            </div>
            
            <Badge variant="outline" className="text-[10px]">
              Last {days} days
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3">
        {timelineData.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No trade data available</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `$${v}`}
                tickLine={false}
                axisLine={false}
              />
              
              {/* Milestone Reference Lines */}
              {activeMilestones.map(milestone => (
                <ReferenceLine 
                  key={milestone}
                  y={milestone} 
                  stroke="hsl(var(--primary))" 
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                  label={{ 
                    value: `$${milestone}`, 
                    position: 'right',
                    fontSize: 9,
                    fill: 'hsl(var(--primary))',
                    opacity: 0.7
                  }}
                />
              ))}
              
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload as TimelineDataPoint;
                  return (
                    <div className="bg-popover border rounded-lg p-2 shadow-lg text-xs">
                      <div className="font-semibold mb-1">{data.label}</div>
                      <div className="space-y-0.5 text-muted-foreground">
                        <div className="flex justify-between gap-4">
                          <span>Daily:</span>
                          <span className={cn(
                            "font-mono",
                            data.profit >= 0 ? "text-primary" : "text-destructive"
                          )}>
                            {data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Cumulative:</span>
                          <span className="font-mono text-foreground font-semibold">
                            ${data.cumulative.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Trades:</span>
                          <span>{data.trades}</span>
                        </div>
                      </div>
                      {data.isMilestone && (
                        <div className="mt-1 pt-1 border-t text-primary font-semibold">
                          🎉 Milestone: {data.milestoneLabel}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#profitGradient)"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (payload.isMilestone) {
                    return (
                      <circle 
                        key={props.index}
                        cx={cx} 
                        cy={cy} 
                        r={5} 
                        fill="hsl(var(--primary))" 
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    );
                  }
                  return null;
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        
        {/* Summary Stats */}
        {timelineData.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Total Profit</div>
              <div className={cn(
                "text-sm font-bold font-mono",
                analytics.totalProfit >= 0 ? "text-primary" : "text-destructive"
              )}>
                {analytics.totalProfit >= 0 ? '+' : ''}${analytics.totalProfit.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Avg/Trade</div>
              <div className="text-sm font-bold font-mono">
                ${analytics.avgProfitPerTrade.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground">Win Rate</div>
              <div className="text-sm font-bold font-mono">
                {analytics.overallWinRate.toFixed(0)}%
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
