/**
 * Backtest Panel
 * UI for running historical backtests on AI pair analyzer strategy
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useBacktest } from '@/hooks/useBacktest';
import { 
  FlaskConical, 
  Play, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  Calendar,
  DollarSign,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

const ASSETS = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' },
  { value: 'SOLUSDT', label: 'SOL/USDT' },
  { value: 'XRPUSDT', label: 'XRP/USDT' },
  { value: 'BNBUSDT', label: 'BNB/USDT' },
];

interface BacktestPanelProps {
  className?: string;
}

export function BacktestPanel({ className }: BacktestPanelProps) {
  const { 
    currentBacktest, 
    monthlyBreakdown, 
    running, 
    runBacktest 
  } = useBacktest();
  
  const [asset, setAsset] = useState('BTCUSDT');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [initialBalance, setInitialBalance] = useState('10000');
  
  const handleRunBacktest = async () => {
    await runBacktest(asset, startDate, endDate, parseFloat(initialBalance));
  };
  
  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };
  
  return (
    <Card className={cn("bg-card/50 border-border/30", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          Strategy Backtester
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Configuration Form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Asset</Label>
            <Select value={asset} onValueChange={setAsset}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSETS.map(a => (
                  <SelectItem key={a.value} value={a.value} className="text-xs">
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs">Initial Balance</Label>
            <div className="relative">
              <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input 
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="h-8 text-xs pl-6"
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Start Date
            </Label>
            <Input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              End Date
            </Label>
            <Input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        
        <Button 
          onClick={handleRunBacktest}
          disabled={running}
          className="w-full h-8 text-xs"
        >
          {running ? (
            <>
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1.5" />
              Run Backtest
            </>
          )}
        </Button>
        
        {/* Results Display */}
        {currentBacktest && (
          <div className="space-y-3 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Results</span>
              <Badge 
                variant={currentBacktest.status === 'completed' ? 'default' : 'destructive'}
                className="text-[10px] h-5"
              >
                {currentBacktest.status === 'completed' ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> Complete</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" /> Failed</>
                )}
              </Badge>
            </div>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground">Total P&L</div>
                <div className={cn(
                  "text-sm font-mono font-semibold",
                  (currentBacktest.totalPnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {formatPnL(currentBacktest.totalPnl || 0)}
                </div>
              </div>
              
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground">Win Rate</div>
                <div className="text-sm font-mono font-semibold flex items-center gap-1">
                  {((currentBacktest.winRate || 0) * 100).toFixed(1)}%
                  {(currentBacktest.winRate || 0) >= 0.5 ? (
                    <TrendingUp className="w-3 h-3 text-green-400" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                </div>
              </div>
              
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground">Total Trades</div>
                <div className="text-sm font-mono font-semibold">
                  {currentBacktest.totalTrades}
                </div>
              </div>
              
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground">Max Drawdown</div>
                <div className="text-sm font-mono font-semibold text-amber-400">
                  {((currentBacktest.maxDrawdown || 0) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Final Balance */}
            <div className="flex items-center justify-between bg-muted/20 rounded p-2">
              <span className="text-xs text-muted-foreground">Final Balance</span>
              <span className="text-sm font-mono font-semibold">
                ${(currentBacktest.finalBalance || 0).toFixed(2)}
              </span>
            </div>
            
            {/* Monthly Breakdown Chart */}
            {monthlyBreakdown.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center gap-1 mb-2">
                  <BarChart3 className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Monthly Performance</span>
                </div>
                <div className="h-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyBreakdown}>
                      <XAxis 
                        dataKey="period" 
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                        width={35}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'P&L']}
                      />
                      <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                        {monthlyBreakdown.map((entry, index) => (
                          <Cell 
                            key={index}
                            fill={entry.pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
