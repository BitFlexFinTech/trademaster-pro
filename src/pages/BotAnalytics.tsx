import { useState, useMemo, useCallback } from 'react';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useAIStrategyMonitor } from '@/hooks/useAIStrategyMonitor';
import { useAdaptiveTradingEngine } from '@/hooks/useAdaptiveTradingEngine';
import { useTradingMode, DEFAULT_BASE_BALANCE } from '@/contexts/TradingModeContext';
import { useRecommendationHistory } from '@/hooks/useRecommendationHistory';
import { AIStrategyPanel } from '@/components/bots/AIStrategyPanel';
import { RiskManagementPanel } from '@/components/bots/RiskManagementPanel';
import { SessionDashboard } from '@/components/bots/SessionDashboard';
import { SpreadMonitor } from '@/components/bots/SpreadMonitor';
import { DailyPnLChart } from '@/components/bots/DailyPnLChart';
import { BotAnalyticsDashboard } from '@/components/bots/BotAnalyticsDashboard';
import { BotPerformanceDashboard } from '@/components/bots/BotPerformanceDashboard';
import { TradeDistributionChart } from '@/components/bots/TradeDistributionChart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Shield, BarChart3, TrendingUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export default function BotAnalytics() {
  const { bots } = useBotRuns();
  const { mode: tradingMode, virtualBalance, baseBalancePerExchange } = useTradingMode();
  
  // Find active bots
  const spotBot = bots.find(b => b.botName === 'GreenBack Spot' && b.status === 'running');
  const leverageBot = bots.find(b => b.botName === 'GreenBack Leverage' && b.status === 'running');
  const activeBot = spotBot || leverageBot;
  
  // Calculate combined metrics
  const currentPnL = (spotBot?.currentPnl || 0) + (leverageBot?.currentPnl || 0);
  const tradesExecuted = (spotBot?.tradesExecuted || 0) + (leverageBot?.tradesExecuted || 0);
  const combinedHitRate = tradesExecuted > 0
    ? ((spotBot?.tradesExecuted || 0) * (spotBot?.hitRate || 0) + (leverageBot?.tradesExecuted || 0) * (leverageBot?.hitRate || 0)) / tradesExecuted
    : 70;

  // Bot config state
  const [botConfig, setBotConfig] = useState(() => {
    const saved = localStorage.getItem('greenback-bot-settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* ignore */ }
    }
    return {
      profitPerTrade: 0.50,
      amountPerTrade: 100,
      perTradeStopLoss: 0.10,
    };
  });

  // Adaptive Trading Engine
  const {
    portfolioMetrics,
    positionSizing,
    drawdownAlertLevel,
    positionReductionReasons,
  } = useAdaptiveTradingEngine({
    currentHitRate: combinedHitRate,
    dailyTarget: activeBot?.dailyTarget || 40,
    currentPnL,
    isRunning: !!activeBot,
  });

  // AI Strategy Monitor
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
    accountBalance: tradingMode === 'demo' ? virtualBalance : 1000,
    currentPositionSize: botConfig.amountPerTrade,
    currentTradeIntervalMs: 60000,
    baseBalancePerExchange,
    usdtFloatPerExchange: {},
  });

  // Recommendation history
  const { history: recentlyApplied, addToHistory, removeFromHistory } = useRecommendationHistory();

  // Handlers
  const handleReduceRisk = useCallback(() => {
    setBotConfig((prev: any) => ({
      ...prev,
      amountPerTrade: Math.max(10, prev.amountPerTrade * 0.5),
    }));
    toast.success('Risk reduced', { description: 'Position size halved' });
  }, []);

  const handlePauseAllBots = useCallback(async () => {
    toast.info('Pause not available from analytics page', { description: 'Go to Bots page to control bots' });
  }, []);

  const handleAIRecommendation = useCallback(async (rec: any) => {
    addToHistory(rec.id, rec.type, rec.title, rec.currentValue, rec.suggestedValue);
    await applyAIRecommendation(rec);
    toast.success(`Applied: ${rec.title}`);
  }, [applyAIRecommendation, addToHistory]);

  const handleUndoRecommendation = useCallback(async (rec: any) => {
    removeFromHistory(rec.id);
    toast.success('Change undone');
  }, [removeFromHistory]);

  return (
    <div className="h-full flex flex-col overflow-hidden p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2">
            <Link to="/bots">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Bots
            </Link>
          </Button>
          <Brain className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Bot Analytics</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="strategy" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
          <TabsTrigger value="strategy" className="text-xs gap-1">
            <Brain className="w-3 h-3" />
            Strategy
          </TabsTrigger>
          <TabsTrigger value="risk" className="text-xs gap-1">
            <Shield className="w-3 h-3" />
            Risk & Session
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1">
            <BarChart3 className="w-3 h-3" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="spreads" className="text-xs gap-1">
            <TrendingUp className="w-3 h-3" />
            Spreads & PnL
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-auto mt-4">
          <TabsContent value="strategy" className="m-0 h-full">
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
          </TabsContent>

          <TabsContent value="risk" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RiskManagementPanel
                currentDrawdown={portfolioMetrics.drawdownPercent}
                maxDrawdown={15}
                currentRiskPercent={positionSizing.riskPercent}
                recommendedSize={positionSizing.recommendedSize}
                baseSize={botConfig.amountPerTrade}
                adjustedForDrawdown={positionSizing.adjustedForDrawdown}
                reductionReasons={positionReductionReasons}
                alertLevel={drawdownAlertLevel}
                availableBalance={portfolioMetrics.availableBalance}
                isRunning={!!activeBot}
                onPauseTrading={handlePauseAllBots}
                onReduceRisk={handleReduceRisk}
              />
              <SessionDashboard />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BotAnalyticsDashboard />
              <BotPerformanceDashboard />
            </div>
            {/* TradeDistributionChart removed - requires data prop */}
          </TabsContent>

          <TabsContent value="spreads" className="m-0 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SpreadMonitor />
              <div className="h-[300px]">
                <DailyPnLChart />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
