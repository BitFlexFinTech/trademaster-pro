import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChartSchema } from '@/lib/dashboardGenerator';

interface TradeDistributionChartProps {
  data: BarChartSchema;
}

const COLORS = {
  'Long Wins': 'hsl(142, 76%, 36%)',    // Green
  'Long Losses': 'hsl(0, 84%, 60%)',     // Red
  'Short Wins': 'hsl(142, 76%, 50%)',    // Lighter green
  'Short Losses': 'hsl(0, 84%, 70%)',    // Lighter red
};

export function TradeDistributionChart({ data }: TradeDistributionChartProps) {
  const chartData = useMemo(() => {
    return data.data.map(point => ({
      name: point.label,
      value: point.value,
      color: COLORS[point.label as keyof typeof COLORS] || 'hsl(var(--primary))',
    }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-[100px] flex items-center justify-center text-muted-foreground text-xs">
        No trade data
      </div>
    );
  }

  return (
    <div className="h-[100px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 5, bottom: 5, left: 60 }}>
          <XAxis 
            type="number"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis 
            type="category"
            dataKey="name"
            tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={55}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '4px',
              fontSize: '10px',
            }}
            formatter={(value: number) => [value, 'Trades']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
