import { useState } from 'react';
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
  Crosshair,
  TrendingUp,
  TrendingDown,
  Minus,
  Type,
  PenTool,
  Maximize2,
  Download,
  Settings,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

// Mock candlestick data
const chartData = Array.from({ length: 50 }, (_, i) => {
  const base = 92000 + Math.sin(i / 5) * 3000 + Math.random() * 1000;
  return {
    date: `Dec ${(i % 30) + 1}`,
    open: base,
    high: base + Math.random() * 500,
    low: base - Math.random() * 500,
    close: base + (Math.random() - 0.5) * 400,
    volume: Math.random() * 10000,
  };
});

const timeframes = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];
const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'AVAX/USDT'];

const drawingTools = [
  { icon: Crosshair, name: 'Crosshair' },
  { icon: TrendingUp, name: 'Trend Line' },
  { icon: Minus, name: 'Horizontal Line' },
  { icon: Type, name: 'Text' },
  { icon: PenTool, name: 'Freehand' },
];

export default function Charts() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('4h');
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');

  const currentPrice = 92384.5;
  const priceChange = -1420.5;
  const priceChangePercent = -1.51;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-card">
        <div className="flex items-center gap-4">
          <Select value={selectedPair} onValueChange={setSelectedPair}>
            <SelectTrigger className="w-36 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pairs.map((pair) => (
                <SelectItem key={pair} value={pair}>{pair}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  selectedTimeframe === tf
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-4 h-4" />
            Indicators
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Bitcoin/Tether - 4h - OKX</p>
            <p className={`font-mono ${priceChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
              ${currentPrice.toLocaleString()} ({priceChangePercent}%)
            </p>
          </div>
          <Button variant="outline" size="sm">
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Drawing Tools Sidebar */}
        <div className="w-12 bg-card border-r border-border flex flex-col items-center py-2 gap-1">
          {drawingTools.map((tool) => (
            <button
              key={tool.name}
              className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
              title={tool.name}
            >
              <tool.icon className="w-5 h-5" />
            </button>
          ))}
        </div>

        {/* Main Chart */}
        <div className="flex-1 bg-background p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" />
              <XAxis dataKey="date" stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis
                domain={['dataMin - 1000', 'dataMax + 1000']}
                stroke="#666"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111',
                  border: '1px solid #333',
                  borderRadius: '4px',
                }}
                labelStyle={{ color: '#fff' }}
              />
              <ReferenceLine y={100780} stroke="#3B82F6" strokeDasharray="3 3" />
              <ReferenceLine y={109334} stroke="#EF4444" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#00FF88"
                strokeWidth={2}
                dot={false}
              />
              <Bar dataKey="volume" fill="#00FF88" opacity={0.3} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-64 bg-card border-l border-border p-4 space-y-6 overflow-y-auto">
          {/* Key Stats */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="font-medium text-foreground">BTCUSDT</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Volume</span>
                <span className="font-mono text-foreground">8.27K</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Volume (30D)</span>
                <span className="font-mono text-foreground">8.44K</span>
              </div>
            </div>
          </div>

          {/* Performance */}
          <div>
            <h4 className="text-sm text-muted-foreground mb-3">Performance</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '1W', value: '+7.01%', positive: true },
                { label: '1M', value: '-9.76%', positive: false },
                { label: '3M', value: '-17.23%', positive: false },
                { label: '6M', value: '-15.02%', positive: false },
                { label: 'YTD', value: '-1.34%', positive: false },
                { label: '1Y', value: '-8.68%', positive: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`p-2 rounded text-center text-xs ${
                    item.positive ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive'
                  }`}
                >
                  <div className="font-mono">{item.value}</div>
                  <div className="text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Technicals */}
          <div>
            <h4 className="text-sm text-muted-foreground mb-3">Technicals</h4>
            <div className="relative h-24 flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">Neutral</p>
                <div className="flex items-center justify-center gap-4 mt-2 text-xs">
                  <span className="text-destructive">Sell</span>
                  <div className="w-20 h-2 bg-gradient-to-r from-destructive via-muted to-primary rounded" />
                  <span className="text-primary">Buy</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
