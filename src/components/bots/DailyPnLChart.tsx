import { useEffect, useState } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DailyPnLChart() {
  const { analytics, loading } = useBotAnalytics('30d', 'all', 'all');
  const { resetTrigger } = useTradingMode();
  const [chartData, setChartData] = useState<Array<{ date: string; pnl: number }>>([]);

  // Listen to reset trigger - clear chart
  useEffect(() => {
    if (resetTrigger > 0) {
      setChartData([]);
    }
  }, [resetTrigger]);

  // Update chart data when analytics loads
  useEffect(() => {
    if (!loading && analytics?.pnlHistory) {
      setChartData(analytics.pnlHistory.slice(-14));
    }
  }, [analytics, loading]);

  if (loading) {
    return (
      <div className="card-terminal p-4 h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading chart...</div>
      </div>
    );
  }

  const totalProfit = chartData.reduce((sum, d) => sum + (d.pnl > 0 ? d.pnl : 0), 0);
  const totalLoss = chartData.reduce((sum, d) => sum + (d.pnl < 0 ? Math.abs(d.pnl) : 0), 0);
  const profitDays = chartData.filter(d => d.pnl > 0).length;
  const lossDays = chartData.filter(d => d.pnl < 0).length;

  return (
    <div className="card-terminal p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Daily P&L</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-primary">
            <TrendingUp className="w-3 h-3" />
            {profitDays}d +${totalProfit.toFixed(0)}
          </span>
          <span className="flex items-center gap-1 text-destructive">
            <TrendingDown className="w-3 h-3" />
            {lossDays}d -${totalLoss.toFixed(0)}
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No daily data available yet. Start trading to see daily P&L.
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} 
                tickFormatter={(value) => value.slice(5)} // MM-DD
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} 
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px'
                }}
                formatter={(value: number) => [
                  <span className={cn('font-mono font-bold', value >= 0 ? 'text-primary' : 'text-destructive')}>
                    {value >= 0 ? '+' : ''}${value.toFixed(2)}
                  </span>,
                  'P&L'
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Bar 
                dataKey="pnl" 
                radius={[4, 4, 0, 0]}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.pnl >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} 
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
