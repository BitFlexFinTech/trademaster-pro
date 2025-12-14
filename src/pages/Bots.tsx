import { useState, useEffect, useMemo } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useTradingMode, MAX_USDT_ALLOCATION } from '@/contexts/TradingModeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bot, DollarSign, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { BotHistory } from '@/components/bots/BotHistory';
import { RecentBotTrades } from '@/components/bots/RecentBotTrades';
import { BotCard } from '@/components/bots/BotCard';
import { BotAnalyticsDashboard } from '@/components/bots/BotAnalyticsDashboard';
import { DailyPnLChart } from '@/components/bots/DailyPnLChart';
import { BotAnalysisModal } from '@/components/bots/BotAnalysisModal';
import { toast } from 'sonner';

const exchanges = ['Binance', 'Bybit', 'OKX', 'KuCoin', 'Kraken', 'Nexo'];

interface ExchangeConfig {
  name: string;
  maxLeverage: number;
  confidence: 'High' | 'Medium' | 'Low';
}

const EXCHANGE_CONFIGS: ExchangeConfig[] = [
  { name: 'Binance', maxLeverage: 20, confidence: 'High' },
  { name: 'OKX', maxLeverage: 20, confidence: 'High' },
  { name: 'Bybit', maxLeverage: 25, confidence: 'Medium' },
  { name: 'Kraken', maxLeverage: 5, confidence: 'Medium' },
  { name: 'Nexo', maxLeverage: 3, confidence: 'Low' },
];

interface UsdtFloat {
  exchange: string;
  amount: number;
  warning: boolean;
}

export default function Bots() {
  const { user } = useAuth();
  const { 
    bots, 
    stats, 
    loading, 
    startBot, 
    stopBot, 
    stopBotWithAnalysis,
    updateBotPnl, 
    refetch,
    analyzeBot,
    analysisData,
    analysisLoading,
    showAnalysisModal,
    setShowAnalysisModal,
    analyzedBotName,
  } = useBotRuns();
  const { prices } = useRealtimePrices();
  const { mode: tradingMode, setMode: setTradingMode, virtualBalance } = useTradingMode();

  const [usdtFloat, setUsdtFloat] = useState<UsdtFloat[]>([]);
  const [loadingFloat, setLoadingFloat] = useState(true);

  // Bot configuration state for applying recommendations
  const [botConfig, setBotConfig] = useState({
    profitPerTrade: 1,
    amountPerTrade: 100,
    stopLoss: 0.60,
    focusPairs: ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK'],
  });

  // Find spot and leverage bots separately
  const spotBot = bots.find(b => b.botName === 'GreenBack Spot' && b.status === 'running');
  const leverageBot = bots.find(b => b.botName === 'GreenBack Leverage' && b.status === 'running');

  // Calculate suggested USDT using real prices - CAPPED at $5000
  const suggestedUSDT = useMemo(() => {
    const dailyTarget = 40;
    const profitPerTrade = 1;

    // Use real volatility from prices
    const avgVolatility = prices.length > 0
      ? prices.slice(0, 10).reduce((sum, p) => sum + Math.abs(p.change_24h || 0), 0) / Math.min(prices.length, 10) / 24
      : 0.5;

    const avgMovePercent = Math.max(avgVolatility / 100, 0.001);
    const avgPositionSize = profitPerTrade / avgMovePercent;
    const buffer = tradingMode === 'live' ? 1.5 : 1.3;

    const rawValue = Math.ceil(avgPositionSize * buffer);
    // Cap at MAX_USDT_ALLOCATION ($5000)
    return Math.min(rawValue, MAX_USDT_ALLOCATION);
  }, [prices, tradingMode]);

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

  const activeBotCount = bots.filter(b => b.status === 'running').length;

  // Handle applying recommendations from analysis with old vs new notification
  const handleApplyRecommendation = async (type: string, value: any) => {
    const oldConfig = { ...botConfig };
    
    switch (type) {
      case 'profit_per_trade':
        setBotConfig(prev => ({ ...prev, profitPerTrade: value }));
        toast.success(`Profit Per Trade Updated`, {
          description: `Changed from $${oldConfig.profitPerTrade.toFixed(2)} → $${value.toFixed(2)}`,
        });
        break;
      case 'amount_per_trade':
        setBotConfig(prev => ({ ...prev, amountPerTrade: value }));
        toast.success(`Amount Per Trade Updated`, {
          description: `Changed from $${oldConfig.amountPerTrade.toFixed(0)} → $${value.toFixed(0)}`,
        });
        break;
      case 'stop_loss':
        setBotConfig(prev => ({ ...prev, stopLoss: value }));
        toast.success(`Stop Loss Updated`, {
          description: `Changed from -$${oldConfig.stopLoss.toFixed(2)} → -$${value.toFixed(2)}`,
        });
        break;
      case 'focus_pairs':
        setBotConfig(prev => ({ ...prev, focusPairs: value }));
        toast.success(`Focus Pairs Updated`, {
          description: `Changed from ${oldConfig.focusPairs.slice(0, 3).join(', ')}... → ${value.join(', ')}`,
        });
        break;
      default:
        toast.info(`Recommendation noted: ${type}`);
    }
  };

  // Handle stopping bot with analysis
  const handleStopBot = async (botId: string, botName: string) => {
    await stopBotWithAnalysis(botId, botName);
  };

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
              disabled={!!spotBot || !!leverageBot}
            >
              Demo
            </Button>
            <Button
              size="sm"
              variant={tradingMode === 'live' ? 'destructive' : 'ghost'}
              onClick={() => setTradingMode('live')}
              className="h-6 text-xs px-3"
              disabled={!!spotBot || !!leverageBot}
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
              EXCHANGE_CONFIGS.map((config) => {
                const allocation = config.confidence === 'High' ? 0.30 : config.confidence === 'Medium' ? 0.20 : 0.10;
                const amount = Math.round(virtualBalance * allocation);
                return (
                  <div key={config.name} className="flex flex-col items-center p-2 rounded bg-secondary/50">
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
              usdtFloat.map((item) => (
                <div key={item.exchange} className="flex flex-col items-center p-2 rounded bg-secondary/50">
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

      {/* Main Content Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Column - Spot and Leverage Bot Cards */}
        <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-auto">
          <BotCard
            botType="spot"
            existingBot={spotBot}
            prices={prices}
            onStartBot={startBot}
            onStopBot={(botId) => handleStopBot(botId, 'GreenBack Spot')}
            onUpdateBotPnl={updateBotPnl}
            suggestedUSDT={suggestedUSDT}
            usdtFloat={usdtFloat}
          />
          <BotCard
            botType="leverage"
            existingBot={leverageBot}
            prices={prices}
            onStartBot={startBot}
            onStopBot={(botId) => handleStopBot(botId, 'GreenBack Leverage')}
            onUpdateBotPnl={updateBotPnl}
            suggestedUSDT={suggestedUSDT}
            usdtFloat={usdtFloat}
          />
        </div>

        {/* Middle Column - Analytics Dashboard + Daily P&L Chart */}
        <div className="lg:col-span-4 flex flex-col gap-3 overflow-hidden">
          <div className="flex-1 min-h-0">
            <BotAnalyticsDashboard />
          </div>
          <div className="h-[200px] flex-shrink-0">
            <DailyPnLChart />
          </div>
        </div>

        {/* Right Column - Recent Trades & Bot History */}
        <div className="lg:col-span-3 flex flex-col gap-3 overflow-hidden">
          <div className="card-terminal p-3 flex flex-col overflow-hidden flex-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2 flex-shrink-0">
              Recent Trades
              <Badge variant="outline" className="text-[8px] ml-auto">Live</Badge>
            </h3>
            <div className="flex-1 min-h-0">
              <RecentBotTrades />
            </div>
          </div>

          <div className="card-terminal p-3 flex flex-col overflow-hidden flex-1">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2 flex-shrink-0">
              Bot History
            </h3>
            <div className="flex-1 min-h-0">
              <BotHistory bots={bots} onViewAnalysis={analyzeBot} />
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Modal */}
      <BotAnalysisModal
        open={showAnalysisModal}
        onOpenChange={setShowAnalysisModal}
        botName={analyzedBotName}
        analysis={analysisData.analysis}
        stats={analysisData.stats}
        onApplyRecommendation={handleApplyRecommendation}
        loading={analysisLoading}
        currentConfig={botConfig}
      />
    </div>
  );
}
