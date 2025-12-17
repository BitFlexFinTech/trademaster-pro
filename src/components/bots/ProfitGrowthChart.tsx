import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { LineChartSchema } from '@/lib/dashboardGenerator';

interface ProfitGrowthChartProps {
  data: LineChartSchema;
}

export function ProfitGrowthChart({ data }: ProfitGrowthChartProps) {
  const chartData = useMemo(() => {
    return data.data.map((point, idx) => ({
      trade: point.x,
      profit: point.y,
      idx,
    }));
  }, [data]);

  const maxProfit = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.max(...chartData.map(d => d.profit));
  }, [chartData]);

  const minProfit = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.min(...chartData.map(d => d.profit), 0);
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-muted-foreground text-xs">
        No data available
      </div>
    );
  }

  return (
    <div className="h-[120px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
          <XAxis 
            dataKey="trade" 
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis 
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
            domain={[minProfit, maxProfit * 1.1]}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '4px',
              fontSize: '10px',
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative Profit']}
            labelFormatter={(label) => `Trade #${label}`}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: 'hsl(var(--primary))' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
