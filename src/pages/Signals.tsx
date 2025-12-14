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

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (signals.length === 0) {
      generateSignals();
    }
  }, []);

  const getRecommendedExchange = (pair: string): string => {
    const liquidityMap = EXCHANGE_LIQUIDITY[pair] || DEFAULT_LIQUIDITY;
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
        title: 'Trade Executed',
        description: `${signal.direction.toUpperCase()} ${signal.pair} on ${exchange}`,
      });
    }
  };

  const getRiskBadge = (confidence: string) => {
    const riskMap: Record<string, string> = { High: 'LOW', Medium: 'MED', Low: 'HIGH' };
    const risk = riskMap[confidence] || 'MED';
    const classes = { LOW: 'risk-low', MED: 'risk-medium', HIGH: 'risk-high' }[risk];
    return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap', classes)}>{risk}</span>;
  };

  const calculateProfitPotential = (signal: Signal, amount: number, leverage: number) => {
    const profitPercent = signal.direction === 'long'
      ? ((signal.tp2 - signal.entry) / signal.entry) * 100 * leverage
      : ((signal.entry - signal.tp2) / signal.entry) * 100 * leverage;
    const profitUsd = (amount * profitPercent) / 100;
    return { percent: profitPercent, usd: profitUsd };
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">AI Trading Signals</h1>
          <span className="live-indicator text-[10px]">{signals.length} Active</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            Win: <span className="text-primary font-mono">{stats.winRate.toFixed(0)}%</span>
          </span>
          <span className="text-muted-foreground">
            P&L: <span className={cn('font-mono', stats.totalPnL >= 0 ? 'text-primary' : 'text-destructive')}>
              {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(0)}
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={generateSignals} disabled={loading} className="gap-1 h-7 text-xs">
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-2 bg-warning/10 border border-warning/20 rounded mb-3 flex-shrink-0">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        <p className="text-[10px] text-warning">
          <strong>Quick Mode:</strong> 5-min expiry | 5 LONG + 5 SHORT signals | 1.4-2.5% target
        </p>
      </div>

      <div className="flex-1 min-h-0 card-terminal overflow-hidden">
        <ScrollArea className="h-full">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 z-10 bg-secondary/95 backdrop-blur-sm">
              <tr>
                <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Pair</th>
                <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Dir</th>
                <th className="text-left py-1.5 px-1.5 text-muted-foreground font-medium">Exch</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">Entry</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">TP1</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">TP2</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">TP3</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">SL</th>
                <th className="text-center py-1.5 px-1.5 text-muted-foreground font-medium">Amt</th>
                <th className="text-center py-1.5 px-1.5 text-muted-foreground font-medium">Lev</th>
                <th className="text-center py-1.5 px-1.5 text-muted-foreground font-medium">Risk</th>
                <th className="text-right py-1.5 px-1.5 text-muted-foreground font-medium">Profit</th>
                <th className="text-center py-1.5 px-1.5 text-muted-foreground font-medium">Exp</th>
                <th className="text-center py-1.5 px-1.5 text-muted-foreground font-medium">Act</th>
              </tr>
            </thead>
            <tbody>
              {loading && signals.length === 0 ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 14 }).map((_, j) => (
                      <td key={j} className="py-1.5 px-1.5"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-8 text-muted-foreground text-xs">
                    No active signals. Click "Refresh" to generate AI-powered signals.
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
                    <tr key={signal.id} className={cn('hover:bg-secondary/30 border-t border-border/50', isExpired && 'opacity-50')}>
                      <td className="py-1.5 px-1.5 font-medium text-foreground whitespace-nowrap">{signal.pair}</td>
                      <td className="py-1.5 px-1.5">
                        <span className={cn('text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5 w-fit', signal.direction === 'long' ? 'bg-primary/20 text-primary' : 'bg-destructive/20 text-destructive')}>
                          {signal.direction === 'long' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {signal.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5">
                        <Badge variant="outline" className="text-[8px] font-mono px-1 py-0">
                          {recommendedExchange.slice(0, 3)}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-foreground text-right whitespace-nowrap">
                        ${signal.entry >= 1000 ? signal.entry.toLocaleString() : signal.entry.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-primary text-right whitespace-nowrap">
                        ${signal.tp1 >= 1000 ? signal.tp1.toLocaleString() : signal.tp1.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-primary text-right whitespace-nowrap">
                        ${signal.tp2 >= 1000 ? signal.tp2.toLocaleString() : signal.tp2.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-primary text-right whitespace-nowrap">
                        ${signal.tp3 >= 1000 ? signal.tp3.toLocaleString() : signal.tp3.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-destructive text-right whitespace-nowrap">
                        ${signal.sl >= 1000 ? signal.sl.toLocaleString() : signal.sl.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) => handleAmountChange(signal.id, Number(e.target.value))}
                          className="w-12 h-5 text-[9px] font-mono bg-secondary border-border text-center px-0.5"
                          min={10}
                        />
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <Input
                          type="number"
                          value={leverage}
                          onChange={(e) => handleLeverageChange(signal.id, Number(e.target.value))}
                          className="w-10 h-5 text-[9px] font-mono bg-secondary border-border text-center px-0.5"
                          min={1}
                          max={100}
                        />
                      </td>
                      <td className="py-1.5 px-1.5 text-center">{getRiskBadge(signal.confidence)}</td>
                      <td className="py-1.5 px-1.5 text-right">
                        <span className="font-mono text-primary whitespace-nowrap">+{profit.percent.toFixed(1)}%</span>
                        <br />
                        <span className="text-[8px] text-muted-foreground">${profit.usd.toFixed(0)}</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <span className={cn('flex items-center justify-center gap-0.5 font-mono whitespace-nowrap', isExpired ? 'text-destructive' : 'text-warning')}>
                          <Clock className="w-2.5 h-2.5" />
                          {timeRemaining}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <Button
                          size="sm"
                          className="btn-primary h-5 px-2 text-[9px]"
                          disabled={isExpired || executing}
                          onClick={() => handleTrade(signal)}
                        >
                          Trade
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {signals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3 flex-shrink-0">
          <div className="card-terminal p-3">
            <h3 className="font-semibold text-foreground text-xs mb-2">Signal Breakdown</h3>
            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Long</span>
                <span className="text-primary font-mono">{signals.filter(s => s.direction === 'long').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Short</span>
                <span className="text-destructive font-mono">{signals.filter(s => s.direction === 'short').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">High Conf</span>
                <span className="font-mono">{signals.filter(s => s.confidence === 'High').length}</span>
              </div>
            </div>
          </div>
          <div className="card-terminal p-3">
            <h3 className="font-semibold text-foreground text-xs mb-2">AI Analysis</h3>
            <p className="text-[10px] text-muted-foreground line-clamp-3">
              {signals[0]?.reasoning || 'Analyzing market conditions...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
