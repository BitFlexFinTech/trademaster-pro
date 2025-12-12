import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, Clock, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAISignals, Signal } from '@/hooks/useAISignals';
import { useTrades } from '@/hooks/useTrades';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExchangeConnection {
  exchange_name: string;
  is_connected: boolean;
}

// Exchange liquidity scores for pair matching
const EXCHANGE_LIQUIDITY: Record<string, Record<string, number>> = {
  'BTC/USDT': { Binance: 100, OKX: 90, Bybit: 85, Kraken: 70, KuCoin: 65 },
  'ETH/USDT': { Binance: 100, OKX: 88, Bybit: 82, Kraken: 75, KuCoin: 68 },
  'SOL/USDT': { Binance: 95, OKX: 85, Bybit: 90, KuCoin: 70, Kraken: 50 },
  'XRP/USDT': { Binance: 90, OKX: 85, Bybit: 80, Kraken: 75, KuCoin: 72 },
  'DOGE/USDT': { Binance: 92, OKX: 80, Bybit: 85, KuCoin: 65, Kraken: 55 },
  'AVAX/USDT': { Binance: 88, OKX: 82, Bybit: 78, KuCoin: 60, Kraken: 58 },
  'LINK/USDT': { Binance: 90, OKX: 84, Bybit: 76, Kraken: 70, KuCoin: 62 },
  'ADA/USDT': { Binance: 88, OKX: 80, Bybit: 75, Kraken: 72, KuCoin: 65 },
  'MATIC/USDT': { Binance: 85, OKX: 78, Bybit: 72, KuCoin: 60, Kraken: 55 },
  'DOT/USDT': { Binance: 86, OKX: 79, Bybit: 74, Kraken: 68, KuCoin: 58 },
};

const DEFAULT_LIQUIDITY = { Binance: 80, OKX: 70, Bybit: 65, Kraken: 55, KuCoin: 50 };

export default function Signals() {
  const { signals, loading, generateSignals, getTimeRemaining } = useAISignals();
  const { executeTrade, executing, stats } = useTrades();
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [leverages, setLeverages] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  const [connectedExchanges, setConnectedExchanges] = useState<string[]>([]);

  // Fetch connected exchanges
  useEffect(() => {
    const fetchConnections = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected')
        .eq('user_id', user.id)
        .eq('is_connected', true);

      if (data) {
        setConnectedExchanges(data.map(c => c.exchange_name));
      }
    };
    fetchConnections();
  }, []);

  // Force re-render every second to update countdown timers
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Generate signals on mount
  useEffect(() => {
    if (signals.length === 0) {
      generateSignals();
    }
  }, []);

  const getRecommendedExchange = (pair: string): string => {
    const liquidityMap = EXCHANGE_LIQUIDITY[pair] || DEFAULT_LIQUIDITY;
    
    // Filter to only connected exchanges and sort by liquidity
    const available = connectedExchanges
      .map(ex => ({ name: ex, score: liquidityMap[ex] || 0 }))
      .sort((a, b) => b.score - a.score);
    
    return available[0]?.name || 'Binance';
  };

  const handleAmountChange = (id: string, amount: number) => {
    setAmounts(prev => ({ ...prev, [id]: amount }));
  };

  const handleLeverageChange = (id: string, leverage: number) => {
    setLeverages(prev => ({ ...prev, [id]: Math.min(Math.max(1, leverage), 100) }));
  };

  const handleTrade = async (signal: Signal) => {
    const amount = amounts[signal.id] || 100;
    const leverage = leverages[signal.id] || 1;
    const exchange = getRecommendedExchange(signal.pair);

    const trade = await executeTrade({
      pair: signal.pair,
      direction: signal.direction,
      entryPrice: signal.entry,
      amount,
      leverage,
      stopLoss: signal.sl,
      takeProfit1: signal.tp1,
      takeProfit2: signal.tp2,
      takeProfit3: signal.tp3,
      isSandbox: false,
      exchangeName: exchange,
    });

    if (trade) {
      toast({
        title: '🚀 Trade Executed',
        description: `${signal.direction.toUpperCase()} ${signal.pair} on ${exchange} at $${signal.entry.toFixed(2)}`,
      });
    }
  };

  const getRiskBadge = (confidence: string) => {
    const riskMap: Record<string, string> = {
      High: 'LOW',
      Medium: 'MEDIUM',
      Low: 'HIGH',
    };
    const risk = riskMap[confidence] || 'MEDIUM';
    const classes = {
      LOW: 'risk-low',
      MEDIUM: 'risk-medium',
      HIGH: 'risk-high',
    }[risk];
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded font-medium', classes)}>
        ○ {risk}
      </span>
    );
  };

  const calculateProfitPotential = (signal: Signal, amount: number, leverage: number) => {
    const profitPercent = signal.direction === 'long'
      ? ((signal.tp2 - signal.entry) / signal.entry) * 100 * leverage
      : ((signal.entry - signal.tp2) / signal.entry) * 100 * leverage;
    const profitUsd = (amount * profitPercent) / 100;
    return { percent: profitPercent, usd: profitUsd };
  };

  return (
    <div className="min-h-0 flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">AI Trading Signals</h1>
          <span className="live-indicator">{signals.length} Active</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Win Rate: <span className="text-primary font-mono">{stats.winRate.toFixed(1)}%</span>
          </span>
          <span className="text-muted-foreground">
            Total P&L: <span className={cn('font-mono', stats.totalPnL >= 0 ? 'text-primary' : 'text-destructive')}>
              {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={generateSignals}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Generate New
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg mb-4">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
        <p className="text-sm text-warning">
          <strong>Quick Execution Mode:</strong> Signals expire in 5 minutes. AI generates 5 LONG and 5 SHORT signals targeting 1.4-2.5% profit per trade.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="card-terminal overflow-x-auto">
            <table className="table-terminal">
              <thead>
                <tr className="bg-secondary/50">
                  <th>Pair</th>
                  <th>Direction</th>
                  <th>Exchange</th>
                  <th>Entry</th>
                  <th>TP1</th>
                  <th>TP2</th>
                  <th>TP3</th>
                  <th>SL</th>
                  <th>Amount</th>
                  <th>Leverage</th>
                  <th>Risk</th>
                  <th>Profit</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && signals.length === 0 ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 14 }).map((_, j) => (
                        <td key={j}><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : signals.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="text-center py-8 text-muted-foreground">
                      No active signals. Click "Generate New" to create AI-powered trading signals.
                    </td>
                  </tr>
                ) : (
                  signals.map((signal) => {
                    const amount = amounts[signal.id] || 100;
                    const leverage = leverages[signal.id] || 1;
                    const profit = calculateProfitPotential(signal, amount, leverage);
                    const timeRemaining = getTimeRemaining(signal.expiresAt);
                    const isExpired = timeRemaining === 'Expired';
                    const recommendedExchange = getRecommendedExchange(signal.pair);

                    return (
                      <tr key={signal.id} className={cn('hover:bg-secondary/30', isExpired && 'opacity-50')}>
                        <td className="font-medium text-foreground">{signal.pair}</td>
                        <td>
                          <span className={signal.direction === 'long' ? 'badge-long' : 'badge-short'}>
                            {signal.direction === 'long' ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {signal.direction.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {recommendedExchange}
                          </Badge>
                        </td>
                        <td className="font-mono text-foreground">
                          ${signal.entry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="font-mono text-primary">
                          ${signal.tp1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="font-mono text-primary">
                          ${signal.tp2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="font-mono text-primary">
                          ${signal.tp3.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="font-mono text-destructive">
                          ${signal.sl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>
                          <Input
                            type="number"
                            value={amount}
                            onChange={(e) => handleAmountChange(signal.id, Number(e.target.value))}
                            className="w-20 h-8 text-sm font-mono bg-secondary border-border"
                            min={10}
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            value={leverage}
                            onChange={(e) => handleLeverageChange(signal.id, Number(e.target.value))}
                            className="w-16 h-8 text-sm font-mono bg-secondary border-border"
                            min={1}
                            max={100}
                          />
                        </td>
                        <td>{getRiskBadge(signal.confidence)}</td>
                        <td className="font-mono text-primary">
                          +{profit.percent.toFixed(1)}%<br />
                          <span className="text-xs text-muted-foreground">${profit.usd.toFixed(2)}</span>
                        </td>
                        <td>
                          <span className={cn(
                            'flex items-center gap-1 font-mono',
                            isExpired ? 'text-destructive' : 'text-warning'
                          )}>
                            <Clock className="w-3 h-3" />
                            {timeRemaining}
                          </span>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            className="btn-primary h-7 px-4"
                            disabled={isExpired || executing}
                            onClick={() => handleTrade(signal)}
                          >
                            {executing ? '...' : 'Trade'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Signal Analysis */}
          {signals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="card-terminal p-4">
                <h3 className="font-semibold text-foreground mb-3">Signal Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Long Signals</span>
                    <span className="text-primary font-mono">{signals.filter(s => s.direction === 'long').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Short Signals</span>
                    <span className="text-destructive font-mono">{signals.filter(s => s.direction === 'short').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">High Confidence</span>
                    <span className="font-mono">{signals.filter(s => s.confidence === 'High').length}</span>
                  </div>
                </div>
              </div>
              <div className="card-terminal p-4">
                <h3 className="font-semibold text-foreground mb-3">AI Analysis Summary</h3>
                <p className="text-sm text-muted-foreground">
                  {signals[0]?.reasoning || 'AI is analyzing current market conditions...'}
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}