import { useState, useEffect } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Bot, Play, Square, ArrowUpRight, Plus, AlertTriangle, DollarSign, TrendingUp, Clock, Settings, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { GreenBackBot } from '@/components/bots/GreenBackBot';
import { ScrollArea } from '@/components/ui/scroll-area';

const exchanges = ['Binance', 'Bybit', 'OKX', 'KuCoin', 'Hyperliquid', 'Kraken', 'Nexo.com'];

interface UsdtFloat {
  exchange: string;
  amount: number;
  warning: boolean;
}

export default function Bots() {
  const { user } = useAuth();
  const { bots, stats, loading, startBot, stopBot, refetch } = useBotRuns();
  const [tradingAmount, setTradingAmount] = useState(5000);
  const [activeExchanges, setActiveExchanges] = useState<string[]>(['Binance', 'Bybit', 'KuCoin', 'Nexo.com']);
  const [usdtFloat, setUsdtFloat] = useState<UsdtFloat[]>([]);
  const [loadingFloat, setLoadingFloat] = useState(true);

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
          warning: (floatByExchange[ex] || 0) < 500,
        })));
      } catch (err) {
        console.error('Error fetching USDT float:', err);
      } finally {
        setLoadingFloat(false);
      }
    }

    fetchUsdtFloat();
  }, [user]);

  const toggleExchange = (exchange: string) => {
    setActiveExchanges((prev) =>
      prev.includes(exchange)
        ? prev.filter((e) => e !== exchange)
        : [...prev, exchange]
    );
  };

  const handleStartBot = async (botId: string) => {
    await startBot('Peanuts', 'spot', 30, 0.5);
    refetch();
  };

  const handleStopBot = async (botId: string) => {
    await stopBot(botId);
    refetch();
  };

  const activeBotCount = bots.filter(b => b.status === 'running').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Trading Bots</h1>
          <span className="live-indicator">{activeBotCount + 1} Active</span>
        </div>
        <Button className="btn-primary gap-2">
          <Plus className="w-4 h-4" />
          Create Bot
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-4">
          {/* Bot Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* GreenBack Bot */}
            <GreenBackBot />

            {/* Bot Runs from Database */}
            {loading ? (
              <div className="card-terminal p-4 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : bots.length === 0 ? (
              <div className="card-terminal p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="font-semibold text-foreground">Peanuts</h3>
                      <p className="text-xs text-muted-foreground">AI Grid Arbitrage</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded flex items-center gap-1 bg-secondary text-muted-foreground">
                    Stopped
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-muted-foreground block">Today's Profit</span>
                    <span className="text-xl font-bold text-primary font-mono">$0.00</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Trades Today</span>
                    <span className="text-xl font-bold text-foreground font-mono">0</span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Daily Goal Progress</span>
                    <span className="text-foreground font-mono">$0.00 / $30.00</span>
                  </div>
                  <Progress value={0} className="h-2" />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1 gap-2 btn-primary"
                    onClick={() => handleStartBot('new')}
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </Button>
                  <Button variant="outline" className="gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    Transfer
                  </Button>
                </div>
              </div>
            ) : (
              bots.map((bot) => (
                <div key={bot.id} className="card-terminal p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Bot className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-semibold text-foreground">{bot.botName}</h3>
                        <p className="text-xs text-muted-foreground">{bot.mode} mode</p>
                      </div>
                    </div>
                    <span className={cn(
                      'text-xs px-2 py-1 rounded flex items-center gap-1',
                      bot.status === 'running'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-secondary text-muted-foreground'
                    )}>
                      {bot.status === 'running' && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                      {bot.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="text-xs text-muted-foreground block">Current P&L</span>
                      <span className={cn(
                        "text-xl font-bold font-mono",
                        bot.currentPnl >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        ${bot.currentPnl.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Trades</span>
                      <span className="text-xl font-bold text-foreground font-mono">
                        {bot.tradesExecuted}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Daily Goal Progress</span>
                      <span className="text-foreground font-mono">
                        ${bot.currentPnl.toFixed(2)} / ${bot.dailyTarget.toFixed(2)}
                      </span>
                    </div>
                    <Progress value={Math.min((bot.currentPnl / bot.dailyTarget) * 100, 100)} className="h-2" />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={bot.status === 'running' ? 'outline' : 'default'}
                      className={cn(
                        'flex-1 gap-2',
                        bot.status === 'running' ? 'btn-outline-primary' : 'btn-primary'
                      )}
                      onClick={() => bot.status === 'running' ? handleStopBot(bot.id) : handleStartBot(bot.id)}
                    >
                      {bot.status === 'running' ? (
                        <>
                          <Square className="w-4 h-4" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button variant="outline" className="gap-2">
                      <ArrowUpRight className="w-4 h-4" />
                      Transfer
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Configuration & Float */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Peanuts Configuration */}
            <div className="card-terminal p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  Peanuts Configuration
                </h3>
                <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                  Pionex-style Grid Bot
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Trading Amount (USDT)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={tradingAmount}
                      onChange={(e) => setTradingAmount(Number(e.target.value))}
                      className="bg-secondary border-border font-mono"
                    />
                    <Button variant="outline" size="sm" onClick={() => setTradingAmount(1000)}>$1K</Button>
                    <Button variant="outline" size="sm" onClick={() => setTradingAmount(5000)}>$5K</Button>
                    <Button variant="outline" size="sm" onClick={() => setTradingAmount(10000)}>$10K</Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="card-terminal bg-secondary/50 p-3 rounded-lg">
                    <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                      <DollarSign className="w-3 h-3" />
                      Profit Per Trade
                    </div>
                    <p className="text-lg font-bold text-primary font-mono">$0.50</p>
                    <span className="text-xs text-muted-foreground">After fees</span>
                  </div>
                  <div className="card-terminal bg-secondary/50 p-3 rounded-lg">
                    <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                      <TrendingUp className="w-3 h-3" />
                      24h Potential
                    </div>
                    <p className="text-lg font-bold text-primary font-mono">$60.00</p>
                    <span className="text-xs text-muted-foreground">Estimated</span>
                  </div>
                  <div className="card-terminal bg-secondary/50 p-3 rounded-lg">
                    <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                      <Clock className="w-3 h-3" />
                      Max Trades/24h
                    </div>
                    <p className="text-lg font-bold text-foreground font-mono">2880</p>
                    <span className="text-xs text-muted-foreground">Maximum possible</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground block mb-3">Active Exchanges</label>
                  <div className="grid grid-cols-4 gap-2">
                    {exchanges.map((exchange) => (
                      <div
                        key={exchange}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg border transition-colors',
                          activeExchanges.includes(exchange)
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary'
                        )}
                      >
                        <span className="text-sm text-foreground">{exchange.replace('.com', '')}</span>
                        <Switch
                          checked={activeExchanges.includes(exchange)}
                          onCheckedChange={() => toggleExchange(exchange)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* USDT Float */}
            <div className="card-terminal p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                USDT Float
              </h3>

              {loadingFloat ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {usdtFloat.map((item) => (
                    <div
                      key={item.exchange}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'w-2 h-2 rounded-full',
                          item.warning ? 'bg-warning' : 'bg-primary'
                        )} />
                        <span className="text-foreground">{item.exchange}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'font-mono',
                          item.warning ? 'text-warning' : 'text-primary'
                        )}>
                          ${item.amount.toLocaleString()}
                        </span>
                        {item.warning && (
                          <AlertTriangle className="w-4 h-4 text-warning" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
