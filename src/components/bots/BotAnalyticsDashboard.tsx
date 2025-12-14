import { useState } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, Target, DollarSign, Activity, ArrowUpDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

type TimeframeFilter = '7d' | '30d' | '90d' | 'all';
type ModeFilter = 'all' | 'demo' | 'live';
type BotTypeFilter = 'all' | 'spot' | 'leverage';

const COLORS = {
  win: 'hsl(var(--primary))',
  loss: 'hsl(var(--destructive))',
  neutral: 'hsl(var(--muted-foreground))',
};

const EXCHANGE_COLORS = [
  'hsl(var(--primary))',
  'hsl(142 76% 36%)',
  'hsl(48 96% 53%)',
  'hsl(262 83% 58%)',
  'hsl(199 89% 48%)',
  'hsl(25 95% 53%)',
];

export function BotAnalyticsDashboard() {
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('30d');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [botTypeFilter, setBotTypeFilter] = useState<BotTypeFilter>('all');

  const { analytics, loading } = useBotAnalytics(timeframe, modeFilter, botTypeFilter);

  const winLossData = [
    { name: 'Wins', value: analytics.winCount, color: COLORS.win },
    { name: 'Losses', value: analytics.lossCount, color: COLORS.loss },
  ];

  if (loading) {
    return (
      <div className="card-terminal p-4 h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="card-terminal p-4 h-full flex flex-col">
      {/* Header with Filters */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Bot Analytics</span>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe Filter */}
          <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as TimeframeFilter)}>
            <TabsList className="h-6">
              <TabsTrigger value="7d" className="text-[10px] px-2 h-5">7D</TabsTrigger>
              <TabsTrigger value="30d" className="text-[10px] px-2 h-5">30D</TabsTrigger>
              <TabsTrigger value="90d" className="text-[10px] px-2 h-5">90D</TabsTrigger>
              <TabsTrigger value="all" className="text-[10px] px-2 h-5">All</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Mode Filter */}
          <Tabs value={modeFilter} onValueChange={(v) => setModeFilter(v as ModeFilter)}>
            <TabsList className="h-6">
              <TabsTrigger value="all" className="text-[10px] px-2 h-5">All</TabsTrigger>
              <TabsTrigger value="demo" className="text-[10px] px-2 h-5">Demo</TabsTrigger>
              <TabsTrigger value="live" className="text-[10px] px-2 h-5">Live</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Bot Type Filter */}
          <Tabs value={botTypeFilter} onValueChange={(v) => setBotTypeFilter(v as BotTypeFilter)}>
            <TabsList className="h-6">
              <TabsTrigger value="all" className="text-[10px] px-2 h-5">All</TabsTrigger>
              <TabsTrigger value="spot" className="text-[10px] px-2 h-5">Spot</TabsTrigger>
              <TabsTrigger value="leverage" className="text-[10px] px-2 h-5">Leverage</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {analytics.totalTrades === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No trades found for selected filters. Start trading to see analytics.
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-secondary/50 p-2 rounded text-center">
              <DollarSign className="w-3 h-3 mx-auto text-primary mb-1" />
              <p className={cn('text-sm font-bold font-mono', analytics.totalProfit >= 0 ? 'text-primary' : 'text-destructive')}>
                ${analytics.totalProfit.toFixed(2)}
              </p>
              <p className="text-[9px] text-muted-foreground">Total P&L</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <Target className="w-3 h-3 mx-auto text-primary mb-1" />
              <p className="text-sm font-bold text-primary font-mono">{analytics.winRate.toFixed(1)}%</p>
              <p className="text-[9px] text-muted-foreground">Win Rate</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <Activity className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-bold text-foreground font-mono">{analytics.totalTrades}</p>
              <p className="text-[9px] text-muted-foreground">Total Trades</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <ArrowUpDown className="w-3 h-3 mx-auto text-muted-foreground mb-1" />
              <p className="text-sm font-bold text-foreground font-mono">
                {analytics.profitFactor === Infinity ? '∞' : analytics.profitFactor.toFixed(2)}
              </p>
              <p className="text-[9px] text-muted-foreground">Profit Factor</p>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Win/Loss Pie Chart */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2">WIN/LOSS DISTRIBUTION</h4>
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {winLossData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-[10px] text-muted-foreground">Wins: {analytics.winCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-[10px] text-muted-foreground">Losses: {analytics.lossCount}</span>
                </div>
              </div>
            </div>

            {/* Profit by Exchange Bar Chart */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2">PROFIT BY EXCHANGE</h4>
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.profitByExchange.slice(0, 5)} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="exchange" tick={{ fontSize: 9 }} width={50} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                    />
                    <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                      {analytics.profitByExchange.slice(0, 5).map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.profit >= 0 ? EXCHANGE_COLORS[index % EXCHANGE_COLORS.length] : COLORS.loss} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Performance Over Time */}
          <div className="bg-secondary/30 p-3 rounded mb-4">
            <h4 className="text-[10px] font-medium text-muted-foreground mb-2">CUMULATIVE P&L OVER TIME</h4>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.pnlHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 9 }} 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => value.slice(5)} // Show MM-DD
                  />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line 
                    type="monotone" 
                    dataKey="cumulative" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    name="Cumulative P&L"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeWidth={1}
                    dot={false}
                    name="Daily P&L"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-[9px] text-muted-foreground">Avg Win</p>
              <p className="text-xs font-mono text-primary">${analytics.avgWinAmount.toFixed(2)}</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-[9px] text-muted-foreground">Avg Loss</p>
              <p className="text-xs font-mono text-destructive">-${analytics.avgLossAmount.toFixed(2)}</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-[9px] text-muted-foreground">Best Trade</p>
              <p className="text-xs font-mono text-primary">${analytics.bestTrade.toFixed(2)}</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded">
              <p className="text-[9px] text-muted-foreground">Worst Trade</p>
              <p className="text-xs font-mono text-destructive">${analytics.worstTrade.toFixed(2)}</p>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
