import { useState, useEffect } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bot, Play, Square, ArrowUpRight, AlertTriangle, DollarSign, Loader2 } from 'lucide-react';
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

  const handleStartBot = async (botId: string) => {
    await startBot('GreenBack', 'spot', 30, 1);
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
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-4">
          {/* Bot Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* GreenBack Bot */}
            <GreenBackBot />

            {/* Bot Runs from Database */}
            {loading ? (
              <div className="card-terminal p-4 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : bots.length > 0 && (
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
                  </div>
                </div>
              ))
            )}
          </div>

          {/* USDT Float */}
          <div className="card-terminal p-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              USDT Float by Exchange
            </h3>

            {loadingFloat ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {usdtFloat.map((item) => (
                  <div
                    key={item.exchange}
                    className="flex flex-col items-center p-3 rounded-lg bg-secondary/50"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'w-2 h-2 rounded-full',
                        item.warning ? 'bg-warning' : 'bg-primary'
                      )} />
                      <span className="text-sm text-foreground">{item.exchange.replace('.com', '')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn(
                        'font-mono text-lg font-bold',
                        item.warning ? 'text-warning' : 'text-primary'
                      )}>
                        ${item.amount.toLocaleString()}
                      </span>
                      {item.warning && (
                        <AlertTriangle className="w-3 h-3 text-warning" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
