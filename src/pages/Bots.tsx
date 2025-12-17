import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useTradingMode, MAX_USDT_ALLOCATION, DEFAULT_BASE_BALANCE } from '@/contexts/TradingModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { useNavigate } from 'react-router-dom';
import { useAIStrategyMonitor } from '@/hooks/useAIStrategyMonitor';
import { useRecommendationHistory } from '@/hooks/useRecommendationHistory';
import { useDailyTargetRecommendation } from '@/hooks/useDailyTargetRecommendation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, DollarSign, Loader2, RefreshCw, BarChart3, XCircle, AlertTriangle, Wifi, WifiOff, Download, Power, Lock, Unlock, Edit2, Brain, Sparkles, Target, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, exportToCSV } from '@/lib/utils';
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
import { AuditDashboardPanel } from '@/components/bots/AuditDashboardPanel';
import { AuditReport } from '@/lib/selfAuditReporter';
import { DashboardCharts } from '@/lib/dashboardGenerator';
import { toast } from 'sonner';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS } from '@/lib/exchangeConfig';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UsdtFloat {
  exchange: string;
  amount: number;
  baseBalance: number;
  availableFloat: number;
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
  const { 
    mode: tradingMode, 
    setMode: setTradingMode, 
    virtualBalance, 
    triggerSync, 
    lastSyncTime, 
    baseBalancePerExchange, 
    setBaseBalancePerExchange, 
    getAvailableFloat,
    exchangeBalances,
    fetchExchangeBalances,
    getRealBalance,
    profitVault,
  } = useTradingMode();
  const { connectedExchangeNames, hasConnections, needsReconnection, hasValidCredentials } = useConnectedExchanges();
  const navigate = useNavigate();
  
  const [usdtFloat, setUsdtFloat] = useState<UsdtFloat[]>([]);
  const [loadingFloat, setLoadingFloat] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [closingPositions, setClosingPositions] = useState(false);
  const [killingAll, setKillingAll] = useState(false);
  const [exportingTrades, setExportingTrades] = useState(false);
  const [editingBaseBalance, setEditingBaseBalance] = useState<string | null>(null);
  const [tempBaseBalance, setTempBaseBalance] = useState<number>(DEFAULT_BASE_BALANCE);
  
  // Audit Dashboard state
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [dashboards, setDashboards] = useState<DashboardCharts | null>(null);
  
  // Collapsible sections state
  const [usdtFloatOpen, setUsdtFloatOpen] = useState(true);
  const [aiRecommendationOpen, setAiRecommendationOpen] = useState(false);
  
  // AI Daily Target Recommendation
  const { 
    recommendation: aiTargetRecommendation, 
    loading: aiTargetLoading, 
    fetchRecommendation: fetchAITargetRecommendation,
    applyRecommendation: applyAITargetRecommendation,
  } = useDailyTargetRecommendation();

  // Base balance edit handlers
  const handleEditBaseBalance = useCallback((exchange: string) => {
    setEditingBaseBalance(exchange);
    setTempBaseBalance(baseBalancePerExchange[exchange] || DEFAULT_BASE_BALANCE);
  }, [baseBalancePerExchange]);

  const handleSaveBaseBalance = useCallback((exchange: string) => {
    const newBalances = {
      ...baseBalancePerExchange,
      [exchange]: tempBaseBalance
    };
    setBaseBalancePerExchange(newBalances);
    setEditingBaseBalance(null);
    toast.success(`Base balance updated for ${exchange}`, {
      description: `Locked: $${tempBaseBalance} (never traded)`,
    });
  }, [tempBaseBalance, setBaseBalancePerExchange, baseBalancePerExchange]);

  const handleCancelEditBaseBalance = useCallback(() => {
    setEditingBaseBalance(null);
  }, []);

  // Debounced prices for stable USDT calculation (prevent flashing)
  const [debouncedPrices, setDebouncedPrices] = useState(prices);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce price updates - only update every 5 seconds
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedPrices(prices);
    }, 5000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [prices]);

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

  // Build USDT float per exchange map for AI monitor
  const usdtFloatPerExchange = useMemo(() => {
    const map: Record<string, number> = {};
    usdtFloat.forEach(f => {
      map[f.exchange] = f.amount;
    });
    return map;
  }, [usdtFloat]);

  // AI Strategy Monitor hook with PhD-level optimization
  const {
    recommendations,
    strategyMetrics,
    suggestedPositionSize,
    optimalProfitPerExchange,
    tradeSpeedRecommendation,
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
    accountBalance: tradingMode === 'demo' ? virtualBalance : usdtFloat.reduce((sum, f) => sum + f.amount, 0),
    currentPositionSize: botConfig.amountPerTrade,
    currentTradeIntervalMs: botConfig.tradeIntervalMs,
    baseBalancePerExchange,
    usdtFloatPerExchange,
  });

  // Recommendation history for undo functionality
  const {
    history: recentlyApplied,
    addToHistory,
    removeFromHistory,
  } = useRecommendationHistory();

  // AUTO-APPLY high priority trade speed recommendations to protect profits
  useEffect(() => {
    if (tradeSpeedRecommendation?.priority === 'high') {
      // Auto-apply to protect profits
      setBotConfig(prev => ({
        ...prev,
        tradeIntervalMs: tradeSpeedRecommendation.suggestedIntervalMs
      }));
      
      toast.warning('🛡️ Auto-Protecting Profits', {
        description: `Trade speed adjusted: ${tradeSpeedRecommendation.reasoning}`,
        duration: 5000,
      });
    }
  }, [tradeSpeedRecommendation]);

  // Debounced USDT calculation to prevent flashing
  const suggestedUSDT = useMemo(() => {
    const dailyTarget = 40;
    const profitPerTrade = 1;

    // Use DEBOUNCED prices to prevent flashing
    const avgVolatility = debouncedPrices.length > 0
      ? debouncedPrices.slice(0, 10).reduce((sum, p) => sum + Math.abs(p.change_24h || 0), 0) / Math.min(debouncedPrices.length, 10) / 24
      : 0.5;

    const avgMovePercent = Math.max(avgVolatility / 100, 0.001);
    const avgPositionSize = profitPerTrade / avgMovePercent;
    const buffer = tradingMode === 'live' ? 1.5 : 1.3;

    const rawValue = Math.ceil(avgPositionSize * buffer);
    // Cap at MAX_USDT_ALLOCATION ($5000)
    return Math.min(rawValue, MAX_USDT_ALLOCATION);
  }, [debouncedPrices, tradingMode]);

  // CRITICAL: Fetch USDT float using SINGLE SOURCE OF TRUTH (exchangeBalances)
  useEffect(() => {
    async function fetchUsdtFloat() {
      if (!user) {
        setLoadingFloat(false);
        return;
      }

      // In Live mode, use REAL exchange balances from context (single source of truth)
      if (tradingMode === 'live' && exchangeBalances.length > 0) {
        const floatData: UsdtFloat[] = exchangeBalances
          .filter(b => b.usdtBalance > 0) // Only exchanges with balance
          .map(b => ({
            exchange: b.exchange,
            amount: b.usdtBalance, // REAL balance from database
            baseBalance: 0, // No locked base in live mode - all available
            availableFloat: b.usdtBalance,
            warning: b.isStale,
          }));
        
        setUsdtFloat(floatData);
        setLoadingFloat(false);
        return;
      }

      // Demo mode: Use virtual allocation
      if (tradingMode === 'demo') {
        const exchangeNames = activeExchanges.map(ex => ex.name);
        setUsdtFloat(exchangeNames.map(ex => {
          const allocation = EXCHANGE_ALLOCATION_PERCENTAGES[EXCHANGE_CONFIGS.find(c => c.name === ex)?.confidence || 'tier1'];
          const amount = Math.round(suggestedUSDT * allocation);
          return {
            exchange: ex,
            amount,
            baseBalance: 0,
            availableFloat: amount,
            warning: false,
          };
        }));
        setLoadingFloat(false);
        return;
      }

      // Fallback: Fetch from database directly
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

        // Only show exchanges WITH balance
        const exchangesWithBalance = Object.entries(floatByExchange)
          .filter(([_, amount]) => amount > 0)
          .map(([exchange, amount]) => ({
            exchange,
            amount,
            baseBalance: 0,
            availableFloat: amount,
            warning: false,
          }));

        setUsdtFloat(exchangesWithBalance);
      } catch (err) {
        console.error('Error fetching USDT float:', err);
      } finally {
        setLoadingFloat(false);
      }
    }

    fetchUsdtFloat();
  }, [user, suggestedUSDT, activeExchanges, tradingMode, exchangeBalances]);

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

  // KILL SWITCH - Emergency stop all bots and close positions
  const handleKillSwitch = async () => {
    if (!window.confirm('⚠️ KILL SWITCH: This will immediately stop ALL running bots and close ALL open positions. Continue?')) {
      return;
    }

    setKillingAll(true);
    const toastId = toast.loading('🔴 Kill switch activated...', { duration: Infinity });

    try {
      // Step 1: Stop all running bots
      const runningBots = bots.filter(b => b.status === 'running');
      for (const bot of runningBots) {
        await stopBot(bot.id);
        toast.loading(`Stopped ${bot.botName}...`, { id: toastId });
      }

      // Step 2: Close all positions (convert to USDT)
      toast.loading('Closing all positions...', { id: toastId });
      const { data, error } = await supabase.functions.invoke('convert-to-usdt', {
        body: { botId: 'kill-switch' },
      });

      if (error) throw error;

      const closedCount = data?.closedPositions?.filter((p: { success: boolean }) => p.success).length || 0;
      const totalRecovered = data?.totalUsdtRecovered || 0;

      toast.success('Kill switch complete', {
        id: toastId,
        description: `Stopped ${runningBots.length} bot(s), closed ${closedCount} position(s), recovered $${totalRecovered.toFixed(2)} USDT`,
        duration: 5000,
      });

      // Refresh data
      triggerSync();
      refetch();
    } catch (err) {
      console.error('Kill switch error:', err);
      toast.error('Kill switch failed', {
        id: toastId,
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setKillingAll(false);
    }
  };

  // Export trades to CSV
  const handleExportTrades = async () => {
    if (!user) return;

    setExportingTrades(true);
    try {
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_sandbox', tradingMode === 'demo')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      if (!trades || trades.length === 0) {
        toast.info('No trades to export');
        return;
      }

      exportToCSV(trades, `trades_${tradingMode}`, [
        { key: 'created_at', header: 'Date' },
        { key: 'pair', header: 'Pair' },
        { key: 'direction', header: 'Direction' },
        { key: 'entry_price', header: 'Entry Price' },
        { key: 'exit_price', header: 'Exit Price' },
        { key: 'amount', header: 'Amount ($)' },
        { key: 'leverage', header: 'Leverage' },
        { key: 'profit_loss', header: 'P&L ($)' },
        { key: 'profit_percentage', header: 'P&L (%)' },
        { key: 'exchange_name', header: 'Exchange' },
        { key: 'status', header: 'Status' },
      ]);

      toast.success(`Exported ${trades.length} trades to CSV`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export trades');
    } finally {
      setExportingTrades(false);
    }
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
          {/* Export Trades CSV */}
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs gap-1 hidden md:flex"
            onClick={handleExportTrades}
            disabled={exportingTrades}
          >
            {exportingTrades ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            Export CSV
          </Button>
          {/* KILL SWITCH - Emergency Stop */}
          {(spotBot || leverageBot) && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs gap-1 hidden md:flex bg-red-600 hover:bg-red-700 animate-pulse"
              onClick={handleKillSwitch}
              disabled={killingAll}
            >
              {killingAll ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Power className="w-3 h-3" />
              )}
              KILL SWITCH
            </Button>
          )}
          {/* Close All Positions - Live Mode Only */}
          {tradingMode === 'live' && !spotBot && !leverageBot && (
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-xs gap-1 hidden md:flex"
              onClick={handleCloseAllPositions}
              disabled={closingPositions}
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

      {/* USDT Float by Exchange - Collapsible */}
      <Collapsible open={usdtFloatOpen} onOpenChange={setUsdtFloatOpen} className="card-terminal p-3 mb-3 flex-shrink-0">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer hover:bg-secondary/30 -m-3 p-3 rounded">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              {tradingMode === 'demo' ? 'Virtual USDT Allocation' : 'USDT Float by Exchange'}
            </h3>
            <div className="flex items-center gap-2">
              {/* USDT Cap Indicator */}
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
              </div>
              {usdtFloatOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          {loadingFloat ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {tradingMode === 'demo' ? (
                activeExchanges.slice(0, 5).map((config) => {
                  const allocation = EXCHANGE_ALLOCATION_PERCENTAGES[config.confidence];
                  const amount = Math.round(suggestedUSDT * allocation);
                  const baseBalance = baseBalancePerExchange[config.name] || DEFAULT_BASE_BALANCE;
                  const availableFloat = Math.max(0, amount - baseBalance);
                  return (
                    <TooltipProvider key={config.name}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col p-2 rounded bg-secondary/50 transition-all duration-500">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-foreground font-medium">{config.name}</span>
                              <Lock className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-muted-foreground">Available:</span>
                              <span className={cn("font-mono font-bold", availableFloat > 0 ? "text-primary" : "text-muted-foreground")}>
                                ${availableFloat.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Base ${baseBalance} locked</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })
              ) : (
                usdtFloat.length === 0 ? (
                  <div className="col-span-5 text-center py-2 text-muted-foreground text-xs">
                    No exchanges with balance. Connect exchanges in Settings.
                  </div>
                ) : (
                  usdtFloat.slice(0, 5).map((item) => (
                    <TooltipProvider key={item.exchange}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            "flex flex-col p-2 rounded bg-secondary/50",
                            item.warning && "border border-warning/50"
                          )}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-foreground font-medium">{item.exchange}</span>
                              {item.warning ? (
                                <AlertTriangle className="w-3 h-3 text-warning" />
                              ) : (
                                <Unlock className="w-3 h-3 text-primary" />
                              )}
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-muted-foreground">Balance:</span>
                              <span className="font-mono font-bold text-primary">
                                ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Real balance: ${item.amount.toFixed(2)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))
                )
              )}
            </div>
          )}

          {/* Total Vaulted Profits Display */}
          {Object.values(profitVault).reduce((sum, v) => sum + v, 0) > 0 && (
            <div className="flex justify-between items-center text-[10px] border-t border-border/50 pt-2 mt-2">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Lock className="h-3 w-3 text-primary" />
                Total Vaulted:
              </span>
              <span className="font-mono text-primary font-bold">
                ${Object.values(profitVault).reduce((sum, v) => sum + v, 0).toFixed(2)}
              </span>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* AI Recommendation - Collapsible (default collapsed) */}
      <Collapsible open={aiRecommendationOpen} onOpenChange={setAiRecommendationOpen} className="card-terminal p-3 mb-3 flex-shrink-0">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer hover:bg-secondary/30 -m-3 p-3 rounded">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-foreground">AI Daily Target Recommendation</span>
              {aiTargetRecommendation && (
                <Badge variant="outline" className="text-[8px] h-4 border-primary text-primary">
                  ${aiTargetRecommendation.dailyTarget}/day
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  const floatData = usdtFloat.map(f => ({
                    exchange: f.exchange,
                    amount: f.amount,
                    baseBalance: 0,
                    availableFloat: f.amount,
                  }));
                  fetchAITargetRecommendation({
                    usdtFloat: floatData,
                    historicalHitRate: combinedHitRate,
                    averageProfitPerTrade: botConfig.profitPerTrade,
                    tradingHoursPerDay: 8,
                    riskTolerance: 'moderate',
                  });
                  setAiRecommendationOpen(true);
                }}
                disabled={aiTargetLoading || usdtFloat.length === 0}
              >
                {aiTargetLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Get
              </Button>
              {aiRecommendationOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          {aiTargetRecommendation ? (
            <div className="p-2 rounded bg-primary/10 border border-primary/20">
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Daily Target</div>
                  <div className="text-sm font-bold text-primary">${aiTargetRecommendation.dailyTarget}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Profit/Trade</div>
                  <div className="text-sm font-bold text-primary">${aiTargetRecommendation.profitPerTrade.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground">Confidence</div>
                  <div className={cn(
                    "text-sm font-bold",
                    aiTargetRecommendation.confidence >= 80 ? "text-primary" :
                    aiTargetRecommendation.confidence >= 60 ? "text-warning" : "text-destructive"
                  )}>
                    {aiTargetRecommendation.confidence}%
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">
                {aiTargetRecommendation.reasoning}
              </p>
              <Button
                size="sm"
                className="w-full h-6 text-xs gap-1"
                onClick={() => {
                  applyAITargetRecommendation((target, profit) => {
                    setBotConfig(prev => ({
                      ...prev,
                      dailyTarget: target,
                      profitPerTrade: profit,
                    }));
                  });
                }}
              >
                <Target className="w-3 h-3" />
                Apply Recommendation
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Click "Get" to fetch AI recommendation based on your current balance.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Main Content Grid - Scrollable */}
      <div className={cn(
        "flex-1 min-h-0 overflow-y-auto",
        isMobile && "hidden"
      )}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pb-3">
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
            onAuditGenerated={(report, charts) => {
              setAuditReport(report);
              setDashboards(charts);
            }}
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
            onAuditGenerated={(report, charts) => {
              setAuditReport(report);
              setDashboards(charts);
            }}
          />
        </div>

        {/* Middle Column - AI Strategy Panel + Audit Dashboard + Analytics Dashboard */}
        <div className="lg:col-span-4 flex flex-col gap-3 overflow-hidden">
          {/* AI Strategy Panel */}
          <div className="min-h-[280px] flex-shrink-0">
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
          
          {/* Audit Dashboard Panel */}
          {(auditReport || dashboards) && (
            <div className="flex-shrink-0">
              <AuditDashboardPanel
                auditReport={auditReport}
                dashboards={dashboards}
                totalVaultedProfits={Object.values(profitVault).reduce((a, b) => a + b, 0)}
                sessionStartBalance={{}}
              />
            </div>
          )}
          
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
