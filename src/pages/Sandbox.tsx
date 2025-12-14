import { useState, useEffect } from 'react';
import { useBacktest } from '@/hooks/useBacktest';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlaskConical, Play, RotateCcw, Calendar, Loader2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const assets = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'AVAX/USDT'];

export default function Sandbox() {
  const { currentBacktest, monthlyBreakdown, running, runBacktest, resetBacktest } = useBacktest();
  const { virtualBalance, resetTrigger, updateVirtualBalance } = useTradingMode();
  
  // Inline edit state for virtual balance
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(virtualBalance));
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-06-30');

  // Reset backtest when demo is reset
  useEffect(() => {
    if (resetTrigger > 0) {
      resetBacktest();
    }
  }, [resetTrigger, resetBacktest]);

  const handleRunBacktest = () => {
    runBacktest(selectedAsset, startDate, endDate, virtualBalance);
  };

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-6 pr-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Sandbox / Backtest Mode</h1>
            <span className="bg-secondary text-muted-foreground text-xs px-2 py-1 rounded">
              {running ? 'Running...' : currentBacktest ? 'Completed' : 'Ready'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-primary">$</span>
              <h3 className="text-sm text-muted-foreground">Virtual Balance</h3>
              {!editingBalance && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 w-5 p-0 ml-auto"
                  onClick={() => {
                    setBalanceInput(String(virtualBalance));
                    setEditingBalance(true);
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
            </div>
            {editingBalance ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  className="flex-1 bg-secondary border-border text-lg font-mono"
                  min={0}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const newBalance = parseFloat(balanceInput);
                      if (!isNaN(newBalance) && newBalance >= 0) {
                        updateVirtualBalance(newBalance);
                        setEditingBalance(false);
                      }
                    } else if (e.key === 'Escape') {
                      setEditingBalance(false);
                    }
                  }}
                />
                <Button 
                  size="sm" 
                  className="h-8"
                  onClick={() => {
                    const newBalance = parseFloat(balanceInput);
                    if (!isNaN(newBalance) && newBalance >= 0) {
                      updateVirtualBalance(newBalance);
                      setEditingBalance(false);
                    }
                  }}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8"
                  onClick={() => setEditingBalance(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="text-lg font-mono text-primary bg-secondary border border-border rounded px-3 py-2">
                ${virtualBalance.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Click edit to change. Synced across all components.</p>
          </div>

          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm text-muted-foreground">Backtest Period</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Start</span>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-secondary border-border text-sm" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">End</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-secondary border-border text-sm" />
              </div>
            </div>
          </div>

          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-primary">↗</span>
              <h3 className="text-sm text-muted-foreground">Asset</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => (
                <button key={asset} onClick={() => setSelectedAsset(asset)}
                  className={cn('px-3 py-1 rounded text-sm transition-colors', selectedAsset === asset ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
                  {asset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button className="btn-primary gap-2" onClick={handleRunBacktest} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running...' : 'Start Backtest'}
          </Button>
          <Button variant="outline" className="gap-2" onClick={resetBacktest}>
            <RotateCcw className="w-4 h-4" />Reset
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Backtest Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total P&L</span>
                <span className={cn('font-mono text-lg', (currentBacktest?.totalPnl || 0) >= 0 ? 'text-primary' : 'text-destructive')}>
                  {(currentBacktest?.totalPnl || 0) >= 0 ? '+' : ''}${(currentBacktest?.totalPnl || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Trades</span>
                <span className="text-foreground font-mono">{currentBacktest?.totalTrades || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="text-primary font-mono">{(currentBacktest?.winRate || 0).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <span className="text-muted-foreground">Final Balance</span>
                <span className="text-foreground font-mono text-lg">${(currentBacktest?.finalBalance || virtualBalance).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Monthly Breakdown</h3>
            <table className="table-terminal text-sm">
              <thead><tr><th>Period</th><th>P&L</th><th>Trades</th><th>Win Rate</th></tr></thead>
              <tbody>
                {monthlyBreakdown.length > 0 ? monthlyBreakdown.map((month, index) => (
                  <tr key={index}>
                    <td className="text-foreground">{month.period}</td>
                    <td className={cn('font-mono', month.pnl >= 0 ? 'text-primary' : 'text-destructive')}>{month.pnl >= 0 ? '+' : ''}${month.pnl}</td>
                    <td className="text-muted-foreground font-mono">{month.trades}</td>
                    <td className="text-muted-foreground font-mono">{month.winRate}%</td>
                  </tr>
                )) : <tr><td colSpan={4} className="text-center text-muted-foreground py-4">Run a backtest to see results</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
