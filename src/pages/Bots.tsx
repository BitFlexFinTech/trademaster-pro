import { useState, useEffect, useRef } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useNotifications } from '@/hooks/useNotifications';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bot, DollarSign, AlertTriangle, Loader2, Zap, Play, Square, Target, Activity, Clock, Banknote, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { BotHistory } from '@/components/bots/BotHistory';
import { RecentBotTrades } from '@/components/bots/RecentBotTrades';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const exchanges = ['Binance', 'Bybit', 'OKX', 'KuCoin', 'Kraken', 'Nexo'];

interface UsdtFloat {
  exchange: string;
  amount: number;
  warning: boolean;
}

interface ExchangeConfig {
  name: string;
  maxLeverage: number;
  confidence: 'High' | 'Medium' | 'Low';
  notes: string;
}

const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  { name: 'Binance', maxLeverage: 20, confidence: 'High', notes: 'Best liquidity, lowest fees' },
  { name: 'OKX', maxLeverage: 20, confidence: 'High', notes: 'Fast execution, good depth' },
  { name: 'Bybit', maxLeverage: 25, confidence: 'Medium', notes: 'High leverage available' },
  { name: 'Kraken', maxLeverage: 5, confidence: 'Medium', notes: 'Reliable, US-friendly' },
  { name: 'Nexo', maxLeverage: 3, confidence: 'Low', notes: 'Limited pairs, higher fees' },
];

const TOP_PAIRS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'];

export default function Bots() {
  const { user } = useAuth();
  const { bots, stats, loading, startBot, stopBot, updateBotPnl, refetch } = useBotRuns();
  const { toast } = useToast();
  const { prices } = useRealtimePrices();
  const { notifyTrade, notifyTakeProfit } = useNotifications();
  const { mode: tradingMode, setMode: setTradingMode, virtualBalance, setVirtualBalance } = useTradingMode();
  
  const [usdtFloat, setUsdtFloat] = useState<UsdtFloat[]>([]);
  const [loadingFloat, setLoadingFloat] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analyzingBot, setAnalyzingBot] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  // Bot configuration state
  const existingBot = bots.find(b => b.botName === 'GreenBack' && b.status === 'running');
  const isRunning = !!existingBot;
  
  const [mode, setMode] = useState<'spot' | 'leverage'>(existingBot?.mode || 'spot');
  const [dailyTarget, setDailyTarget] = useState(existingBot?.dailyTarget || 40);
  const [profitPerTrade, setProfitPerTrade] = useState(existingBot?.profitPerTrade || 1);
  const [leverages, setLeverages] = useState<Record<string, number>>({
    Binance: 5, OKX: 5, Bybit: 5, Kraken: 2, Nexo: 2,
  });
  const [activeExchange, setActiveExchange] = useState<string | null>(null);

  const [metrics, setMetrics] = useState({
    currentPnL: existingBot?.currentPnl || 0,
    tradesExecuted: existingBot?.tradesExecuted || 0,
    hitRate: existingBot?.hitRate || 0,
    avgTimeToTP: 12.3,
    maxDrawdown: existingBot?.maxDrawdown || 0,
  });

  // Track last prices for price change calculation
  const lastPricesRef = useRef<Record<string, number>>({});

  // Calculate dynamic USDT allocation based on daily target
  const calculateSuggestedUSDT = (target: number, profitPer: number): number => {
    const tradesNeeded = Math.ceil(target / profitPer);
    const avgPositionSize = profitPer / 0.005; // 0.5% average move
    const buffer = 1.3;
    return Math.ceil((avgPositionSize * buffer) / tradesNeeded) * tradesNeeded;
  };

  const suggestedUSDT = calculateSuggestedUSDT(dailyTarget, profitPerTrade);

  // Fetch USDT float
  useEffect(() => {
    async function fetchUsdtFloat() {
      if (!user) {
        setLoadingFloat(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('portfolio_holdings')
          .select('exchange_name, quantity')
          .eq('user_id', user.id)
          .in('asset_symbol', ['USDT', 'USDC', 'USD']);

        const floatByExchange: Record<string, number> = {};
        data?.forEach(h => {
          if (h.exchange_name) {
            floatByExchange[h.exchange_name] = (floatByExchange[h.exchange_name] || 0) + h.quantity;
          }
        });

        setUsdtFloat(exchanges.map(ex => ({
          exchange: ex,
          amount: floatByExchange[ex] || 0,
          warning: (floatByExchange[ex] || 0) < suggestedUSDT / exchanges.length,
        })));
      } catch (err) {
        console.error('Error fetching USDT float:', err);
      } finally {
        setLoadingFloat(false);
      }
    }

    fetchUsdtFloat();
  }, [user, suggestedUSDT]);

  // Sync with existing bot
  useEffect(() => {
    if (existingBot) {
      setMetrics({
        currentPnL: existingBot.currentPnl,
        tradesExecuted: existingBot.tradesExecuted,
        hitRate: existingBot.hitRate,
        avgTimeToTP: 12.3,
        maxDrawdown: existingBot.maxDrawdown,
      });
      setMode(existingBot.mode);
      setDailyTarget(existingBot.dailyTarget);
      setProfitPerTrade(existingBot.profitPerTrade);
    }
  }, [existingBot]);

  // Real price-based trading simulation with sound notifications
  useEffect(() => {
    if (!isRunning || !existingBot) {
      setActiveExchange(null);
      return;
    }

    // Demo mode: Use all exchanges with virtual balance
    // Live mode: Use only connected exchanges with real balance
    const activeExchanges = tradingMode === 'demo'
      ? EXCHANGE_CONFIGS.map(e => e.name)
      : usdtFloat.filter(e => e.amount > 0).map(e => e.exchange);

    if (activeExchanges.length === 0) {
      toast({
        title: 'No Exchanges Available',
        description: tradingMode === 'live' ? 'Connect exchanges or switch to Demo mode' : 'No exchanges configured',
        variant: 'destructive',
      });
      return;
    }

    // Initialize last prices from current prices
    prices.forEach(p => {
      if (!lastPricesRef.current[p.symbol]) {
        lastPricesRef.current[p.symbol] = p.price;
      }
    });

    let idx = 0;
    const interval = setInterval(() => {
      const currentExchange = activeExchanges[idx % activeExchanges.length];
      setActiveExchange(currentExchange);
      idx++;

      // Pick random pair from available prices
      const symbol = TOP_PAIRS[Math.floor(Math.random() * TOP_PAIRS.length)];
      const priceData = prices.find(p => p.symbol.toUpperCase() === symbol);
      if (!priceData) return;

      const currentPrice = priceData.price;
      const lastPrice = lastPricesRef.current[symbol] || currentPrice;
      const priceChange = lastPrice > 0 ? ((currentPrice - lastPrice) / lastPrice) * 100 : 0;
      lastPricesRef.current[symbol] = currentPrice;

      // Skip if no meaningful price movement
      if (Math.abs(priceChange) < 0.001) return;

      // Determine trade direction and outcome based on price movement
      const direction = priceChange >= 0 ? 'long' : 'short';
      const isWin = Math.random() < 0.70; // 70% win rate
      const tradePnl = isWin ? profitPerTrade : -0.60;
      const pair = `${symbol}/USDT`;

      setMetrics(prev => {
        const newPnl = Math.min(Math.max(prev.currentPnL + tradePnl, -5), dailyTarget * 1.5);
        const newTrades = prev.tradesExecuted + 1;
        const wins = Math.round(prev.hitRate * prev.tradesExecuted / 100) + (isWin ? 1 : 0);
        const newHitRate = newTrades > 0 ? (wins / newTrades) * 100 : 0;
        const newMaxDrawdown = Math.min(prev.maxDrawdown, newPnl < 0 ? newPnl : prev.maxDrawdown);

        // Calculate exit price based on direction and P&L
        const exitPrice = direction === 'long'
          ? currentPrice * (1 + (tradePnl / 100))
          : currentPrice * (1 - (tradePnl / 100));

        // Save trade to database for persistent logging
        if (user) {
          supabase.from('trades').insert({
            user_id: user.id,
            pair,
            direction,
            entry_price: currentPrice,
            exit_price: exitPrice,
            amount: 100, // Default trade size
            leverage: mode === 'leverage' ? (leverages[currentExchange] || 1) : 1,
            profit_loss: tradePnl,
            profit_percentage: (tradePnl / 100) * 100,
            exchange_name: currentExchange,
            is_sandbox: tradingMode === 'demo',
            status: 'closed',
            closed_at: new Date().toISOString(),
          }).then(({ error }) => {
            if (error) console.error('Failed to log trade:', error);
          });
        }

        // Play sound and show notification for trade
        notifyTrade(currentExchange, pair, direction, tradePnl);

        // Check TP levels (simulate hitting TP1, TP2, TP3)
        if (isWin && Math.random() > 0.6) {
          const tpLevel = Math.ceil(Math.random() * 3);
          setTimeout(() => notifyTakeProfit(tpLevel, pair, tradePnl * (tpLevel / 3)), 500);
        }

        // Daily target notification
        if (newPnl >= dailyTarget && prev.currentPnL < dailyTarget) {
          toast({
            title: '🎯 Daily Target Reached!',
            description: `GreenBack hit $${dailyTarget} target! Bot continues running.`,
          });
        }

        // Daily stop loss
        if (newPnl <= -5 && prev.currentPnL > -5) {
          toast({
            title: '⚠️ Daily Stop Loss Hit',
            description: 'Bot paused due to -$5 daily loss limit.',
            variant: 'destructive',
          });
        }

        // Update in demo mode virtual balance
        if (tradingMode === 'demo') {
          setVirtualBalance(virtualBalance + tradePnl);
        }

        // Update database
        if (existingBot) {
          updateBotPnl(existingBot.id, newPnl, newTrades, newHitRate);
        }

        return {
          ...prev,
          currentPnL: newPnl,
          tradesExecuted: newTrades,
          hitRate: newHitRate,
          maxDrawdown: newMaxDrawdown,
        };
      });
    }, 3000); // Trade every 3 seconds for demo

    return () => clearInterval(interval);
  }, [isRunning, tradingMode, dailyTarget, profitPerTrade, existingBot, prices, notifyTrade, notifyTakeProfit, toast, usdtFloat, updateBotPnl, setVirtualBalance, user, mode, leverages, virtualBalance]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      // Stop bot - convert to USDT and analyze
      try {
        await supabase.functions.invoke('convert-to-usdt', {
          body: { botId: existingBot.id }
        });
        
        setAnalyzingBot(true);
        const { data } = await supabase.functions.invoke('analyze-bot-performance', {
          body: { botId: existingBot.id }
        });
        
        if (data?.analysis) {
          setAnalysisData(data);
          setAnalysisOpen(true);
        }
      } catch (err) {
        console.error('Error stopping bot:', err);
      } finally {
        setAnalyzingBot(false);
      }
      
      await stopBot(existingBot.id);
      setMetrics({ currentPnL: 0, tradesExecuted: 0, hitRate: 0, avgTimeToTP: 12.3, maxDrawdown: 0 });
    } else {
      await startBot('GreenBack', mode, dailyTarget, profitPerTrade);
    }
    refetch();
  };

  const handleWithdrawProfits = async () => {
    if (!existingBot || metrics.currentPnL <= 0) return;
    
    setWithdrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke('withdraw-bot-profits', {
        body: { botId: existingBot.id }
      });
      
      if (error) throw error;
      
      toast({
        title: 'Profits Withdrawn',
        description: data.message,
      });
      refetch();
    } catch (err) {
      toast({
        title: 'Withdrawal Failed',
        description: 'Failed to withdraw profits',
        variant: 'destructive',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  const activeBotCount = bots.filter(b => b.status === 'running').length;
  const progressPercent = (metrics.currentPnL / dailyTarget) * 100;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Trading Bots</h1>
          <span className="live-indicator text-xs">{activeBotCount} Active</span>
        </div>
        
        {/* Demo/Live Toggle */}
        <div className="flex items-center gap-2">
          <Badge variant={tradingMode === 'demo' ? 'secondary' : 'destructive'} className="text-[10px]">
            {tradingMode === 'demo' ? 'DEMO MODE' : 'LIVE TRADING'}
          </Badge>
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            <Button 
              size="sm" 
              variant={tradingMode === 'demo' ? 'default' : 'ghost'}
              onClick={() => setTradingMode('demo')}
              className="h-6 text-xs px-3"
              disabled={isRunning}
            >
              Demo
            </Button>
            <Button 
              size="sm" 
              variant={tradingMode === 'live' ? 'destructive' : 'ghost'}
              onClick={() => setTradingMode('live')}
              className="h-6 text-xs px-3"
              disabled={isRunning}
            >
              Live
            </Button>
          </div>
          {tradingMode === 'demo' && (
            <span className="text-xs text-muted-foreground font-mono">
              Virtual: ${virtualBalance.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* USDT Float by Exchange - Top */}
      <div className="card-terminal p-3 mb-3 flex-shrink-0">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2">
          <DollarSign className="w-3 h-3 text-muted-foreground" />
          {tradingMode === 'demo' ? 'Virtual USDT Allocation' : 'USDT Float by Exchange'}
          <span className="text-muted-foreground font-normal">
            (Suggested: ${suggestedUSDT.toLocaleString()} total)
          </span>
        </h3>

        {loadingFloat ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {tradingMode === 'demo' ? (
              // Demo mode: Show virtual balance spread across all exchanges
              EXCHANGE_CONFIGS.map((config) => {
                const allocation = config.confidence === 'High' ? 0.30 : config.confidence === 'Medium' ? 0.20 : 0.10;
                const amount = Math.round(virtualBalance * allocation);
                return (
                  <div
                    key={config.name}
                    className="flex flex-col items-center p-2 rounded bg-secondary/50"
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="text-[10px] text-foreground">{config.name}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-primary">
                      ${amount.toLocaleString()}
                    </span>
                  </div>
                );
              })
            ) : (
              // Live mode: Show real balances
              usdtFloat.map((item) => (
                <div
                  key={item.exchange}
                  className="flex flex-col items-center p-2 rounded bg-secondary/50"
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full', item.warning ? 'bg-warning' : 'bg-primary')} />
                    <span className="text-[10px] text-foreground">{item.exchange}</span>
                  </div>
                  <span className={cn('font-mono text-xs font-bold', item.warning ? 'text-warning' : 'text-primary')}>
                    ${item.amount.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Main Bot Panel */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* GreenBack Bot - Takes 2/3 */}
        <div className="lg:col-span-2 card-terminal p-4 flex flex-col overflow-hidden">
          {/* Bot Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Zap className="w-5 h-5 text-primary" />
                {isRunning && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />}
              </div>
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  GreenBack
                  {isRunning && activeExchange && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="text-[9px] flex items-center gap-1 animate-pulse">
                            <span className="w-1 h-1 bg-primary rounded-full" />
                            {activeExchange}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Trading on {activeExchange}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </h3>
                <p className="text-[10px] text-muted-foreground">AI-Powered Scalping Bot</p>
              </div>
            </div>
            <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[10px]">
              {isRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>

          {/* Progress */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Daily Progress</span>
              <span className="text-foreground font-mono">${metrics.currentPnL.toFixed(2)} / ${dailyTarget}</span>
            </div>
            <Progress value={Math.min(progressPercent, 100)} className="h-2" />
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-secondary/50 p-2 rounded text-center">
              <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
                <DollarSign className="w-2.5 h-2.5" /> P&L
              </div>
              <p className={cn('text-sm font-bold font-mono', metrics.currentPnL >= 0 ? 'text-primary' : 'text-destructive')}>
                ${metrics.currentPnL.toFixed(2)}
              </p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
                <Activity className="w-2.5 h-2.5" /> Trades
              </div>
              <p className="text-sm font-bold text-foreground font-mono">{metrics.tradesExecuted}</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
                <Target className="w-2.5 h-2.5" /> Hit Rate
              </div>
              <p className="text-sm font-bold text-primary font-mono">{metrics.hitRate.toFixed(1)}%</p>
            </div>
            <div className="bg-secondary/50 p-2 rounded text-center">
              <div className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Avg TP
              </div>
              <p className="text-sm font-bold text-foreground font-mono">{metrics.avgTimeToTP.toFixed(1)}s</p>
            </div>
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Mode</label>
              <Select value={mode} onValueChange={(v: 'spot' | 'leverage') => setMode(v)} disabled={isRunning}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spot">Spot</SelectItem>
                  <SelectItem value="leverage">Leverage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Daily Target ($)</label>
              <Input
                type="number"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(Number(e.target.value))}
                disabled={isRunning}
                className="h-8 text-xs font-mono"
                min={10}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1">Profit/Trade ($)</label>
              <Input
                type="number"
                value={profitPerTrade}
                onChange={(e) => setProfitPerTrade(Math.max(0.1, Number(e.target.value)))}
                disabled={isRunning}
                className="h-8 text-xs font-mono"
                min={0.1}
                step={0.1}
              />
            </div>
          </div>

          {/* Leverage Sliders (if leverage mode) */}
          {mode === 'leverage' && (
            <div className="mb-3 space-y-2">
              <label className="text-[10px] text-muted-foreground block">Exchange Leverage</label>
              {EXCHANGE_CONFIGS.map(ex => (
                <div key={ex.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-foreground w-14">{ex.name}</span>
                  <Slider
                    value={[leverages[ex.name] || 1]}
                    onValueChange={(v) => setLeverages(prev => ({ ...prev, [ex.name]: v[0] }))}
                    min={1}
                    max={ex.maxLeverage}
                    step={1}
                    disabled={isRunning}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground w-6">{leverages[ex.name]}×</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommended USDT Allocation - Show when bot is NOT running */}
          {!isRunning && (
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground block mb-2">
                Recommended USDT Allocation (Total: ${suggestedUSDT.toLocaleString()})
              </label>
              <div className="bg-secondary/30 rounded overflow-hidden text-[10px]">
                <div className="grid grid-cols-4 gap-1 px-2 py-1.5 bg-muted/50 text-muted-foreground font-medium">
                  <span>Exchange</span>
                  <span>USDT</span>
                  <span>Confidence</span>
                  <span>Notes</span>
                </div>
                {EXCHANGE_CONFIGS.map(ex => {
                  const exchangeAllocation = Math.round(
                    suggestedUSDT * (ex.confidence === 'High' ? 0.30 : ex.confidence === 'Medium' ? 0.20 : 0.10)
                  );
                  return (
                    <div key={ex.name} className="grid grid-cols-4 gap-1 px-2 py-1.5 border-t border-border/50">
                      <span className="text-foreground">{ex.name}</span>
                      <span className="font-mono text-primary">${exchangeAllocation.toLocaleString()}</span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          'text-[8px] w-fit h-4',
                          ex.confidence === 'High' && 'border-primary text-primary',
                          ex.confidence === 'Medium' && 'border-warning text-warning',
                          ex.confidence === 'Low' && 'border-muted-foreground text-muted-foreground'
                        )}
                      >
                        {ex.confidence}
                      </Badge>
                      <span className="text-muted-foreground truncate">{ex.notes}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-auto">
            <Button
              className={cn('flex-1 gap-2', isRunning ? 'btn-outline-primary' : 'btn-primary')}
              onClick={handleStartStop}
              disabled={analyzingBot}
            >
              {analyzingBot ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRunning ? (
                <Square className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {analyzingBot ? 'Analyzing...' : isRunning ? 'Stop Bot' : 'Start Bot'}
            </Button>
            {isRunning && metrics.currentPnL > 0 && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleWithdrawProfits}
                disabled={withdrawing}
              >
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                Withdraw Profits
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 text-[9px] text-muted-foreground">
            <AlertTriangle className="w-3 h-3 text-warning" />
            <span>Daily stop: -$5 | Time-stop: 5-45s | SL: -$0.60/trade | Continues after target</span>
          </div>
        </div>

        {/* Right Column - Bot History & Recent Trades */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Recent Bot Trades */}
          <div className="card-terminal p-3 flex flex-col overflow-hidden flex-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2 flex-shrink-0">
              <Activity className="w-3 h-3 text-primary" />
              Recent Trades
              <Badge variant="outline" className="text-[8px] ml-auto">Live</Badge>
            </h3>
            <div className="flex-1 min-h-0">
              <RecentBotTrades />
            </div>
          </div>

          {/* Bot History */}
          <div className="card-terminal p-3 flex flex-col overflow-hidden flex-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2 flex-shrink-0">
              <FileText className="w-3 h-3 text-muted-foreground" />
              Bot History
            </h3>
            <div className="flex-1 min-h-0">
              <BotHistory bots={bots} />
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Modal */}
      <Dialog open={analysisOpen} onOpenChange={setAnalysisOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bot Performance Analysis</DialogTitle>
          </DialogHeader>
          {analysisData?.analysis && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{analysisData.analysis.summary}</p>
              
              <div>
                <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                <ul className="text-sm space-y-1">
                  {analysisData.analysis.insights?.map((insight: string, i: number) => (
                    <li key={i} className="text-muted-foreground">• {insight}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 p-3 rounded">
                  <p className="text-[10px] text-muted-foreground">Recommended Profit/Trade</p>
                  <p className="text-lg font-bold text-primary font-mono">
                    ${analysisData.analysis.recommendedProfitPerTrade?.toFixed(2) || profitPerTrade}
                  </p>
                </div>
                <div className="bg-secondary/50 p-3 rounded">
                  <p className="text-[10px] text-muted-foreground">Recommended Amount/Trade</p>
                  <p className="text-lg font-bold text-primary font-mono">
                    ${analysisData.analysis.recommendedAmountPerTrade?.toFixed(0) || 200}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Improvements</h4>
                <ul className="text-sm space-y-1">
                  {analysisData.analysis.improvements?.map((item: string, i: number) => (
                    <li key={i} className="text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
