import { useState, useCallback } from 'react';
import { Bot, TrendingUp, BarChart3, Settings, Power, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MobileBotCard } from './MobileBotCard';
import { BottomNavigation } from './BottomNavigation';
import { LiveProfitCounter } from './LiveProfitCounter';
import { MarketRegimeIndicator } from './MarketRegimeIndicator';
import { SpeedMetricsDashboard } from './SpeedMetricsDashboard';
import { ErrorRecoveryLog } from './ErrorRecoveryLog';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { toast } from 'sonner';

interface MobileBotsPageProps {
  bots: any[];
  stats: any;
  loading: boolean;
  startBot: (botName: string, mode: 'leverage' | 'spot', dailyTarget: number, profitPerTrade: number, isSandbox?: boolean, amountPerTrade?: number, tradeIntervalMs?: number) => Promise<any>;
  stopBot: (id: string) => Promise<void>;
  wsConnected: boolean;
  connectedExchangeNames: string[];
}

type MobileTab = 'bots' | 'positions' | 'analytics' | 'settings';

export function MobileBotsPage({
  bots,
  stats,
  loading,
  startBot,
  stopBot,
  wsConnected,
  connectedExchangeNames,
}: MobileBotsPageProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('bots');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { mode: tradingMode, virtualBalance } = useTradingMode();

  const runningBots = bots.filter(b => b.status === 'running');
  const totalPnL = stats?.totalPnl || 0;

  const handlePullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsRefreshing(false);
    toast.success('Data refreshed');
  }, []);

  const handleQuickStartAll = useCallback(async () => {
    if (connectedExchangeNames.length === 0) {
      toast.error('No exchanges connected');
      return;
    }
    
    for (const exchange of connectedExchangeNames) {
      await startBot(`${exchange} Bot`, 'spot', 30, 1.00);
    }
    toast.success('All bots started');
  }, [connectedExchangeNames, startBot]);

  const handleEmergencyStop = useCallback(async () => {
    for (const bot of runningBots) {
      await stopBot(bot.id);
    }
    toast.success('All bots stopped');
  }, [runningBots, stopBot]);

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      {/* Top Status Bar */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Trading Bots</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px]",
                wsConnected ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400"
              )}
            >
              {wsConnected ? 'Live' : 'Offline'}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {runningBots.length} active
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <span className="text-[10px] text-muted-foreground block">Mode</span>
            <span className="text-xs font-medium capitalize">{tradingMode}</span>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <span className="text-[10px] text-muted-foreground block">Balance</span>
            <span className="text-xs font-mono">${virtualBalance.toFixed(2)}</span>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <span className="text-[10px] text-muted-foreground block">Today P/L</span>
            <span className={cn(
              "text-xs font-mono font-bold",
              totalPnL >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-4">
          {activeTab === 'bots' && (
            <>
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={handleQuickStartAll}
                  className="h-12 text-sm"
                  disabled={loading || runningBots.length > 0}
                >
                  <Power className="w-4 h-4 mr-2" />
                  Start All
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleEmergencyStop}
                  className="h-12 text-sm"
                  disabled={runningBots.length === 0}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Stop All
                </Button>
              </div>

              {/* Market Status */}
              <Card className="card-terminal">
                <CardContent className="p-3">
                  <MarketRegimeIndicator />
                </CardContent>
              </Card>

              {/* Bot Cards */}
              <div className="space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <Card key={i} className="card-terminal animate-pulse h-24" />
                    ))}
                  </div>
                ) : bots.length === 0 ? (
                  <Card className="card-terminal">
                    <CardContent className="p-6 text-center">
                      <Bot className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No bots configured</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connect an exchange to get started
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  bots.map(bot => (
                    <MobileBotCard
                      key={bot.id}
                      bot={bot}
                      onStart={() => startBot(bot.bot_name, bot.mode || 'spot', 30, 1.00)}
                      onStop={() => stopBot(bot.id)}
                    />
                  ))
                )}
              </div>

              {/* Live Profit Counter */}
              <div className="mt-4">
                <LiveProfitCounter />
              </div>
            </>
          )}

          {activeTab === 'positions' && (
            <div className="space-y-4">
              <Card className="card-terminal">
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm">Position Monitor</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    View open positions and P/L
                  </p>
                </CardContent>
              </Card>
              <ErrorRecoveryLog />
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <SpeedMetricsDashboard />
              <ErrorRecoveryLog />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              <Card className="card-terminal">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Trading Mode</p>
                      <p className="text-xs text-muted-foreground capitalize">{tradingMode}</p>
                    </div>
                    <Badge variant="outline">{tradingMode}</Badge>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="card-terminal">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Connected Exchanges</p>
                      <p className="text-xs text-muted-foreground">
                        {connectedExchangeNames.length} exchange(s)
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {connectedExchangeNames.map(name => (
                        <Badge key={name} variant="outline" className="text-[10px]">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handlePullToRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
                Refresh Data
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
