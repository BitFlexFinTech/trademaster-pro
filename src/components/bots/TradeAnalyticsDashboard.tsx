import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, TrendingUp, TrendingDown, Target, Clock, 
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown, ChevronUp 
} from 'lucide-react';
import { useTradeAnalytics, PairStats } from '@/hooks/useTradeAnalytics';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

interface TradeAnalyticsDashboardProps {
  className?: string;
  defaultExpanded?: boolean;
}

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
const PROFIT_COLOR = 'hsl(142, 76%, 36%)'; // emerald
const LOSS_COLOR = 'hsl(0, 84%, 60%)'; // red

export function TradeAnalyticsDashboard({ className, defaultExpanded = false }: TradeAnalyticsDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [days, setDays] = useState(30);
  const { analytics, isLoading, refresh } = useTradeAnalytics(days);

  const directionData = [
    { name: 'Long', value: analytics.longStats.totalTrades, profit: analytics.longStats.totalProfit },
    { name: 'Short', value: analytics.shortStats.totalTrades, profit: analytics.shortStats.totalProfit },
  ];

  return (
    <Card className={cn("card-terminal", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle 
            className="text-sm flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            Trade Analytics
            <Badge variant="outline" className="text-[10px]">
              {days}d
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <div className="p-2 rounded-lg bg-card border">
              <div className="text-[10px] text-muted-foreground">Total Trades</div>
              <div className="text-lg font-bold">{analytics.totalTrades}</div>
            </div>
            <div className="p-2 rounded-lg bg-card border">
              <div className="text-[10px] text-muted-foreground">Win Rate</div>
              <div className={cn(
                "text-lg font-bold",
                analytics.overallWinRate >= 50 ? "text-profit" : "text-loss"
              )}>
                {analytics.overallWinRate.toFixed(1)}%
              </div>
            </div>
            <div className="p-2 rounded-lg bg-card border">
              <div className="text-[10px] text-muted-foreground">Total Profit</div>
              <div className={cn(
                "text-lg font-bold",
                analytics.totalProfit >= 0 ? "text-profit" : "text-loss"
              )}>
                ${analytics.totalProfit.toFixed(2)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-card border">
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Avg Hold
              </div>
              <div className="text-lg font-bold">
                {analytics.avgHoldTime.toFixed(0)}m
              </div>
            </div>
          </div>

          <Tabs defaultValue="pairs" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-8">
              <TabsTrigger value="pairs" className="text-xs">By Pair</TabsTrigger>
              <TabsTrigger value="direction" className="text-xs">Direction</TabsTrigger>
              <TabsTrigger value="trend" className="text-xs">Trend</TabsTrigger>
              <TabsTrigger value="distribution" className="text-xs">Dist.</TabsTrigger>
            </TabsList>

            {/* Pair Performance Tab */}
            <TabsContent value="pairs" className="mt-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.pairStats.slice(0, 8)} layout="vertical">
                    <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} fontSize={10} />
                    <YAxis type="category" dataKey="pair" width={70} fontSize={10} />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar dataKey="totalProfit" fill={PROFIT_COLOR}>
                      {analytics.pairStats.slice(0, 8).map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.totalProfit >= 0 ? PROFIT_COLOR : LOSS_COLOR} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Best/Worst pair badges */}
              <div className="flex gap-2 mt-2">
                {analytics.bestPair && (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/50">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    Best: {analytics.bestPair.pair} ({analytics.bestPair.winRate.toFixed(0)}% WR)
                  </Badge>
                )}
                {analytics.worstPair && analytics.worstPair !== analytics.bestPair && (
                  <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/50">
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                    Worst: {analytics.worstPair.pair}
                  </Badge>
                )}
              </div>
            </TabsContent>

            {/* Direction Tab */}
            <TabsContent value="direction" className="mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={directionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={50}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill={PROFIT_COLOR} />
                        <Cell fill={LOSS_COLOR} />
                      </Pie>
                      <Tooltip />
                      <Legend 
                        verticalAlign="bottom" 
                        height={20}
                        formatter={(value) => <span className="text-[10px]">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-3">
                  <div className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                      <TrendingUp className="h-3 w-3" />
                      LONG
                    </div>
                    <div className="text-sm font-bold">{analytics.longStats.totalTrades} trades</div>
                    <div className="text-[10px] text-muted-foreground">
                      {analytics.longStats.winRate.toFixed(1)}% WR • ${analytics.longStats.totalProfit.toFixed(2)}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg border border-red-500/30 bg-red-500/5">
                    <div className="flex items-center gap-1 text-red-400 text-xs font-medium">
                      <TrendingDown className="h-3 w-3" />
                      SHORT
                    </div>
                    <div className="text-sm font-bold">{analytics.shortStats.totalTrades} trades</div>
                    <div className="text-[10px] text-muted-foreground">
                      {analytics.shortStats.winRate.toFixed(1)}% WR • ${analytics.shortStats.totalProfit.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Daily Trend Tab */}
            <TabsContent value="trend" className="mt-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.dailyProfits.slice(-14)}>
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(v) => v.slice(5)} 
                      fontSize={10} 
                    />
                    <YAxis 
                      tickFormatter={(v) => `$${v}`} 
                      fontSize={10} 
                      width={40}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="profit" 
                      stroke={PROFIT_COLOR} 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Distribution Tab */}
            <TabsContent value="distribution" className="mt-2">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.profitDistribution}>
                    <XAxis dataKey="range" fontSize={9} />
                    <YAxis fontSize={10} width={30} />
                    <Tooltip 
                      formatter={(value: number) => [`${value} trades`, 'Count']}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--chart-1))">
                      {analytics.profitDistribution.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.range.includes('-') ? LOSS_COLOR : PROFIT_COLOR} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
