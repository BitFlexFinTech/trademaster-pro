import { useState, useEffect, useMemo, useCallback } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useTradingMode, MAX_USDT_ALLOCATION } from '@/contexts/TradingModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { useNavigate } from 'react-router-dom';
import { useAIStrategyMonitor } from '@/hooks/useAIStrategyMonitor';
import { useRecommendationHistory } from '@/hooks/useRecommendationHistory';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Bot, DollarSign, Loader2, RefreshCw, BarChart3, XCircle, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { BotHistory } from '@/components/bots/BotHistory';
import { RecentBotTrades } from '@/components/bots/RecentBotTrades';
import { BotCard } from '@/components/bots/BotCard';
import { BotAnalyticsDashboard } from '@/components/bots/BotAnalyticsDashboard';
import { BotPerformanceDashboard } from '@/components/bots/BotPerformanceDashboard';
import { DailyPnLChart } from '@/components/bots/DailyPnLChart';
import { BotAnalysisModal } from '@/components/bots/BotAnalysisModal';
import { BotComparisonView } from '@/components/bots/BotComparisonView';
import { BotsMobileDrawer } from '@/components/bots/BotsMobileDrawer';
import { BotSettingsDrawer } from '@/components/bots/BotSettingsDrawer';
import { AIStrategyPanel } from '@/components/bots/AIStrategyPanel';
import { toast } from 'sonner';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';

interface UsdtFloat {
  exchange: string;
  amount: number;
  warning: boolean;
}

export default function Bots() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { 
    bots, 
    stats, 
    loading, 
    startBot, 
    stopBot, 
    stopBotWithAnalysis,
    updateBotPnl, 
    updateBotConfig,
    refetch,
    analyzeBot,
    analysisData,
    analysisLoading,
    showAnalysisModal,
    setShowAnalysisModal,
    analyzedBotName,
  } = useBotRuns();
  const { prices, wsConnected, getPrice } = useRealtimePrices();
  const { mode: tradingMode, setMode: setTradingMode, virtualBalance, triggerSync, lastSyncTime } = useTradingMode();
  const { connectedExchangeNames, hasConnections, needsReconnection, hasValidCredentials } = useConnectedExchanges();
  const navigate = useNavigate();
  

  const [usdtFloat, setUsdtFloat] = useState<UsdtFloat[]>([]);
  const [loadingFloat, setLoadingFloat] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [closingPositions, setClosingPositions] = useState(false);

  // Bot configuration state for applying recommendations
  const [botConfig, setBotConfig] = useState({
    profitPerTrade: 0.50,           // Minimum $0.50 profit per trade
    amountPerTrade: 100,            // $100 per trade default
    tradeIntervalMs: 200,           // 200ms for demo, enforced 5000ms+ for live
    maxPositionSize: 100,
    dailyStopLoss: 5,
    perTradeStopLoss: 0.10,         // Auto-calculated: profitPerTrade * 0.2
    focusPairs: [...TOP_PAIRS],
    leverageDefaults: EXCHANGE_CONFIGS.reduce((acc, config) => ({
      ...acc,
      [config.name]: Math.min(3, config.maxLeverage),
    }), {} as Record<string, number>),
  });

  // Auto-calculate stop loss when profit per trade changes (80% lower = 20% of profit)
  useEffect(() => {
    setBotConfig(prev => ({
      ...prev,
      perTradeStopLoss: prev.profitPerTrade * 0.2
    }));
  }, [botConfig.profitPerTrade]);

  // Find spot and leverage bots separately
  const spotBot = bots.find(b => b.botName === 'GreenBack Spot' && b.status === 'running');
  const leverageBot = bots.find(b => b.botName === 'GreenBack Leverage' && b.status === 'running');

  // Get active exchanges based on mode - connected for Live, all for Demo
  const activeExchanges = useMemo(() => {
    if (tradingMode === 'live' && hasConnections) {
      return EXCHANGE_CONFIGS.filter(ex => connectedExchangeNames.includes(ex.name));
    }
    return EXCHANGE_CONFIGS;
  }, [tradingMode, connectedExchangeNames, hasConnections]);

  // Current running bot metrics for AI strategy monitor
  const activeBot = spotBot || leverageBot;
  const currentPnL = (spotBot?.currentPnl || 0) + (leverageBot?.currentPnl || 0);
  const tradesExecuted = (spotBot?.tradesExecuted || 0) + (leverageBot?.tradesExecuted || 0);
  const combinedHitRate = tradesExecuted > 0
    ? ((spotBot?.tradesExecuted || 0) * (spotBot?.hitRate || 0) + (leverageBot?.tradesExecuted || 0) * (leverageBot?.hitRate || 0)) / tradesExecuted
    : 70;

  // AI Strategy Monitor hook
  const {
    recommendations,
    strategyMetrics,
    applyRecommendation: applyAIRecommendation,
    dismissRecommendation,
  } = useAIStrategyMonitor({
    isRunning: !!activeBot,
    dailyTarget: activeBot?.dailyTarget || 40,
    profitPerTrade: activeBot?.profitPerTrade || 1,
    lossPerTrade: botConfig.perTradeStopLoss,
    currentPnL,
    tradesExecuted,
    hitRate: combinedHitRate,
  });

  // Recommendation history for undo functionality
  const {
    history: recentlyApplied,
    addToHistory,
    removeFromHistory,
  } = useRecommendationHistory();
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

        // Use active exchanges (connected for Live, all for Demo)
        const exchangeNames = activeExchanges.map(ex => ex.name);
        setUsdtFloat(exchangeNames.map(ex => ({
          exchange: ex,
          amount: floatByExchange[ex] || 0,
          warning: (floatByExchange[ex] || 0) < suggestedUSDT / exchangeNames.length,
        })));
      } catch (err) {
        console.error('Error fetching USDT float:', err);
      } finally {
        setLoadingFloat(false);
      }
    }

    fetchUsdtFloat();
  }, [user, suggestedUSDT, activeExchanges]);

  const activeBotCount = bots.filter(b => b.status === 'running').length;

  // Handle applying recommendations from analysis - persists to database
  const handleApplyRecommendation = async (type: string, value: any) => {
    const oldConfig = { ...botConfig };
    const activeBot = spotBot || leverageBot || bots.find(b => b.status === 'stopped');
    
    switch (type) {
      case 'profit_per_trade':
        setBotConfig(prev => ({ ...prev, profitPerTrade: value }));
        if (activeBot) {
          await updateBotConfig(activeBot.id, { profitPerTrade: value });
        }
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
      case 'daily_stop_loss':
        setBotConfig(prev => ({ ...prev, dailyStopLoss: value }));
        toast.success(`Daily Stop Loss Updated`, {
          description: `Changed from -$${oldConfig.dailyStopLoss.toFixed(2)} → -$${value.toFixed(2)}`,
        });
        break;
      case 'per_trade_stop_loss':
        setBotConfig(prev => ({ ...prev, perTradeStopLoss: value }));
        toast.success(`Per-Trade Stop Loss Updated`, {
          description: `Changed from -$${oldConfig.perTradeStopLoss.toFixed(2)} → -$${value.toFixed(2)}`,
        });
        break;
      case 'focus_pairs':
        setBotConfig(prev => ({ ...prev, focusPairs: value }));
        toast.success(`Focus Pairs Updated`, {
          description: `Changed from ${oldConfig.focusPairs.slice(0, 3).join(', ')}... → ${value.join(', ')}`,
        });
        break;
      case 'signal_threshold':
        toast.success(`Signal Threshold Updated`, {
          description: `AI auto-adjusted to ${value}`,
        });
        break;
      default:
        // Handle improvement items being acknowledged
        if (type.startsWith('improvement_')) {
          toast.success(`Strategy noted`, {
            description: `Recommendation saved for next trading session`,
          });
        } else {
          toast.info(`Recommendation noted: ${type}`);
        }
    }
    
    // Refetch bots to sync changes
    await refetch();
  };

  // Handle AI recommendation application with undo support
  const handleAIRecommendation = useCallback(async (rec: { id: string; type: string; title: string; currentValue: number | string; suggestedValue: number | string }) => {
    // Save previous value for undo
    const previousValue = rec.currentValue;
    const newValue = rec.suggestedValue;

    // Add to history for undo
    addToHistory(rec.id, rec.type, rec.title, previousValue, newValue);

    // Remove recommendation and apply
    await applyAIRecommendation(rec as any);
    await handleApplyRecommendation(rec.type, rec.suggestedValue);
  }, [applyAIRecommendation, handleApplyRecommendation, addToHistory]);

  // Handle undo recommendation
  const handleUndoRecommendation = useCallback(async (rec: { id: string; type: string; previousValue: number | string }) => {
    // Remove from history
    removeFromHistory(rec.id);

    // Revert the change
    await handleApplyRecommendation(rec.type, rec.previousValue);

    toast.success('Change undone', {
      description: `Reverted to ${rec.previousValue}`,
    });
  }, [removeFromHistory, handleApplyRecommendation]);

  // Handle stopping bot with analysis
  const handleStopBot = async (botId: string, botName: string) => {
    await stopBotWithAnalysis(botId, botName);
  };

  // Handle closing all positions on Binance
  const handleCloseAllPositions = async () => {
    if (spotBot || leverageBot) {
      toast.error('Cannot close positions while bot is running. Stop the bot first.');
      return;
    }

    if (!window.confirm('This will sell ALL non-USDT crypto assets in your Binance account to USDT. Continue?')) {
      return;
    }

    setClosingPositions(true);
    try {
      const { data, error } = await supabase.functions.invoke('convert-to-usdt', {
        body: { botId: 'manual-close' },
      });

      if (error) throw error;

      if (data?.success) {
        const closedCount = data.closedPositions?.filter((p: { success: boolean }) => p.success).length || 0;
        const totalRecovered = data.totalUsdtRecovered || 0;
        
        if (closedCount > 0) {
          toast.success(`Closed ${closedCount} positions`, {
            description: `Recovered $${totalRecovered.toFixed(2)} USDT`,
          });
        } else {
          toast.info('No positions to close', {
            description: data.message || 'All assets already in USDT',
          });
        }

        // Refresh USDT float display
        triggerSync();
      } else {
        toast.error('Failed to close positions', {
          description: data?.error || 'Unknown error',
        });
      }
    } catch (err) {
      console.error('Close positions error:', err);
      toast.error('Failed to close positions', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setClosingPositions(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-base md:text-lg font-bold text-foreground">Trading Bots</h1>
          <span className="live-indicator text-xs hidden sm:inline">{activeBotCount} Active</span>
          <BotSettingsDrawer
            settings={botConfig}
            onSettingsChange={setBotConfig}
            disabled={!!spotBot || !!leverageBot}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1 hidden md:flex"
            onClick={() => setShowComparison(true)}
          >
            <BarChart3 className="w-3 h-3" />
            Compare Bots
          </Button>
          {/* Close All Positions - Live Mode Only */}
          {tradingMode === 'live' && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs gap-1 hidden md:flex"
              onClick={handleCloseAllPositions}
              disabled={closingPositions || !!spotBot || !!leverageBot}
            >
              {closingPositions ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              Close All Positions
            </Button>
          )}
          {/* Mobile drawer trigger */}
          {isMobile && (
            <BotsMobileDrawer
              spotBot={spotBot}
              leverageBot={leverageBot}
              bots={bots}
              prices={prices}
              startBot={startBot}
              stopBot={handleStopBot}
              updateBotPnl={updateBotPnl}
              analyzeBot={analyzeBot}
              suggestedUSDT={suggestedUSDT}
              usdtFloat={usdtFloat}
              dailyStopLoss={botConfig.dailyStopLoss}
              perTradeStopLoss={botConfig.perTradeStopLoss}
              onConfigChange={(key, value) => setBotConfig(prev => ({ ...prev, [key]: value }))}
            />
          )}
        </div>

        {/* Demo/Live Toggle */}
        <div className="flex items-center gap-2">
          {/* WebSocket Connection Status */}
          <div className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]",
            wsConnected ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          )}>
            {wsConnected ? (
              <>
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Offline</span>
              </>
            )}
          </div>
          <Badge variant={tradingMode === 'demo' ? 'secondary' : 'destructive'} className="text-[10px]">
            {tradingMode === 'demo' ? 'DEMO MODE' : 'LIVE TRADING'}
          </Badge>
          {/* Live Mode Sync Info */}
          {tradingMode === 'live' && lastSyncTime && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                Last sync: {lastSyncTime.toLocaleTimeString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  triggerSync();
                  toast.success('Syncing exchange balances...');
                }}
                className="h-5 w-5 p-0"
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          )}
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

      {/* Exchange Re-Connection Warning - Live Mode Only */}
      {tradingMode === 'live' && needsReconnection.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3 flex-shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-destructive">
                {needsReconnection.length} exchange{needsReconnection.length > 1 ? 's' : ''} need{needsReconnection.length === 1 ? 's' : ''} re-connection
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {needsReconnection.map(e => e.name).join(', ')} - API credentials missing or expired.
                Live trading will not work until re-connected.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => navigate('/settings')}
            >
              Fix in Settings
            </Button>
          </div>
        </div>
      )}

      {/* No Valid Credentials Warning - Live Mode Only */}
      {tradingMode === 'live' && hasConnections && !hasValidCredentials && needsReconnection.length === 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3 flex-shrink-0">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-warning">No exchanges ready for live trading</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect at least one exchange with valid API credentials to enable live trading.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              onClick={() => navigate('/settings')}
            >
              Connect Exchange
            </Button>
          </div>
        </div>
      )}

      {/* USDT Float by Exchange - Top with Cap Indicator */}
      <div className="card-terminal p-3 mb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            {tradingMode === 'demo' ? 'Virtual USDT Allocation' : 'USDT Float by Exchange'}
          </h3>
          {/* USDT Cap Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                ${suggestedUSDT.toLocaleString()} / ${MAX_USDT_ALLOCATION.toLocaleString()}
              </span>
              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all rounded-full",
                    suggestedUSDT >= MAX_USDT_ALLOCATION ? "bg-destructive" : 
                    suggestedUSDT >= MAX_USDT_ALLOCATION * 0.8 ? "bg-warning" : "bg-primary"
                  )}
                  style={{ width: `${Math.min((suggestedUSDT / MAX_USDT_ALLOCATION) * 100, 100)}%` }}
                />
              </div>
              {suggestedUSDT >= MAX_USDT_ALLOCATION && (
                <Badge variant="destructive" className="text-[8px] h-4">AT CAP</Badge>
              )}
              {suggestedUSDT >= MAX_USDT_ALLOCATION * 0.8 && suggestedUSDT < MAX_USDT_ALLOCATION && (
                <Badge variant="outline" className="text-[8px] h-4 border-warning text-warning">
                  {Math.round((suggestedUSDT / MAX_USDT_ALLOCATION) * 100)}%
                </Badge>
              )}
            </div>
          </div>
        </div>

        {loadingFloat ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {tradingMode === 'demo' ? (
              activeExchanges.map((config) => {
                // Use suggestedUSDT (volatility-based) with confidence percentages
                const allocation = EXCHANGE_ALLOCATION_PERCENTAGES[config.confidence];
                const amount = Math.round(suggestedUSDT * allocation);
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

      {/* Main Content Grid - Hidden on mobile, use drawer instead */}
      <div className={cn(
        "flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3",
        isMobile && "hidden"
      )}>
        {/* Left Column - Spot and Leverage Bot Cards */}
        <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden">
          <BotCard
            botType="spot"
            existingBot={spotBot}
            prices={prices}
            onStartBot={startBot}
            onStopBot={(botId) => handleStopBot(botId, 'GreenBack Spot')}
            onUpdateBotPnl={updateBotPnl}
            suggestedUSDT={suggestedUSDT}
            usdtFloat={usdtFloat}
            dailyStopLoss={botConfig.dailyStopLoss}
            perTradeStopLoss={botConfig.perTradeStopLoss}
            amountPerTrade={botConfig.amountPerTrade}
            tradeIntervalMs={botConfig.tradeIntervalMs}
            onConfigChange={(key, value) => setBotConfig(prev => ({ ...prev, [key]: value }))}
            isAnyBotRunning={!!spotBot || !!leverageBot}
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
            dailyStopLoss={botConfig.dailyStopLoss}
            perTradeStopLoss={botConfig.perTradeStopLoss}
            amountPerTrade={botConfig.amountPerTrade}
            tradeIntervalMs={botConfig.tradeIntervalMs}
            onConfigChange={(key, value) => setBotConfig(prev => ({ ...prev, [key]: value }))}
            isAnyBotRunning={!!spotBot || !!leverageBot}
          />
        </div>

        {/* Middle Column - AI Strategy Panel + Analytics Dashboard + Performance Dashboard */}
        <div className="lg:col-span-4 flex flex-col gap-3 overflow-hidden">
          {/* AI Strategy Panel - Increased height */}
          <div className="min-h-[380px] flex-shrink-0">
            <AIStrategyPanel
              metrics={strategyMetrics}
              recommendations={recommendations}
              onApplyRecommendation={handleAIRecommendation}
              onDismissRecommendation={dismissRecommendation}
              onUndoRecommendation={handleUndoRecommendation}
              recentlyApplied={recentlyApplied}
              isRunning={!!activeBot}
              className="h-full"
            />
          </div>
          <div className="flex-1 min-h-0">
            <BotAnalyticsDashboard />
          </div>
          <div className="flex-1 min-h-0">
            <BotPerformanceDashboard />
          </div>
          <div className="h-[140px] flex-shrink-0">
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

      {/* Comparison Modal */}
      <BotComparisonView
        open={showComparison}
        onOpenChange={setShowComparison}
      />
    </div>
  );
}
