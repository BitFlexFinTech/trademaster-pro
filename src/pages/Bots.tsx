import { useState } from 'react';
import { botsData } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Bot, Play, Square, ArrowUpRight, Plus, AlertTriangle, DollarSign, TrendingUp, Clock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { GreenBackBot } from '@/components/bots/GreenBackBot';
import { ScrollArea } from '@/components/ui/scroll-area';

const exchanges = ['Binance', 'Bybit', 'OKX', 'KuCoin', 'Hyperliquid', 'Kraken', 'Nexo.com'];

export default function Bots() {
  const [tradingAmount, setTradingAmount] = useState(botsData.config.tradingAmount);
  const [activeExchanges, setActiveExchanges] = useState<string[]>(botsData.activeExchanges);

  const toggleExchange = (exchange: string) => {
    setActiveExchanges((prev) =>
      prev.includes(exchange)
        ? prev.filter((e) => e !== exchange)
        : [...prev, exchange]
    );
  };

  return (
    <div className="min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Trading Bots</h1>
          <span className="live-indicator">{botsData.activeBots + 1} Active</span>
        </div>
        <Button className="btn-primary gap-2">
          <Plus className="w-4 h-4" />
          Create Bot
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 pr-4">
          {/* Bot Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* GreenBack Bot */}
            <GreenBackBot />

            {/* Existing Bots */}
            {botsData.bots.map((bot) => (
              <div key={bot.id} className="card-terminal p-4">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="font-semibold text-foreground">{bot.name}</h3>
                      <p className="text-xs text-muted-foreground">{bot.type}</p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-1 rounded flex items-center gap-1',
                    bot.status === 'Running'
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground'
                  )}>
                    {bot.status === 'Running' && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />}
                    {bot.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <span className="text-xs text-muted-foreground block">Today's Profit</span>
                    <span className="text-xl font-bold text-primary font-mono">
                      ${bot.todayProfit.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Trades Today</span>
                    <span className="text-xl font-bold text-foreground font-mono">
                      {bot.tradesToday}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Daily Goal Progress</span>
                    <span className="text-foreground font-mono">
                      ${bot.todayProfit.toFixed(2)} / ${bot.dailyGoal.toFixed(2)}
                    </span>
                  </div>
                  <Progress value={(bot.todayProfit / bot.dailyGoal) * 100} className="h-2" />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={bot.status === 'Running' ? 'outline' : 'default'}
                    className={cn(
                      'flex-1 gap-2',
                      bot.status === 'Running' ? 'btn-outline-primary' : 'btn-primary'
                    )}
                  >
                    {bot.status === 'Running' ? (
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
            ))}
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

              <div className="space-y-3">
                {botsData.usdtFloat.map((item) => (
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
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
