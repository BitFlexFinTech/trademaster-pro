import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface ExchangeBalance {
  exchange: string;
  asset: string;
  available: number;
  total: number;
  usdValue: number;
}

export interface HistoricalPerformance {
  totalTrades: number;
  winRate: number;
  avgProfitPerTrade: number;
  totalPnL: number;
  avgDailyPnL: number;
  maxDrawdown: number;
  tradingDays: number;
}

export interface RiskPreferences {
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  maxDailyLoss: number;
  maxTradesPerDay: number;
}

export interface RecommendedTarget {
  dailyTarget: number;
  profitPerTrade: number;
  tradesNeeded: number;
  confidence: number;
  reasoning: string;
}

export type WizardStep = 'balances' | 'performance' | 'risk' | 'review';

export function useProfitTargetWizard() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>('balances');
  const [loading, setLoading] = useState(false);
  
  // Step data
  const [balances, setBalances] = useState<ExchangeBalance[]>([]);
  const [performance, setPerformance] = useState<HistoricalPerformance | null>(null);
  const [riskPreferences, setRiskPreferences] = useState<RiskPreferences>({
    riskLevel: 'moderate',
    maxDailyLoss: 10,
    maxTradesPerDay: 50,
  });
  const [recommendation, setRecommendation] = useState<RecommendedTarget | null>(null);

  const totalBalance = balances.reduce((sum, b) => sum + b.usdValue, 0);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances');
      if (error) throw error;
      
      // Get portfolio holdings
      const { data: holdings } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('user_id', user?.id);
      
      // Get current prices
      const { data: prices } = await supabase
        .from('price_cache')
        .select('symbol, price');
      
      const priceMap = new Map(prices?.map(p => [p.symbol, p.price]) || []);
      
      const balanceData: ExchangeBalance[] = (holdings || []).map(h => ({
        exchange: h.exchange_name || 'Unknown',
        asset: h.asset_symbol,
        available: h.quantity,
        total: h.quantity,
        usdValue: h.asset_symbol === 'USDT' 
          ? h.quantity 
          : h.quantity * (priceMap.get(h.asset_symbol) || h.average_buy_price || 0),
      }));
      
      setBalances(balanceData);
    } catch (err) {
      console.error('Error fetching balances:', err);
      toast.error('Failed to fetch exchange balances');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const analyzePerformance = useCallback(async () => {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'closed')
        .gte('closed_at', thirtyDaysAgo);
      
      if (!trades || trades.length === 0) {
        setPerformance({
          totalTrades: 0,
          winRate: 0,
          avgProfitPerTrade: 0,
          totalPnL: 0,
          avgDailyPnL: 0,
          maxDrawdown: 0,
          tradingDays: 0,
        });
        return;
      }

      const wins = trades.filter(t => (t.profit_loss || 0) > 0).length;
      const totalPnL = trades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const avgProfit = totalPnL / trades.length;
      
      // Calculate trading days
      const tradingDates = new Set(trades.map(t => t.closed_at?.split('T')[0]));
      const tradingDays = tradingDates.size;
      
      // Calculate max drawdown
      let maxDrawdown = 0;
      let peak = 0;
      let runningPnL = 0;
      
      trades.sort((a, b) => new Date(a.closed_at || 0).getTime() - new Date(b.closed_at || 0).getTime());
      
      for (const trade of trades) {
        runningPnL += trade.profit_loss || 0;
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      setPerformance({
        totalTrades: trades.length,
        winRate: (wins / trades.length) * 100,
        avgProfitPerTrade: avgProfit,
        totalPnL,
        avgDailyPnL: tradingDays > 0 ? totalPnL / tradingDays : 0,
        maxDrawdown,
        tradingDays,
      });
    } catch (err) {
      console.error('Error analyzing performance:', err);
      toast.error('Failed to analyze trading history');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const calculateRecommendation = useCallback(async () => {
    setLoading(true);
    try {
      // Call the AI recommendation endpoint
      const { data, error } = await supabase.functions.invoke('recommend-daily-target', {
        body: {
          totalBalance,
          historicalWinRate: performance?.winRate || 70,
          avgProfitPerTrade: performance?.avgProfitPerTrade || 0.5,
          riskLevel: riskPreferences.riskLevel,
          maxDailyLoss: riskPreferences.maxDailyLoss,
        },
      });

      if (error) throw error;

      // Use AI recommendation or calculate locally
      const riskMultiplier = {
        conservative: 0.5,
        moderate: 1,
        aggressive: 1.5,
      }[riskPreferences.riskLevel];

      const baseDailyTarget = Math.max(10, totalBalance * 0.01 * riskMultiplier);
      const profitPerTrade = performance?.avgProfitPerTrade && performance.avgProfitPerTrade > 0
        ? Math.min(performance.avgProfitPerTrade, 2)
        : 0.5;
      const tradesNeeded = Math.ceil(baseDailyTarget / profitPerTrade);

      setRecommendation({
        dailyTarget: data?.dailyTarget || Math.round(baseDailyTarget),
        profitPerTrade: data?.profitPerTrade || profitPerTrade,
        tradesNeeded: data?.tradesNeeded || tradesNeeded,
        confidence: data?.confidence || (performance?.winRate || 70),
        reasoning: data?.reasoning || `Based on your $${totalBalance.toFixed(0)} balance and ${riskPreferences.riskLevel} risk profile`,
      });
    } catch (err) {
      console.error('Error calculating recommendation:', err);
      // Fallback to local calculation
      const riskMultiplier = { conservative: 0.5, moderate: 1, aggressive: 1.5 }[riskPreferences.riskLevel];
      const dailyTarget = Math.max(10, totalBalance * 0.01 * riskMultiplier);
      
      setRecommendation({
        dailyTarget: Math.round(dailyTarget),
        profitPerTrade: 0.5,
        tradesNeeded: Math.ceil(dailyTarget / 0.5),
        confidence: 70,
        reasoning: `Conservative estimate based on ${riskPreferences.riskLevel} risk level`,
      });
    } finally {
      setLoading(false);
    }
  }, [totalBalance, performance, riskPreferences]);

  const applyConfiguration = useCallback(async () => {
    if (!recommendation || !user) return false;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          daily_target: recommendation.dailyTarget,
          profit_per_trade: recommendation.profitPerTrade,
          daily_stop_loss: riskPreferences.maxDailyLoss,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      
      toast.success('Configuration Applied', {
        description: `Daily target set to $${recommendation.dailyTarget}`,
      });
      
      return true;
    } catch (err) {
      console.error('Error applying configuration:', err);
      toast.error('Failed to apply configuration');
      return false;
    } finally {
      setLoading(false);
    }
  }, [recommendation, user, riskPreferences]);

  const nextStep = useCallback(() => {
    const steps: WizardStep[] = ['balances', 'performance', 'risk', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }, [currentStep]);

  const prevStep = useCallback(() => {
    const steps: WizardStep[] = ['balances', 'performance', 'risk', 'review'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  }, [currentStep]);

  const reset = useCallback(() => {
    setCurrentStep('balances');
    setBalances([]);
    setPerformance(null);
    setRiskPreferences({ riskLevel: 'moderate', maxDailyLoss: 10, maxTradesPerDay: 50 });
    setRecommendation(null);
  }, []);

  return {
    currentStep,
    setCurrentStep,
    loading,
    balances,
    totalBalance,
    performance,
    riskPreferences,
    setRiskPreferences,
    recommendation,
    fetchBalances,
    analyzePerformance,
    calculateRecommendation,
    applyConfiguration,
    nextStep,
    prevStep,
    reset,
  };
}
