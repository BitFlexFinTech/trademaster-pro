import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Trophy, AlertTriangle } from 'lucide-react';

interface PairPerformance {
  pair: string;
  pnl: number;
  trades: number;
  winRate: number;
  avgProfit: number;
}

interface PairComparisonChartProps {
  data: PairPerformance[];
}

export function PairComparisonChart({ data }: PairComparisonChartProps) {
  const { sortedData, bestPair, worstPair, recommendation } = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.pnl - a.pnl);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    
    // Generate recommendation
    let rec = '';
    if (best && worst && data.length > 1) {
      if (worst.pnl < 0 && worst.trades >= 5) {
        rec = `Consider reducing exposure to ${worst.pair}`;
      } else if (best.winRate > 70 && best.trades >= 5) {
        rec = `${best.pair} shows strong performance - consider increasing position`;
      }
    }
    
    return { 
      sortedData: sorted,
      bestPair: best,
      worstPair: worst,
      recommendation: rec,
    };
  }, [data]);

  const maxPnL = Math.max(...data.map(d => Math.abs(d.pnl)), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Pair Performance</CardTitle>
            <CardDescription>P&L comparison by trading pair</CardDescription>
          </div>
          <div className="flex gap-2">
            {bestPair && (
              <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                <Trophy className="h-3 w-3 mr-1" />
                {bestPair.pair}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={sortedData} 
              layout="vertical"
              margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} horizontal={true} vertical={false} />
              <XAxis 
                type="number" 
                tick={{ fontSize: 10 }} 
                className="text-muted-foreground"
                tickFormatter={(value) => `$${value}`}
              />
              <YAxis 
                type="category" 
                dataKey="pair" 
                tick={{ fontSize: 11 }} 
                className="text-muted-foreground"
                width={55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'pnl') return [`$${value.toFixed(2)}`, 'P&L'];
                  return [value, name];
                }}
                labelFormatter={(label) => label}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as PairPerformance;
                  return (
                    <div className="bg-card border rounded-lg p-2 shadow-lg text-xs">
                      <p className="font-medium mb-1">{item.pair}</p>
                      <div className="space-y-0.5 text-muted-foreground">
                        <p>P&L: <span className={item.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>${item.pnl.toFixed(2)}</span></p>
                        <p>Win Rate: {item.winRate.toFixed(1)}%</p>
                        <p>Trades: {item.trades}</p>
                        <p>Avg: ${item.avgProfit.toFixed(2)}</p>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                {sortedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.pnl >= 0 ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(var(--destructive))'}
                    opacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Recommendation */}
        {recommendation && (
          <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{recommendation}</span>
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t">
          {bestPair && (
            <div className="text-xs">
              <p className="text-muted-foreground mb-1">Best Performer</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span className="font-medium">{bestPair.pair}</span>
                <span className="text-green-500">+${bestPair.pnl.toFixed(2)}</span>
              </div>
            </div>
          )}
          {worstPair && worstPair.pnl < 0 && (
            <div className="text-xs">
              <p className="text-muted-foreground mb-1">Needs Attention</p>
              <div className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-destructive" />
                <span className="font-medium">{worstPair.pair}</span>
                <span className="text-destructive">${worstPair.pnl.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
