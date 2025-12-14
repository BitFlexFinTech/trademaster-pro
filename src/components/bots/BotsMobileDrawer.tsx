import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Activity, History, BarChart3 } from 'lucide-react';
import { BotCard } from './BotCard';
import { BotAnalyticsDashboard } from './BotAnalyticsDashboard';
import { BotPerformanceDashboard } from './BotPerformanceDashboard';
import { RecentBotTrades } from './RecentBotTrades';
import { BotHistory } from './BotHistory';
import { DailyPnLChart } from './DailyPnLChart';

interface BotsMobileDrawerProps {
  spotBot: any;
  leverageBot: any;
  bots: any[];
  prices: any[];
  startBot: (botName: string, mode: 'spot' | 'leverage', dailyTarget: number, profitPerTrade: number) => Promise<any>;
  stopBot: (botId: string, botName: string) => Promise<void>;
  updateBotPnl: (botId: string, pnl: number, trades: number, hitRate: number) => Promise<void>;
  analyzeBot: (botId: string, botName: string) => Promise<void>;
  suggestedUSDT: number;
  usdtFloat: Array<{ exchange: string; amount: number; warning: boolean }>;
  dailyStopLoss?: number;
  perTradeStopLoss?: number;
  onConfigChange?: (key: string, value: number) => void;
}

export function BotsMobileDrawer({
  spotBot,
  leverageBot,
  bots,
  prices,
  startBot,
  stopBot,
  updateBotPnl,
  analyzeBot,
  suggestedUSDT,
  usdtFloat,
  dailyStopLoss = 5,
  perTradeStopLoss = 0.60,
  onConfigChange,
}: BotsMobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('bots');

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden gap-2">
          <Bot className="w-4 h-4" />
          Manage Bots
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Trading Bots
          </SheetTitle>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
          <TabsList className="grid grid-cols-3 mx-4 mt-2">
            <TabsTrigger value="bots" className="gap-1 text-xs">
              <Bot className="w-3 h-3" />
              Bots
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1 text-xs">
              <BarChart3 className="w-3 h-3" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 text-xs">
              <History className="w-3 h-3" />
              History
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto p-4">
            <TabsContent value="bots" className="mt-0 space-y-4">
              <BotCard
                botType="spot"
                existingBot={spotBot}
                prices={prices}
                onStartBot={startBot}
                onStopBot={(botId) => stopBot(botId, 'GreenBack Spot')}
                onUpdateBotPnl={updateBotPnl}
                suggestedUSDT={suggestedUSDT}
                usdtFloat={usdtFloat}
                dailyStopLoss={dailyStopLoss}
                perTradeStopLoss={perTradeStopLoss}
                onConfigChange={onConfigChange}
                isAnyBotRunning={!!spotBot || !!leverageBot}
              />
              <BotCard
                botType="leverage"
                existingBot={leverageBot}
                prices={prices}
                onStartBot={startBot}
                onStopBot={(botId) => stopBot(botId, 'GreenBack Leverage')}
                onUpdateBotPnl={updateBotPnl}
                suggestedUSDT={suggestedUSDT}
                usdtFloat={usdtFloat}
                dailyStopLoss={dailyStopLoss}
                perTradeStopLoss={perTradeStopLoss}
                onConfigChange={onConfigChange}
                isAnyBotRunning={!!spotBot || !!leverageBot}
              />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 space-y-4">
              <BotAnalyticsDashboard />
              <BotPerformanceDashboard />
              <div className="h-[200px]">
                <DailyPnLChart />
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-4">
              <div className="card-terminal p-3">
                <h3 className="text-xs font-semibold mb-2">Recent Trades</h3>
                <RecentBotTrades />
              </div>
              <div className="card-terminal p-3">
                <h3 className="text-xs font-semibold mb-2">Bot History</h3>
                <BotHistory bots={bots} onViewAnalysis={analyzeBot} />
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
