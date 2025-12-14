import { useState, useEffect } from 'react';
import { useBacktest } from '@/hooks/useBacktest';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useAuth } from '@/hooks/useAuth';
import { usePaperTestHistory } from '@/hooks/usePaperTestHistory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FlaskConical, Play, RotateCcw, Calendar, Loader2, Pencil, Check, X, DollarSign, Trash2, Beaker, SlidersHorizontal, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES } from '@/lib/exchangeConfig';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { runPaperTradingTest } from '@/lib/sandbox/paperTradingTest';
import { PaperTestResult, ThresholdConfig, DEFAULT_THRESHOLDS } from '@/lib/sandbox/types';
import { HitRateDashboardWidget } from '@/components/sandbox/HitRateDashboardWidget';
import { PaperTestHistory } from '@/components/sandbox/PaperTestHistory';
import { PaperTestAIAnalysis } from '@/components/sandbox/PaperTestAIAnalysis';

const assets = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'AVAX/USDT'];

export default function Sandbox() {
  const { currentBacktest, monthlyBreakdown, running, runBacktest, resetBacktest } = useBacktest();
  const { virtualBalance, resetTrigger, updateVirtualBalance, resetDemo } = useTradingMode();
  const { user } = useAuth();
  const { saveTestResult } = usePaperTestHistory();
  
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(virtualBalance));
  const [selectedAsset, setSelectedAsset] = useState('BTC/USDT');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-06-30');
  const [resettingAll, setResettingAll] = useState(false);
  
  // Paper test state
  const [runningPaperTest, setRunningPaperTest] = useState(false);
  const [paperTestResult, setPaperTestResult] = useState<PaperTestResult | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);

  useEffect(() => {
    if (resetTrigger > 0) {
      resetBacktest();
    }
  }, [resetTrigger, resetBacktest]);

  const handleRunBacktest = () => {
    runBacktest(selectedAsset, startDate, endDate, virtualBalance);
  };

  const handleRunPaperTest = async () => {
    setRunningPaperTest(true);
    try {
      const result = await runPaperTradingTest(100, thresholds);
      setPaperTestResult(result);
      
      // Save to history
      await saveTestResult(result, thresholds, 100);
      
      if (result.passed) {
        toast.success('Paper Test PASSED', { description: `Hit rate: ${result.hitRate.toFixed(1)}% (${result.wins}W/${result.losses}L)` });
      } else {
        toast.error('Paper Test FAILED', { description: `Hit rate: ${result.hitRate.toFixed(1)}% (target: 80%)` });
      }
    } catch (err) {
      console.error('Paper test failed:', err);
      toast.error('Test failed', { description: 'Could not complete paper test' });
    } finally {
      setRunningPaperTest(false);
    }
  };

  const handleApplyThresholds = (newThresholds: ThresholdConfig) => {
    setThresholds(newThresholds);
    toast.success('Thresholds Updated', { description: 'Run another test to verify improvement' });
  };

  const handleResetAllDemoData = async () => {
    if (!user) {
      toast.error('Not authenticated');
      return;
    }
    setResettingAll(true);
    try {
      await resetDemo(user.id);
      resetBacktest();
      setPaperTestResult(null);
      toast.success('Demo Data Reset Complete', { description: 'Virtual balance reset to $1,000.' });
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error('Reset failed');
    } finally {
      setResettingAll(false);
    }
  };

  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-6 pr-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">Sandbox / Paper Testing</h1>
            <span className="bg-secondary text-muted-foreground text-xs px-2 py-1 rounded">
              {running ? 'Running...' : currentBacktest ? 'Completed' : 'Ready'}
            </span>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2" disabled={resettingAll}>
                {resettingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Reset All Demo Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset All Demo Data?</AlertDialogTitle>
                <AlertDialogDescription>This will delete all sandbox trades, bot runs, and backtest results.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAllDemoData} className="bg-destructive text-destructive-foreground">Reset Everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Hit Rate Widget + Paper Test Button */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <HitRateDashboardWidget className="lg:col-span-1" targetHitRate={thresholds.targetHitRate} />
          
          <div className="card-terminal p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Beaker className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Paper Trading Test</h3>
              </div>
              <Button onClick={handleRunPaperTest} disabled={runningPaperTest} className="gap-2">
                {runningPaperTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Paper Test (100 trades)
              </Button>
            </div>
            
            {paperTestResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant={paperTestResult.passed ? "default" : "destructive"} className="text-sm px-3 py-1">
                    {paperTestResult.passed ? 'PASSED ✓' : 'FAILED ✗'}
                  </Badge>
                  <span className={cn("text-2xl font-bold font-mono", paperTestResult.passed ? "text-primary" : "text-destructive")}>
                    {paperTestResult.hitRate.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground">hit rate</span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Wins/Losses:</span> <span className="font-mono">{paperTestResult.wins}/{paperTestResult.losses}</span></div>
                  <div><span className="text-muted-foreground">P&L:</span> <span className={cn("font-mono", paperTestResult.totalPnL >= 0 ? "text-primary" : "text-destructive")}>${paperTestResult.totalPnL.toFixed(2)}</span></div>
                  <div><span className="text-muted-foreground">Avg Score:</span> <span className="font-mono">{paperTestResult.avgSignalScore.toFixed(0)}%</span></div>
                  <div><span className="text-muted-foreground">Skipped:</span> <span className="font-mono">{paperTestResult.tradesSkipped}</span></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Signal Threshold Configuration */}
        <div className="card-terminal p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">Signal Thresholds</h3>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setThresholds({ minSignalScore: 0.80, minConfluence: 2, minVolumeRatio: 1.0, targetHitRate: 75 })}
                className="text-xs"
              >
                Conservative
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setThresholds({ minSignalScore: 0.85, minConfluence: 2, minVolumeRatio: 1.2, targetHitRate: 80 })}
                className="text-xs"
              >
                Balanced
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setThresholds({ minSignalScore: 0.90, minConfluence: 3, minVolumeRatio: 1.4, targetHitRate: 90 })}
                className="text-xs"
              >
                Aggressive
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Target Hit Rate */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Target Hit Rate
                </Label>
                <span className="font-mono text-sm text-primary font-bold">{thresholds.targetHitRate}%</span>
              </div>
              <Slider
                value={[thresholds.targetHitRate]}
                onValueChange={([value]) => setThresholds(prev => ({ ...prev, targetHitRate: value }))}
                min={70}
                max={99}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>70%</span>
                <span>85%</span>
                <span>99%</span>
              </div>
            </div>
            
            {/* Min Signal Score */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Min Signal Score</Label>
                <span className="font-mono text-sm text-primary">{Math.round(thresholds.minSignalScore * 100)}%</span>
              </div>
              <Slider
                value={[thresholds.minSignalScore * 100]}
                onValueChange={([value]) => setThresholds(prev => ({ ...prev, minSignalScore: value / 100 }))}
                min={70}
                max={98}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>70%</span>
                <span>84%</span>
                <span>98%</span>
              </div>
            </div>
            
            {/* Min Confluence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Min Confluence</Label>
                <span className="font-mono text-sm text-primary">{thresholds.minConfluence} indicators</span>
              </div>
              <Slider
                value={[thresholds.minConfluence]}
                onValueChange={([value]) => setThresholds(prev => ({ ...prev, minConfluence: value }))}
                min={1}
                max={4}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
              </div>
            </div>
            
            {/* Min Volume Ratio */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Min Volume Ratio</Label>
                <span className="font-mono text-sm text-primary">{thresholds.minVolumeRatio.toFixed(1)}x</span>
              </div>
              <Slider
                value={[thresholds.minVolumeRatio * 10]}
                onValueChange={([value]) => setThresholds(prev => ({ ...prev, minVolumeRatio: value / 10 }))}
                min={10}
                max={25}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>1.0x</span>
                <span>1.8x</span>
                <span>2.5x</span>
              </div>
            </div>
          </div>
        </div>

        {/* History + AI Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PaperTestHistory />
          <PaperTestAIAnalysis testResult={paperTestResult} currentThresholds={thresholds} onApplyThresholds={handleApplyThresholds} />
        </div>

        {/* Exchange Allocation */}
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm text-muted-foreground">Virtual USDT Allocation by Exchange</h3>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {EXCHANGE_CONFIGS.map((config) => {
              const allocation = EXCHANGE_ALLOCATION_PERCENTAGES[config.confidence];
              const amount = Math.round(virtualBalance * allocation);
              return (
                <div key={config.name} className="flex flex-col items-center p-2 rounded bg-secondary/50">
                  <span className="text-[10px] text-foreground">{config.name}</span>
                  <span className="font-mono text-xs font-bold text-primary">${amount.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Backtest Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-primary">$</span>
              <h3 className="text-sm text-muted-foreground">Virtual Balance</h3>
              {!editingBalance && <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => { setBalanceInput(String(virtualBalance)); setEditingBalance(true); }}><Pencil className="w-3 h-3" /></Button>}
            </div>
            {editingBalance ? (
              <div className="flex items-center gap-2">
                <Input type="number" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} className="flex-1 bg-secondary border-border text-lg font-mono" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseFloat(balanceInput); if (!isNaN(n) && n >= 0) { updateVirtualBalance(n); setEditingBalance(false); } } else if (e.key === 'Escape') setEditingBalance(false); }} />
                <Button size="sm" onClick={() => { const n = parseFloat(balanceInput); if (!isNaN(n) && n >= 0) { updateVirtualBalance(n); setEditingBalance(false); } }}><Check className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingBalance(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="text-lg font-mono text-primary bg-secondary border border-border rounded px-3 py-2">${virtualBalance.toLocaleString()}</div>
            )}
          </div>

          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-muted-foreground" /><h3 className="text-sm text-muted-foreground">Backtest Period</h3></div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-xs text-muted-foreground block mb-1">Start</span><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-secondary border-border text-sm" /></div>
              <div><span className="text-xs text-muted-foreground block mb-1">End</span><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-secondary border-border text-sm" /></div>
            </div>
          </div>

          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-3"><span className="text-primary">↗</span><h3 className="text-sm text-muted-foreground">Asset</h3></div>
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => (<button key={asset} onClick={() => setSelectedAsset(asset)} className={cn('px-3 py-1 rounded text-sm transition-colors', selectedAsset === asset ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>{asset}</button>))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button className="btn-primary gap-2" onClick={handleRunBacktest} disabled={running}>{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}{running ? 'Running...' : 'Start Backtest'}</Button>
          <Button variant="outline" className="gap-2" onClick={resetBacktest}><RotateCcw className="w-4 h-4" />Reset</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Backtest Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Total P&L</span><span className={cn('font-mono text-lg', (currentBacktest?.totalPnl || 0) >= 0 ? 'text-primary' : 'text-destructive')}>{(currentBacktest?.totalPnl || 0) >= 0 ? '+' : ''}${(currentBacktest?.totalPnl || 0).toLocaleString()}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Total Trades</span><span className="text-foreground font-mono">{currentBacktest?.totalTrades || 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Win Rate</span><span className="text-primary font-mono">{(currentBacktest?.winRate || 0).toFixed(1)}%</span></div>
              <div className="flex items-center justify-between pt-3 border-t border-border"><span className="text-muted-foreground">Final Balance</span><span className="text-foreground font-mono text-lg">${(currentBacktest?.finalBalance || virtualBalance).toLocaleString()}</span></div>
            </div>
          </div>

          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground mb-4">Monthly Breakdown</h3>
            <table className="table-terminal text-sm"><thead><tr><th>Period</th><th>P&L</th><th>Trades</th><th>Win Rate</th></tr></thead>
            <tbody>{monthlyBreakdown.length > 0 ? monthlyBreakdown.map((month, i) => (<tr key={i}><td>{month.period}</td><td className={cn('font-mono', month.pnl >= 0 ? 'text-primary' : 'text-destructive')}>{month.pnl >= 0 ? '+' : ''}${month.pnl}</td><td className="font-mono">{month.trades}</td><td className="font-mono">{month.winRate}%</td></tr>)) : <tr><td colSpan={4} className="text-center text-muted-foreground py-4">Run a backtest to see results</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
