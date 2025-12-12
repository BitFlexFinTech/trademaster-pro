import { useAnalytics } from '@/hooks/useAnalytics';
import { BarChart3, TrendingUp, Target, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState } from 'react';

const COLORS = ['#00FF88', '#FF4D4D'];

export default function Analytics() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [exchange, setExchange] = useState('all');
  const { analytics, loading } = useAnalytics(timeframe, exchange);

  const winLossData = [
    { name: 'Wins', value: analytics.winLossRatio.wins || 50 },
    { name: 'Losses', value: analytics.winLossRatio.losses || 50 },
  ];

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-6 pr-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Analytics</h1>
          </div>
          <div className="flex items-center gap-4">
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger className="w-36 bg-secondary border-border"><SelectValue placeholder="Exchange" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exchanges</SelectItem>
                <SelectItem value="Binance">Binance</SelectItem>
                <SelectItem value="Bybit">Bybit</SelectItem>
                <SelectItem value="OKX">OKX</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
              <SelectTrigger className="w-32 bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2"><Download className="w-4 h-4" />Export PDF</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><TrendingUp className="w-4 h-4" />Total P&L</div>
            <p className={`text-2xl font-bold font-mono ${analytics.totalPnl >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {analytics.totalPnl >= 0 ? '+' : ''}${analytics.totalPnl.toLocaleString()}
            </p>
            <span className="text-xs text-muted-foreground">Last {timeframe}</span>
          </div>
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Target className="w-4 h-4" />Win Rate</div>
            <p className="text-2xl font-bold text-foreground font-mono">{analytics.winRate}%</p>
            <span className="text-xs text-muted-foreground">{analytics.totalTrades} total trades</span>
          </div>
          <div className="card-terminal p-4">
            <div className="text-muted-foreground text-sm mb-2">Avg Profit/Trade</div>
            <p className="text-2xl font-bold text-primary font-mono">${analytics.avgProfitPerTrade}</p>
            <span className="text-xs text-muted-foreground">Per winning trade</span>
          </div>
          <div className="card-terminal p-4">
            <div className="text-muted-foreground text-sm mb-2">Active Strategies</div>
            <p className="text-2xl font-bold text-foreground font-mono">{analytics.activeStrategies}</p>
            <span className="text-xs text-muted-foreground">Currently running</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Cumulative P&L</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analytics.pnlHistory.length > 0 ? analytics.pnlHistory : [{ date: 'Now', pnl: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Line type="monotone" dataKey="pnl" stroke="#00FF88" strokeWidth={2} dot={{ fill: '#00FF88' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Win/Loss Ratio</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={winLossData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {winLossData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card-terminal p-4 lg:col-span-2">
            <h3 className="font-semibold text-foreground mb-4">Exchange Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics.exchangePerformance.length > 0 ? analytics.exchangePerformance : [{ exchange: 'No Data', profit: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="exchange" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Bar dataKey="profit" fill="#00FF88" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
