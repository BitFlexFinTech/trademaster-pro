import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useTradingMode, MAX_USDT_ALLOCATION, DEFAULT_BASE_BALANCE } from '@/contexts/TradingModeContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useConnectedExchanges } from '@/hooks/useConnectedExchanges';
import { useNavigate, Link } from 'react-router-dom';
import { useAIStrategyMonitor } from '@/hooks/useAIStrategyMonitor';
import { useRecommendationHistory } from '@/hooks/useRecommendationHistory';
import { useDailyTargetRecommendation } from '@/hooks/useDailyTargetRecommendation';
import { useEmergencyKillSwitch } from '@/hooks/useEmergencyKillSwitch';
import { useMLConfidence } from '@/hooks/useMLConfidence';
import { useOpenPositionMonitor } from '@/hooks/useOpenPositionMonitor';
import { useOnboardingTips } from '@/hooks/useOnboardingTips';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, DollarSign, Loader2, RefreshCw, BarChart3, XCircle, AlertTriangle, Wifi, WifiOff, Download, Power, Lock, Unlock, Edit2, Brain, Sparkles, Target, TrendingUp, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, exportToCSV } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StickyPnLBar, BotFilter } from '@/components/bots/StickyPnLBar';
import { BotCard } from '@/components/bots/BotCard';
import { BotCardSkeleton } from '@/components/bots/BotCardSkeleton';
import { BotMicroCard } from '@/components/bots/BotMicroCard';
import { ConnectionStatusIndicator } from '@/components/bots/ConnectionStatusIndicator';
import { BotAnalyticsDashboard } from '@/components/bots/BotAnalyticsDashboard';
import { BotPerformanceDashboard } from '@/components/bots/BotPerformanceDashboard';
import { DailyPnLChart } from '@/components/bots/DailyPnLChart';
import { BotAnalysisModal } from '@/components/bots/BotAnalysisModal';
import { BotComparisonView } from '@/components/bots/BotComparisonView';
import { BotsMobileDrawer } from '@/components/bots/BotsMobileDrawer';
import { BotSettingsDrawer } from '@/components/bots/BotSettingsDrawer';
import { AIStrategyPanel } from '@/components/bots/AIStrategyPanel';
import { AuditDashboardPanel } from '@/components/bots/AuditDashboardPanel';
import { EmergencyKillBanner } from '@/components/bots/EmergencyKillBanner';
import { RealTimeProfitDashboard } from '@/components/bots/RealTimeProfitDashboard';
import { RiskManagementPanel } from '@/components/bots/RiskManagementPanel';
import { SpreadMonitor } from '@/components/bots/SpreadMonitor';
import { SessionDashboard } from '@/components/bots/SessionDashboard';
import { BalanceRequirementBanner } from '@/components/bots/BalanceRequirementBanner';
// ProfitEnginePanel moved to BotAnalytics
import { StuckTradesBanner } from '@/components/bots/StuckTradesBanner';
import { LivePnLDashboard } from '@/components/bots/LivePnLDashboard';
import { ProfitWithdrawalChart } from '@/components/bots/ProfitWithdrawalChart';
import { RegimeTransitionChart } from '@/components/bots/RegimeTransitionChart';
import { RegimeHistorySummaryCard } from '@/components/bots/RegimeHistorySummaryCard';
import { ActivityTerminal } from '@/components/bots/ActivityTerminal';
// AIStrategyDashboard removed per user request
import { ExchangeStatisticsPanel } from '@/components/bots/ExchangeStatisticsPanel';
import { CumulativeProfitChart } from '@/components/bots/CumulativeProfitChart';
import { OpenPositionsDashboard } from '@/components/bots/OpenPositionsDashboard';
import { LiveProfitCounter } from '@/components/bots/LiveProfitCounter';
import { ProfitBreakdownDashboard } from '@/components/bots/ProfitBreakdownDashboard';
import { ExchangeSettingsPanel } from '@/components/bots/ExchangeSettingsPanel';
import { useAutoCompound } from '@/hooks/useAutoCompound';

import { useRegimeTransitionNotifier } from '@/hooks/useRegimeTransitionNotifier';
import { useBotStrategyAI } from '@/hooks/useBotStrategyAI';
import { BalanceReconciliationBanner } from '@/components/bots/BalanceReconciliationBanner';
import { AIRecommendationsPanel } from '@/components/bots/AIRecommendationsPanel';
import { NotificationPopup, NotificationStack } from '@/components/bots/NotificationPopup';

import { BotsOnboardingTips } from '@/components/bots/BotsOnboardingTips';
import { ProfitTargetWizard } from '@/components/wizard/ProfitTargetWizard';
import { useAdaptiveTradingEngine } from '@/hooks/useAdaptiveTradingEngine';
import { MLConfidenceGauge } from '@/components/bots/MLConfidenceGauge';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuditReport } from '@/lib/selfAuditReporter';
import { DashboardCharts } from '@/lib/dashboardGenerator';
import { toast } from 'sonner';
import { EXCHANGE_CONFIGS, EXCHANGE_ALLOCATION_PERCENTAGES, TOP_PAIRS, EXCHANGE_MINIMUMS, getExchangeMinimum } from '@/lib/exchangeConfig';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

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
    recalculateBotPnl,
    refetch,
    analyzeBot,
    analysisData,
    analysisLoading,
    showAnalysisModal,
    setShowAnalysisModal,
    analyzedBotName,
  } = useBotRuns();
  const { prices, wsConnected, getPrice } = useRealtimePrices();
  const { wsState } = useBinanceWebSocket();
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
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  
  // Audit Dashboard state
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [dashboards, setDashboards] = useState<DashboardCharts | null>(null);
  
  // Collapsible sections state - collapsed by default per user request
  const [usdtFloatOpen, setUsdtFloatOpen] = useState(false);
  const [regimeChartOpen, setRegimeChartOpen] = useState(false);
  
  // Filter state for micro-cards grid
  const [activeFilter, setActiveFilter] = useState<BotFilter>('all');
  
  // Dismissed notifications state
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const dismissNotification = useCallback((id: string) => {
    setDismissedNotifications(prev => new Set([...prev, id]));
  }, []);
  
  // Profit Target Wizard state
  const [showProfitWizard, setShowProfitWizard] = useState(false);
  
  // Onboarding tips for first-time visitors
  const { hasSeenBotsTips, markAsSeen } = useOnboardingTips();
  
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

  // Bot configuration state - LOAD FROM LOCALSTORAGE ON MOUNT
  // FIXED: Enforce $333 minimum position size for $1 profit strategy
  const FIXED_POSITION_SIZE = 333; // $333 per trade for $1 profit
  const loadSavedBotConfig = () => {
    const saved = localStorage.getItem('greenback-bot-settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          dailyTarget: parsed.dailyTarget ?? 20,
          // ENFORCE $1 minimum profit per trade
          profitPerTrade: Math.max(parsed.profitPerTrade ?? 1.00, 1.00),
          // ENFORCE $333 minimum position size
          amountPerTrade: Math.max(parsed.amountPerTrade ?? FIXED_POSITION_SIZE, FIXED_POSITION_SIZE),
          tradeIntervalMs: parsed.tradeIntervalMs ?? 60000, // 60s default
          maxPositionSize: Math.max(parsed.maxPositionSize ?? FIXED_POSITION_SIZE, FIXED_POSITION_SIZE),
          dailyStopLoss: parsed.dailyStopLoss ?? 0, // No stop-loss in $1 strategy
          perTradeStopLoss: parsed.perTradeStopLoss ?? 0,
          focusPairs: parsed.focusPairs ?? [...TOP_PAIRS],
          leverageDefaults: parsed.leverageDefaults ?? EXCHANGE_CONFIGS.reduce((acc, config) => ({
            ...acc,
            [config.name]: Math.min(3, config.maxLeverage),
          }), {} as Record<string, number>),
          autoSpeedAdjust: parsed.autoSpeedAdjust ?? true,
          minProfitThreshold: parsed.minProfitThreshold ?? 1.00, // $1 target
          autoWithdrawOnTarget: parsed.autoWithdrawOnTarget ?? true,
        };
      } catch { /* ignore parse errors */ }
    }
    // Default values if no saved settings - $1 profit strategy with $333 position
    return {
      dailyTarget: 20,
      profitPerTrade: 1.00, // $1 minimum profit per trade
      amountPerTrade: FIXED_POSITION_SIZE, // FIXED: $333 position size for $1 profit
      tradeIntervalMs: 60000, // 60s default (user requested)
      maxPositionSize: FIXED_POSITION_SIZE, // FIXED: $333 per trade
      dailyStopLoss: 0, // No stop-loss
      perTradeStopLoss: 0, // Disabled
      focusPairs: [...TOP_PAIRS],
      leverageDefaults: EXCHANGE_CONFIGS.reduce((acc, config) => ({
        ...acc,
        [config.name]: Math.min(3, config.maxLeverage),
      }), {} as Record<string, number>),
      autoSpeedAdjust: true,
      minProfitThreshold: 1.00, // $1 target
      autoWithdrawOnTarget: true, // Auto-withdraw when daily target is reached
    };
  };
  
  const [botConfig, setBotConfig] = useState(loadSavedBotConfig);
  
  // Import centralized exchange minimums from config

  // CRITICAL: Sync bot config from database on mount and subscribe to realtime updates
  useEffect(() => {
    if (!user) return;
    
    // Fetch initial config from database
    const fetchDbConfig = async () => {
      const { data, error } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (data && !error) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BOT CONFIG] Loaded from database:', data);
        }
        setBotConfig(prev => {
          const newConfig = {
            ...prev,
            dailyTarget: data.daily_target ?? prev.dailyTarget,
            profitPerTrade: data.profit_per_trade ?? prev.profitPerTrade,
            amountPerTrade: data.amount_per_trade ?? prev.amountPerTrade,
            tradeIntervalMs: data.trade_interval_ms ?? prev.tradeIntervalMs,
            perTradeStopLoss: data.per_trade_stop_loss ?? prev.perTradeStopLoss,
            minProfitThreshold: data.min_profit_threshold ?? prev.minProfitThreshold,
            focusPairs: data.focus_pairs || prev.focusPairs,
          };
          // Also save to localStorage for consistency
          localStorage.setItem('greenback-bot-settings', JSON.stringify(newConfig));
          return newConfig;
        });
      }
    };
    
    fetchDbConfig();
    
    // Subscribe to realtime updates for bot_config changes (postgres changes + broadcast)
    const channel = supabase
      .channel('bot-config-sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bot_config',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BOT CONFIG] Postgres change received:', payload);
        }
        const newConfig = payload.new as any;
        if (newConfig) {
          setBotConfig(prev => {
            const updatedConfig = {
              ...prev,
              dailyTarget: newConfig.daily_target ?? prev.dailyTarget,
              profitPerTrade: newConfig.profit_per_trade ?? prev.profitPerTrade,
              amountPerTrade: newConfig.amount_per_trade ?? prev.amountPerTrade,
              tradeIntervalMs: newConfig.trade_interval_ms ?? prev.tradeIntervalMs,
              dailyStopLoss: newConfig.daily_stop_loss ?? prev.dailyStopLoss,
              perTradeStopLoss: newConfig.per_trade_stop_loss ?? prev.perTradeStopLoss,
              minProfitThreshold: newConfig.min_profit_threshold ?? prev.minProfitThreshold,
              focusPairs: newConfig.focus_pairs || prev.focusPairs,
            };
            localStorage.setItem('greenback-bot-settings', JSON.stringify(updatedConfig));
            return updatedConfig;
          });
          toast.success('🎯 Bot config synced!', {
            description: `Daily: $${newConfig.daily_target}, Profit: $${newConfig.profit_per_trade?.toFixed(2)}`,
          });
        }
      })
      // CRITICAL FIX: Also listen for broadcast events for immediate sync
      .on('broadcast', { event: 'config_changed' }, (payload) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BOT CONFIG] Broadcast received:', payload);
        }
        const data = payload.payload as any;
        if (data) {
          setBotConfig(prev => {
            const updatedConfig = {
              ...prev,
              dailyTarget: data.dailyTarget ?? prev.dailyTarget,
              profitPerTrade: data.profitPerTrade ?? prev.profitPerTrade,
              amountPerTrade: data.amountPerTrade ?? prev.amountPerTrade,
              tradeIntervalMs: data.tradeIntervalMs ?? prev.tradeIntervalMs,
              dailyStopLoss: data.dailyStopLoss ?? prev.dailyStopLoss,
              perTradeStopLoss: data.perTradeStopLoss ?? prev.perTradeStopLoss,
              minProfitThreshold: data.minProfitThreshold ?? prev.minProfitThreshold,
              focusPairs: data.focusPairs || prev.focusPairs,
            };
            localStorage.setItem('greenback-bot-settings', JSON.stringify(updatedConfig));
            return updatedConfig;
          });
        }
      })
      .subscribe();
    
    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [user]);

  // Auto-calculate stop loss when profit per trade changes (80% lower = 20% of profit)
  useEffect(() => {
    setBotConfig(prev => ({
      ...prev,
      perTradeStopLoss: prev.profitPerTrade * 0.2
    }));
  }, [botConfig.profitPerTrade]);

  // Persist botConfig to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('greenback-bot-settings', JSON.stringify(botConfig));
  }, [botConfig]);

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
  
  // Regime transition notifier - alerts when regime changes (must be after activeBot is defined)
  useRegimeTransitionNotifier('BTCUSDT', !!activeBot);
  
  const currentPnL = (spotBot?.currentPnl || 0) + (leverageBot?.currentPnl || 0);
  const tradesExecuted = (spotBot?.tradesExecuted || 0) + (leverageBot?.tradesExecuted || 0);
  const combinedHitRate = tradesExecuted > 0
    ? ((spotBot?.tradesExecuted || 0) * (spotBot?.hitRate || 0) + (leverageBot?.tradesExecuted || 0) * (leverageBot?.hitRate || 0)) / tradesExecuted
    : 70;
  
  // Running bot count for sticky P&L bar
  const runningBotCount = [spotBot, leverageBot].filter(Boolean).length;
  
  // Filter historical bots based on active filter
  const filteredHistoricalBots = useMemo(() => {
    const historicalBots = bots.filter(b => b.status === 'stopped' && b.id !== spotBot?.id && b.id !== leverageBot?.id);
    switch (activeFilter) {
      case 'running': return []; // Historical bots are never running
      case 'stopped': return historicalBots;
      case 'profitable': return historicalBots.filter(b => b.currentPnl > 0);
      case 'losing': return historicalBots.filter(b => b.currentPnl < 0);
      default: return historicalBots;
    }
  }, [activeFilter, bots, spotBot?.id, leverageBot?.id]);
  
  // Filter active bots (spot/leverage) based on filter
  const showSpotBot = useMemo(() => {
    if (!spotBot && activeFilter === 'running') return false;
    if (spotBot && activeFilter === 'stopped') return false;
    if (activeFilter === 'profitable' && (spotBot?.currentPnl || 0) <= 0) return !spotBot || spotBot.currentPnl > 0;
    if (activeFilter === 'losing' && (spotBot?.currentPnl || 0) >= 0) return !spotBot || spotBot.currentPnl < 0;
    return true;
  }, [activeFilter, spotBot]);
  
  const showLeverageBot = useMemo(() => {
    if (!leverageBot && activeFilter === 'running') return false;
    if (leverageBot && activeFilter === 'stopped') return false;
    if (activeFilter === 'profitable' && (leverageBot?.currentPnl || 0) <= 0) return !leverageBot || leverageBot.currentPnl > 0;
    if (activeFilter === 'losing' && (leverageBot?.currentPnl || 0) >= 0) return !leverageBot || leverageBot.currentPnl < 0;
    return true;
  }, [activeFilter, leverageBot]);

  // Adaptive Trading Engine for risk management
  const {
    portfolioMetrics,
    positionSizing,
    shouldContinueTrading,
    drawdownAlertLevel,
    positionReductionReasons,
  } = useAdaptiveTradingEngine({
    currentHitRate: combinedHitRate,
    dailyTarget: activeBot?.dailyTarget || 40,
    currentPnL,
    isRunning: !!activeBot,
  });

  // Handlers for risk management panel
  const handleReduceRisk = useCallback(() => {
    setBotConfig(prev => ({
      ...prev,
      amountPerTrade: Math.max(10, prev.amountPerTrade * 0.5),
    }));
    toast.success('Risk reduced', { description: 'Position size halved' });
  }, []);

  const handlePauseAllBots = useCallback(async () => {
    if (spotBot) await stopBot(spotBot.id);
    if (leverageBot) await stopBot(leverageBot.id);
    toast.info('Trading paused', { description: 'All bots stopped' });
  }, [spotBot, leverageBot, stopBot]);

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

  // Emergency Kill Switch integration
  const {
    config: killConfig,
    updateConfig: updateKillConfig,
    killStatus,
    triggerKill,
    lastKillEvent,
    isKilling,
  } = useEmergencyKillSwitch({
    currentPnL,
    onAutoKill: async (reason) => {
      // Refresh data after auto-kill
      await refetch();
      triggerSync();
    },
  });

  // ML Confidence tracking
  const {
    confidence: mlConfidence,
    accuracy: mlAccuracy,
    lastPrediction,
    tradesAnalyzed,
    fetchLatestPrediction,
    recordPredictionOutcome,
  } = useMLConfidence();

  // Open Position Monitor for sync button
  const { syncNow, isChecking: isSyncingPositions } = useOpenPositionMonitor({ enabled: false }); // Disabled here since MainLayout handles it
  const [openPositionCount, setOpenPositionCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);

  // Fetch open position count
  useEffect(() => {
    const fetchOpenPositionCount = async () => {
      if (!user) return;
      const { count } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'open');
      setOpenPositionCount(count || 0);
    };
    
    fetchOpenPositionCount();
    const interval = setInterval(fetchOpenPositionCount, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Handle sync now button
  const handleSyncPositions = async () => {
    setSyncingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: { checkOpenPositions: true, profitThreshold: 0.0001 }
      });
      
      if (error) throw error;
      
      const closed = data?.closedPositions || 0;
      const profits = data?.profitsTaken || 0;
      
      if (closed > 0) {
        toast.success(`${closed} Position(s) Synced`, {
          description: `${profits} profit(s) taken`,
        });
        triggerSync();
        refetch();
      } else if (data?.openPositions === 0) {
        toast.info('No open positions');
      } else {
        toast.info(`${data?.openPositions} position(s) still open`, {
          description: 'Waiting for profit threshold',
        });
      }
      
      setOpenPositionCount(data?.openPositions || 0);
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Failed to sync positions');
    } finally {
      setSyncingNow(false);
    }
  };

  // REMOVED: Auto-apply useEffects that were overwriting user settings
  // User must manually click "Apply" button to accept AI recommendations
  // This preserves user-configured values in localStorage

  // Fetch AI recommendations on page load and when balance changes
  useEffect(() => {
    if (user && usdtFloat.length > 0 && !aiTargetLoading && !spotBot && !leverageBot) {
      const totalBalance = usdtFloat.reduce((sum, f) => sum + f.amount, 0);
      if (totalBalance > 0) {
        fetchAITargetRecommendation({
          usdtFloat: usdtFloat.map(f => ({
            exchange: f.exchange,
            amount: f.amount,
            baseBalance: f.baseBalance,
            availableFloat: f.availableFloat,
          })),
          historicalHitRate: combinedHitRate || 70,
          averageProfitPerTrade: botConfig.profitPerTrade,
          riskTolerance: 'moderate',
        });
      }
    }
  }, [user, usdtFloat.length, spotBot, leverageBot]);

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
  // Uses TOTAL VALUE (all assets × prices), not just USDT
  useEffect(() => {
    async function fetchUsdtFloat() {
      if (!user) {
        setLoadingFloat(false);
        return;
      }

      // In Live mode, use REAL exchange balances from context (single source of truth)
      // CRITICAL: Use totalValue (all assets), NOT just usdtBalance
      if (tradingMode === 'live' && exchangeBalances.length > 0) {
        const floatData: UsdtFloat[] = exchangeBalances
          .filter(b => b.totalValue > 0.01) // STRICT: Only exchanges with total value > $0.01
          .map(b => ({
            exchange: b.exchange,
            amount: b.totalValue, // TOTAL VALUE of all assets (BTC, ETH, etc. × prices)
            baseBalance: 0,
            availableFloat: b.totalValue, // All available for trading
            warning: b.isStale,
          }));
        
        // BUG-008 FIX: Throttled logging - only in dev mode
        if (import.meta.env.DEV && floatData.length > 0 && Math.random() < 0.1) {
          console.log('[BOTS] USDT Float:', floatData);
        }
        
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

      // Fallback: Fetch ALL assets and calculate TOTAL VALUE
      try {
        // Fetch all holdings (not just stablecoins)
        const { data: holdings } = await supabase
          .from('portfolio_holdings')
          .select('exchange_name, asset_symbol, quantity')
          .eq('user_id', user.id);

        // Fetch prices
        const { data: priceData } = await supabase
          .from('price_cache')
          .select('symbol, price');
        
        const priceMap = new Map<string, number>();
        priceData?.forEach(p => {
          priceMap.set(p.symbol, p.price);
        });
        // Stablecoins = $1
        priceMap.set('USDT', 1);
        priceMap.set('USDC', 1);
        priceMap.set('USD', 1);

        // Calculate TOTAL VALUE per exchange
        const floatByExchange: Record<string, number> = {};
        holdings?.forEach(h => {
          if (h.exchange_name) {
            const price = priceMap.get(h.asset_symbol) || 0;
            const value = h.quantity * price;
            floatByExchange[h.exchange_name] = (floatByExchange[h.exchange_name] || 0) + value;
          }
        });

        // Only show exchanges WITH balance > $0.01
        const exchangesWithBalance = Object.entries(floatByExchange)
          .filter(([_, amount]) => amount > 0.01)
          .map(([exchange, amount]) => ({
            exchange,
            amount,
            baseBalance: 0,
            availableFloat: amount,
            warning: false,
          }));

        if (import.meta.env.DEV) {
          console.log('[BOTS FALLBACK] Total values:', exchangesWithBalance);
        }

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

  // Compute exchange balance requirements for the banner
  const exchangeBalanceRequirements = useMemo(() => {
    const minOrderSizes: Record<string, number> = {
      Binance: 5,
      Bybit: 5,
      OKX: 1,
      Kraken: 5,
      Nexo: 10,
      KuCoin: 1,
    };
    
    return exchangeBalances.map(b => ({
      exchange: b.exchange,
      freeUSDT: b.usdtBalance || 0,
      minRequired: minOrderSizes[b.exchange] || 5,
      hasCredentials: true, // If it's in exchangeBalances, it has credentials
      canTrade: (b.usdtBalance || 0) >= (minOrderSizes[b.exchange] || 5) * 1.1,
    }));
  }, [exchangeBalances]);

  // Handler to refresh balances
  const handleRefreshBalances = useCallback(async () => {
    setIsRefreshingBalances(true);
    try {
      await fetchExchangeBalances();
      await triggerSync();
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [fetchExchangeBalances, triggerSync]);

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
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
      {/* Notification Popups - Bottom Right */}
      <NotificationStack>
        {!dismissedNotifications.has('emergency-kill') && isKilling && (
          <NotificationPopup
            id="emergency-kill"
            type="error"
            title="Emergency Kill Active"
            message="All positions are being closed."
            onDismiss={dismissNotification}
          />
        )}
      </NotificationStack>

      <div className="flex-1 min-h-0 flex flex-col gap-3">
        {/* Top Panels: scroll if too tall (prevents bot cards from being pushed off-screen) */}
        <div className="max-h-[45vh] overflow-y-auto pr-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 md:gap-3">
              <Bot className="w-5 h-5 text-primary" />
              <h1 className="text-base md:text-lg font-bold text-foreground">Trading Bots</h1>
              <span className="live-indicator text-xs hidden sm:inline">{activeBotCount} Active</span>
              {/* Connection Status Indicator */}
              <ConnectionStatusIndicator />
              <BotSettingsDrawer
                settings={botConfig}
                onSettingsChange={setBotConfig}
                disabled={!!spotBot || !!leverageBot}
              />
              {/* Profit Target Wizard Button */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 hidden md:flex bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                onClick={() => setShowProfitWizard(true)}
              >
                <Target className="w-3 h-3" />
                Profit Wizard
              </Button>
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
              {/* Sync Positions Button - Shows open position count */}
              {tradingMode === 'live' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={openPositionCount > 0 ? 'default' : 'outline'}
                        className={cn(
                          "h-6 text-xs gap-1 hidden md:flex",
                          openPositionCount > 0 && "bg-primary hover:bg-primary/90"
                        )}
                        onClick={handleSyncPositions}
                        disabled={syncingNow}
                      >
                        {syncingNow ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        Sync{openPositionCount > 0 && ` (${openPositionCount})`}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Check open positions and take profits</p>
                      {openPositionCount > 0 && (
                        <p className="text-xs text-muted-foreground">{openPositionCount} open position(s)</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                  refetch={refetch}
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

          {/* Onboarding Tips - First-time visitors only */}
          {!hasSeenBotsTips && (
            <BotsOnboardingTips
              onDismiss={markAsSeen}
              className="mb-3"
            />
          )}

          {/* Exchange Re-Connection Warning - Live Mode Only */}
          {tradingMode === 'live' && needsReconnection.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
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
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
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

          {/* Balance Requirement Banner - Live Mode Only */}
          {tradingMode === 'live' && hasValidCredentials && exchangeBalanceRequirements.length > 0 && (
            <BalanceRequirementBanner 
              balances={exchangeBalanceRequirements}
              onRefresh={handleRefreshBalances}
              isRefreshing={isRefreshingBalances}
            />
          )}

          {/* Low Balance Warning Banner - Critical Alert */}
          {tradingMode === 'live' && exchangeBalances && exchangeBalances.map((balanceInfo) => {
            const minRequired = 5; // $5 minimum for any trade
            const actualBalance = balanceInfo.usdtBalance || 0;
            const isLowBalance = actualBalance > 0 && actualBalance < minRequired;
            
            if (!isLowBalance) return null;
            
            return (
              <div key={`low-balance-${balanceInfo.exchange}`} className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-destructive">
                      Insufficient Balance on {balanceInfo.exchange}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Current: <span className="font-mono font-medium text-destructive">${actualBalance.toFixed(2)}</span> USDT | 
                      Minimum Required: <span className="font-mono font-medium">${minRequired}</span> USDT
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Deposit at least <span className="font-medium text-foreground">${(minRequired - actualBalance).toFixed(2)}</span> more USDT to resume trading.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      fetchExchangeBalances();
                      toast.info('Refreshing balance...');
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Compact Cards Row - Portfolio, AI Target, AI Strategy */}
          <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
            {/* Portfolio Value by Exchange - Compact Inline Card with Tooltip */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="card-terminal p-2 cursor-help">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <DollarSign className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                        {tradingMode === 'demo' ? 'VIRTUAL' : 'PORTFOLIO'}
                      </span>
                      <span className="text-sm font-mono font-bold text-primary">
                        ${usdtFloat.reduce((sum, f) => sum + f.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    
                    {/* Exchange chips - inline, max 2 visible */}
                    <div className="flex items-center gap-1 overflow-hidden">
                      {(tradingMode === 'demo' ? activeExchanges.slice(0, 2) : usdtFloat.slice(0, 2)).map((item) => {
                        const exchange = tradingMode === 'demo' ? (item as typeof activeExchanges[0]).name : (item as UsdtFloat).exchange;
                        const amount = tradingMode === 'demo' 
                          ? Math.round(suggestedUSDT * EXCHANGE_ALLOCATION_PERCENTAGES[(item as typeof activeExchanges[0]).confidence])
                          : (item as UsdtFloat).amount;
                        return (
                          <Badge key={exchange} variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono shrink-0">
                            {exchange.slice(0, 3).toUpperCase()} ${amount >= 1000 ? `${(amount/1000).toFixed(1)}K` : amount.toFixed(0)}
                          </Badge>
                        );
                      })}
                      {(tradingMode === 'demo' ? activeExchanges.length : usdtFloat.length) > 2 && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 shrink-0">
                          +{(tradingMode === 'demo' ? activeExchanges.length : usdtFloat.length) - 2}
                        </Badge>
                      )}
                    </div>
                    
                    {/* Refresh button - Live mode only */}
                    {tradingMode === 'live' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchExchangeBalances();
                          toast.success('Refreshing portfolio...');
                        }}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-semibold mb-1">Exchange Breakdown</p>
                {(tradingMode === 'demo' ? activeExchanges : usdtFloat).map((item) => {
                  const exchange = tradingMode === 'demo' ? (item as typeof activeExchanges[0]).name : (item as UsdtFloat).exchange;
                  const amount = tradingMode === 'demo' 
                    ? Math.round(suggestedUSDT * EXCHANGE_ALLOCATION_PERCENTAGES[(item as typeof activeExchanges[0]).confidence])
                    : (item as UsdtFloat).amount;
                  return (
                    <p key={exchange} className="text-xs font-mono">
                      {exchange}: ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  );
                })}
                <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
                  Total: ${usdtFloat.reduce((sum, f) => sum + f.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </TooltipContent>
            </Tooltip>

            {/* AI Daily Target Recommendation - Compact Inline Card with Tooltip */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="card-terminal p-2 cursor-help">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Brain className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-xs font-semibold text-foreground whitespace-nowrap">AI TARGET</span>
                      {aiTargetRecommendation ? (
                        <>
                          <span className="text-sm font-mono font-bold text-primary">
                            ${aiTargetRecommendation.dailyTarget}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[9px] px-1 h-4",
                              aiTargetRecommendation.confidence >= 80 ? "border-primary text-primary" :
                              aiTargetRecommendation.confidence >= 60 ? "border-warning text-warning" : "border-destructive text-destructive"
                            )}
                          >
                            {aiTargetRecommendation.confidence}%
                          </Badge>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Click Get</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      {aiTargetRecommendation && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-5 text-[10px] px-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            applyAITargetRecommendation((target, profit) => {
                              setBotConfig(prev => ({
                                ...prev,
                                dailyTarget: target,
                                profitPerTrade: profit,
                              }));
                            });
                          }}
                        >
                          Apply
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 text-[10px] px-1.5"
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
                        }}
                        disabled={aiTargetLoading || usdtFloat.length === 0}
                      >
                        {aiTargetLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Get'}
                      </Button>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {aiTargetRecommendation ? (
                  <>
                    <p className="font-semibold mb-1">AI Daily Target Recommendation</p>
                    <p className="text-xs">Daily Target: <span className="font-mono font-bold">${aiTargetRecommendation.dailyTarget}</span></p>
                    <p className="text-xs">Profit/Trade: <span className="font-mono">${aiTargetRecommendation.profitPerTrade?.toFixed(2)}</span></p>
                    <p className="text-xs">Confidence: <span className="font-mono">{aiTargetRecommendation.confidence}%</span></p>
                    {aiTargetRecommendation.reasoning && (
                      <p className="text-xs text-muted-foreground mt-1 border-t pt-1">{aiTargetRecommendation.reasoning.slice(0, 100)}...</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Click "Get" to receive AI-powered daily target recommendations based on your capital and trading history.</p>
                )}
              </TooltipContent>
            </Tooltip>

            {/* AI Strategy Recommendations - Compact Inline Card (has built-in tooltip in modal) */}
            <AIRecommendationsPanel
              botConfig={botConfig}
              onApplyField={(field, value) => {
                setBotConfig(prev => {
                  const updatedConfig = { ...prev };
                  switch (field) {
                    case 'dailyTarget':
                      updatedConfig.dailyTarget = value;
                      break;
                    case 'profitPerTrade':
                      updatedConfig.profitPerTrade = value;
                      break;
                    case 'amountPerTrade':
                      updatedConfig.amountPerTrade = value;
                      break;
                    case 'tradeIntervalMs':
                      updatedConfig.tradeIntervalMs = value;
                      break;
                    case 'dailyStopLoss':
                      updatedConfig.dailyStopLoss = value;
                      break;
                    case 'perTradeStopLoss':
                      updatedConfig.perTradeStopLoss = value;
                      break;
                    case 'minProfitThreshold':
                      updatedConfig.minProfitThreshold = value;
                      break;
                    case 'focusPairs':
                      updatedConfig.focusPairs = value;
                      break;
                    default:
                      (updatedConfig as any)[field] = value;
                  }
                  localStorage.setItem('greenback-bot-settings', JSON.stringify(updatedConfig));
                  return updatedConfig;
                });
              }}
              onApplyAll={() => refetch()}
              compact={true}
            />
          </div>
          </TooltipProvider>

          {/* Sticky P&L Bar with Filter Chips */}
          <StickyPnLBar
            totalPnL={currentPnL}
            runningBotCount={runningBotCount}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />

          {/* Open Positions Dashboard - Real-time P&L */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <OpenPositionsDashboard className="md:col-span-3" />
            <LiveProfitCounter />
          </div>

          {/* AI Strategy Dashboard removed per user request */}

          {/* ============================================
             MICRO-CARDS GRID - High-density bot overview
             8-12 cards visible on 14" screen without scroll
             ============================================ */}
          <div 
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3"
            data-testid="bot-micro-grid"
          >
            {/* Spot Bot Micro Card - respects filter */}
            {showSpotBot && (
              <BotMicroCard
                botType="spot"
                botName="GreenBack Spot"
                isRunning={!!spotBot}
                currentPnL={spotBot?.currentPnl || 0}
                tradesExecuted={spotBot?.tradesExecuted || 0}
                hitRate={spotBot?.hitRate || 0}
                dailyTarget={botConfig.dailyTarget}
                lastTradeTime={spotBot?.startedAt ? new Date(spotBot.startedAt) : undefined}
                isLoading={loading}
                onStart={() => {
                  startBot(
                    'GreenBack Spot',
                    'spot',
                    botConfig.dailyTarget,
                    botConfig.profitPerTrade,
                    tradingMode === 'demo',
                    botConfig.amountPerTrade,
                    botConfig.tradeIntervalMs
                  );
                }}
                onStop={() => spotBot && handleStopBot(spotBot.id, 'GreenBack Spot')}
              />
            )}

            {/* Leverage Bot Micro Card - respects filter */}
            {showLeverageBot && (
              <BotMicroCard
                botType="leverage"
                botName="GreenBack Leverage"
                isRunning={!!leverageBot}
                currentPnL={leverageBot?.currentPnl || 0}
                tradesExecuted={leverageBot?.tradesExecuted || 0}
                hitRate={leverageBot?.hitRate || 0}
                dailyTarget={botConfig.dailyTarget}
                lastTradeTime={leverageBot?.startedAt ? new Date(leverageBot.startedAt) : undefined}
                isLoading={loading}
                onStart={() => {
                  startBot(
                    'GreenBack Leverage',
                    'leverage',
                    botConfig.dailyTarget,
                    botConfig.profitPerTrade,
                    tradingMode === 'demo',
                    botConfig.amountPerTrade,
                    botConfig.tradeIntervalMs
                  );
                }}
                onStop={() => leverageBot && handleStopBot(leverageBot.id, 'GreenBack Leverage')}
              />
            )}

            {/* Historical Bot Runs - filtered by active filter */}
            {filteredHistoricalBots
              .slice(0, 10) // Show up to 10 historical bots
              .map((bot) => (
                <BotMicroCard
                  key={bot.id}
                  botType={bot.mode}
                  botName={bot.botName}
                  isRunning={false}
                  currentPnL={bot.currentPnl}
                  tradesExecuted={bot.tradesExecuted}
                  hitRate={bot.hitRate}
                  dailyTarget={bot.dailyTarget}
                  lastTradeTime={bot.startedAt ? new Date(bot.startedAt) : undefined}
                  isLoading={false}
                  onStart={() => {
                    startBot(
                      bot.botName,
                      bot.mode,
                      bot.dailyTarget,
                      bot.profitPerTrade,
                      tradingMode === 'demo',
                      botConfig.amountPerTrade,
                      botConfig.tradeIntervalMs
                    );
                  }}
                  onStop={() => {}}
                  onClick={() => analyzeBot(bot.id, bot.botName)}
                />
              ))
            }
          </div>
        </div>

        {/* Bot Cards at TOP: Fixed height with internal scroll - page should NOT scroll */}
        <section className="flex-1 min-h-0 overflow-hidden" data-testid="bot-grid">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pb-3 pr-2">
            {/* Left Column - Bot Cards */}
            <ErrorBoundary
              fallback={
                <div className="lg:col-span-5 card-terminal p-4 text-center">
                  <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-foreground mb-2">Bot cards failed to load</p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    Reload Page
                  </Button>
                </div>
              }
            >
              <div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-min">
                {loading ? (
                  <>
                    <BotCardSkeleton />
                    <BotCardSkeleton />
                  </>
                ) : (
                  <>
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
                      autoSpeedAdjust={botConfig.autoSpeedAdjust}
                      onConfigChange={(key, value) => setBotConfig(prev => ({ ...prev, [key]: value }))}
                      isAnyBotRunning={!!spotBot || !!leverageBot}
                      onAuditGenerated={(report, charts) => {
                        setAuditReport(report);
                        setDashboards(charts);
                      }}
                      configDailyTarget={botConfig.dailyTarget}
                      configProfitPerTrade={botConfig.profitPerTrade}
                      configMinProfitThreshold={botConfig.minProfitThreshold}
                      refetch={refetch}
                      onRecalculatePnl={recalculateBotPnl}
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
                      autoSpeedAdjust={botConfig.autoSpeedAdjust}
                      onConfigChange={(key, value) => setBotConfig(prev => ({ ...prev, [key]: value }))}
                      isAnyBotRunning={!!spotBot || !!leverageBot}
                      onAuditGenerated={(report, charts) => {
                        setAuditReport(report);
                        setDashboards(charts);
                      }}
                      configDailyTarget={botConfig.dailyTarget}
                      configProfitPerTrade={botConfig.profitPerTrade}
                      configMinProfitThreshold={botConfig.minProfitThreshold}
                      refetch={refetch}
                      onRecalculatePnl={recalculateBotPnl}
                    />
                  </>
                )}
              </div>
            </ErrorBoundary>

            {/* Middle Column - Live P&L Dashboard */}
            <div className="lg:col-span-4 flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-hidden">
              {/* Live P&L Dashboard */}
              <LivePnLDashboard className="flex-1" />

              {/* Link to full analytics page */}
              <Button asChild variant="outline" className="h-8 gap-2">
                <Link to="/bot-analytics">
                  <Brain className="w-4 h-4" />
                  View Full Analytics (Trades, History, Execution)
                </Link>
              </Button>
            </div>

            {/* Right Column - Activity Terminal + Charts */}
            <div className="lg:col-span-3 flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-hidden">
              {/* Activity Terminal - Tall vertical strip */}
              <ActivityTerminal className="flex-1" maxHeight={300} />
              
              {/* Cumulative Profit Chart */}
              <CumulativeProfitChart />
            </div>
            </div>

            {/* Bottom Row - Statistics & Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-3">
              <div className="lg:col-span-4">
                <ExchangeStatisticsPanel />
              </div>
              <div className="lg:col-span-4">
                <ProfitBreakdownDashboard />
              </div>
              <div className="lg:col-span-4">
                <ExchangeSettingsPanel />
              </div>
            </div>
          </ScrollArea>
        </section>
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

      {/* Profit Target Wizard */}
      <ProfitTargetWizard
        open={showProfitWizard}
        onOpenChange={setShowProfitWizard}
      />
    </div>
  );
}
