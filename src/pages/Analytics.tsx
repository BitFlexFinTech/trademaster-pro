import { BarChart3, TrendingUp, Target, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const pnlData = [
  { date: 'Jan', pnl: 450 },
  { date: 'Feb', pnl: 680 },
  { date: 'Mar', pnl: -120 },
  { date: 'Apr', pnl: 920 },
  { date: 'May', pnl: 340 },
  { date: 'Jun', pnl: 560 },
];

const winLossData = [
  { name: 'Wins', value: 73 },
  { name: 'Losses', value: 27 },
];

const exchangeData = [
  { exchange: 'Binance', trades: 45, profit: 1200 },
  { exchange: 'Bybit', trades: 32, profit: 850 },
  { exchange: 'OKX', trades: 28, profit: 720 },
  { exchange: 'KuCoin', trades: 22, profit: 540 },
  { exchange: 'Hyperliquid', trades: 18, profit: 380 },
];

const COLORS = ['#00FF88', '#FF4D4D'];

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Analytics</h1>
        </div>
        <div className="flex items-center gap-4">
          <Select defaultValue="all">
            <SelectTrigger className="w-36 bg-secondary border-border">
              <SelectValue placeholder="Exchange" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exchanges</SelectItem>
              <SelectItem value="binance">Binance</SelectItem>
              <SelectItem value="bybit">Bybit</SelectItem>
              <SelectItem value="okx">OKX</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="30d">
            <SelectTrigger className="w-32 bg-secondary border-border">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <TrendingUp className="w-4 h-4" />
            Total P&L
          </div>
          <p className="text-2xl font-bold text-primary font-mono">+$2,830</p>
          <span className="text-xs text-muted-foreground">Last 30 days</span>
        </div>
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Target className="w-4 h-4" />
            Win Rate
          </div>
          <p className="text-2xl font-bold text-foreground font-mono">72.7%</p>
          <span className="text-xs text-muted-foreground">77 total trades</span>
        </div>
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            Avg Profit/Trade
          </div>
          <p className="text-2xl font-bold text-primary font-mono">$36.75</p>
          <span className="text-xs text-muted-foreground">Per winning trade</span>
        </div>
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            Active Strategies
          </div>
          <p className="text-2xl font-bold text-foreground font-mono">3</p>
          <span className="text-xs text-muted-foreground">Out of 7 available</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cumulative P&L */}
        <div className="card-terminal p-4">
          <h3 className="font-semibold text-foreground mb-4">Cumulative P&L</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                labelStyle={{ color: '#fff' }}
              />
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#00FF88"
                strokeWidth={2}
                dot={{ fill: '#00FF88' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Win/Loss Ratio */}
        <div className="card-terminal p-4">
          <h3 className="font-semibold text-foreground mb-4">Win/Loss Ratio</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={winLossData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {winLossData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Exchange Comparison */}
        <div className="card-terminal p-4 lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4">Exchange Performance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={exchangeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="exchange" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="profit" fill="#00FF88" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
