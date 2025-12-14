import { useState } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';

interface BotComparisonViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TimeframeFilter = '7d' | '30d' | '90d';

export function BotComparisonView({ open, onOpenChange }: BotComparisonViewProps) {
  const { mode } = useTradingMode();
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('30d');

  // Fetch analytics separately for spot and leverage bots
  const { analytics: spotAnalytics, loading: spotLoading } = useBotAnalytics(timeframe, mode, 'spot');
  const { analytics: leverageAnalytics, loading: leverageLoading } = useBotAnalytics(timeframe, mode, 'leverage');

  const loading = spotLoading || leverageLoading;

  // Comparison data for bar chart
  const comparisonData = [
    {
      name: 'Total P&L',
      Spot: spotAnalytics.totalProfit,
      Leverage: leverageAnalytics.totalProfit,
    },
    {
      name: 'Win Rate %',
      Spot: spotAnalytics.winRate,
      Leverage: leverageAnalytics.winRate,
    },
    {
      name: 'Total Trades',
      Spot: spotAnalytics.totalTrades,
      Leverage: leverageAnalytics.totalTrades,
    },
  ];

  // Pie chart data
  const spotPieData = [
    { name: 'Wins', value: spotAnalytics.winCount, fill: 'hsl(var(--primary))' },
    { name: 'Losses', value: spotAnalytics.lossCount, fill: 'hsl(var(--destructive))' },
  ];

  const leveragePieData = [
    { name: 'Wins', value: leverageAnalytics.winCount, fill: 'hsl(var(--primary))' },
    { name: 'Losses', value: leverageAnalytics.lossCount, fill: 'hsl(var(--destructive))' },
  ];

  const MetricCard = ({ 
    label, 
    spotValue, 
    leverageValue, 
    isCurrency = false,
    isPercentage = false,
    inverse = false,
  }: { 
    label: string; 
    spotValue: number; 
    leverageValue: number;
    isCurrency?: boolean;
    isPercentage?: boolean;
    inverse?: boolean;
  }) => {
    const spotBetter = inverse ? spotValue < leverageValue : spotValue > leverageValue;
    const leverageBetter = inverse ? leverageValue < spotValue : leverageValue > spotValue;

    const formatValue = (val: number) => {
      if (isCurrency) return `$${val.toFixed(2)}`;
      if (isPercentage) return `${val.toFixed(1)}%`;
      return val.toFixed(0);
    };

    return (
      <div className="bg-secondary/30 p-3 rounded">
        <p className="text-[10px] text-muted-foreground mb-2">{label}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className={cn(
            "text-center p-2 rounded",
            spotBetter ? "bg-primary/10 border border-primary/30" : "bg-background/50"
          )}>
            <span className="text-[9px] text-muted-foreground block mb-1">SPOT</span>
            <span className={cn(
              "font-mono font-bold text-sm",
              isCurrency && spotValue >= 0 ? "text-primary" : 
              isCurrency && spotValue < 0 ? "text-destructive" : "text-foreground"
            )}>
              {formatValue(spotValue)}
            </span>
            {spotBetter && <Badge variant="outline" className="text-[7px] mt-1 border-primary text-primary">BETTER</Badge>}
          </div>
          <div className={cn(
            "text-center p-2 rounded",
            leverageBetter ? "bg-primary/10 border border-primary/30" : "bg-background/50"
          )}>
            <span className="text-[9px] text-muted-foreground block mb-1">LEVERAGE</span>
            <span className={cn(
              "font-mono font-bold text-sm",
              isCurrency && leverageValue >= 0 ? "text-primary" : 
              isCurrency && leverageValue < 0 ? "text-destructive" : "text-foreground"
            )}>
              {formatValue(leverageValue)}
            </span>
            {leverageBetter && <Badge variant="outline" className="text-[7px] mt-1 border-primary text-primary">BETTER</Badge>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Bot Performance Comparison
            <Badge variant="outline" className="text-[10px] ml-2">
              {mode === 'demo' ? 'DEMO' : 'LIVE'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Timeframe Filter */}
        <div className="flex items-center gap-2 mb-4">
          {(['7d', '30d', '90d'] as TimeframeFilter[]).map((tf) => (
            <Button
              key={tf}
              size="sm"
              variant={timeframe === tf ? 'default' : 'outline'}
              onClick={() => setTimeframe(tf)}
              className="h-7 text-xs"
            >
              {tf === '7d' ? '7 Days' : tf === '30d' ? '30 Days' : '90 Days'}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-muted-foreground text-sm">Loading comparison data...</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-2">
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <MetricCard 
                  label="Total P&L" 
                  spotValue={spotAnalytics.totalProfit} 
                  leverageValue={leverageAnalytics.totalProfit}
                  isCurrency
                />
                <MetricCard 
                  label="Win Rate" 
                  spotValue={spotAnalytics.winRate} 
                  leverageValue={leverageAnalytics.winRate}
                  isPercentage
                />
                <MetricCard 
                  label="Total Trades" 
                  spotValue={spotAnalytics.totalTrades} 
                  leverageValue={leverageAnalytics.totalTrades}
                />
                <MetricCard 
                  label="Avg Win" 
                  spotValue={spotAnalytics.avgWinAmount} 
                  leverageValue={leverageAnalytics.avgWinAmount}
                  isCurrency
                />
                <MetricCard 
                  label="Avg Loss" 
                  spotValue={Math.abs(spotAnalytics.avgLossAmount)} 
                  leverageValue={Math.abs(leverageAnalytics.avgLossAmount)}
                  isCurrency
                  inverse
                />
                <MetricCard 
                  label="Profit Factor" 
                  spotValue={spotAnalytics.profitFactor} 
                  leverageValue={leverageAnalytics.profitFactor}
                />
              </div>

              {/* Bar Chart Comparison */}
              <div className="bg-secondary/30 p-4 rounded">
                <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  SIDE-BY-SIDE COMPARISON
                </h4>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Spot" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Leverage" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Win/Loss Distribution Pie Charts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/30 p-4 rounded">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    SPOT WIN/LOSS
                  </h4>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={spotPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {spotPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-center text-[10px] text-muted-foreground mt-1">
                    {spotAnalytics.winCount}W / {spotAnalytics.lossCount}L
                  </p>
                </div>

                <div className="bg-secondary/30 p-4 rounded">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" />
                    LEVERAGE WIN/LOSS
                  </h4>
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={leveragePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={50}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {leveragePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-center text-[10px] text-muted-foreground mt-1">
                    {leverageAnalytics.winCount}W / {leverageAnalytics.lossCount}L
                  </p>
                </div>
              </div>

              {/* Best/Worst Trades */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/30 p-3 rounded">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">BEST TRADES</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Spot:</span>
                      <span className="font-mono text-primary">${spotAnalytics.bestTrade.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Leverage:</span>
                      <span className="font-mono text-primary">${leverageAnalytics.bestTrade.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-secondary/30 p-3 rounded">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">WORST TRADES</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Spot:</span>
                      <span className="font-mono text-destructive">${spotAnalytics.worstTrade.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Leverage:</span>
                      <span className="font-mono text-destructive">${leverageAnalytics.worstTrade.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}