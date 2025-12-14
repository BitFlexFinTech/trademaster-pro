import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { toast } from 'sonner';

interface AnalysisReport {
  summary: string;
  insights: string[];
  recommendedProfitPerTrade: number;
  recommendedAmountPerTrade: number;
  improvements: string[];
}

interface AnalysisData {
  analysis: AnalysisReport | null;
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    hitRate: number;
  } | null;
}

interface BotRun {
  id: string;
  botName: string;
  mode: 'spot' | 'leverage';
  dailyTarget: number;
  profitPerTrade: number;
  status: 'running' | 'stopped' | 'paused';
  currentPnl: number;
  tradesExecuted: number;
  hitRate: number;
  maxDrawdown: number;
  startedAt: string | null;
}

interface BotStats {
  totalBots: number;
  activeBots: number;
  totalPnl: number;
  totalTrades: number;
}

export function useBotRuns() {
  const { user } = useAuth();
  const { resetTrigger, mode: tradingMode } = useTradingMode();
  const [bots, setBots] = useState<BotRun[]>([]);
  const [stats, setStats] = useState<BotStats>({ totalBots: 0, activeBots: 0, totalPnl: 0, totalTrades: 0 });
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<AnalysisData>({ analysis: null, stats: null });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analyzedBotName, setAnalyzedBotName] = useState('');

  const fetchBots = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const isSandbox = tradingMode === 'demo';

    try {
      const { data, error } = await supabase
        .from('bot_runs')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_sandbox', isSandbox)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedBots: BotRun[] = (data || []).map(b => ({
        id: b.id,
        botName: b.bot_name,
        mode: b.mode as 'spot' | 'leverage',
        dailyTarget: b.daily_target || 30,
        profitPerTrade: b.profit_per_trade || 1,
        status: b.status as 'running' | 'stopped' | 'paused',
        currentPnl: b.current_pnl || 0,
        tradesExecuted: b.trades_executed || 0,
        hitRate: b.hit_rate || 0,
        maxDrawdown: b.max_drawdown || 0,
        startedAt: b.started_at,
      }));

      setBots(mappedBots);
      
      const activeBots = mappedBots.filter(b => b.status === 'running');
      setStats({
        totalBots: mappedBots.length,
        activeBots: activeBots.length,
        totalPnl: mappedBots.reduce((sum, b) => sum + b.currentPnl, 0),
        totalTrades: mappedBots.reduce((sum, b) => sum + b.tradesExecuted, 0),
      });
    } catch (error) {
      console.error('Error fetching bot runs:', error);
    } finally {
      setLoading(false);
    }
  }, [user, tradingMode]);

  const startBot = async (botName: string, mode: 'spot' | 'leverage', dailyTarget: number, profitPerTrade: number, isSandbox: boolean = true) => {
    if (!user) {
      toast.error('Please login to start bots');
      return null;
    }

    try {
      // Check if bot with same name is already running - prevent duplicates
      const { data: existingBot } = await supabase
        .from('bot_runs')
        .select('*')
        .eq('user_id', user.id)
        .eq('bot_name', botName)
        .eq('status', 'running')
        .eq('is_sandbox', isSandbox)
        .single();

      if (existingBot) {
        toast.warning(`${botName} is already running`);
        return existingBot;
      }

      const { data, error } = await supabase
        .from('bot_runs')
        .insert({
          user_id: user.id,
          bot_name: botName,
          mode,
          daily_target: dailyTarget,
          profit_per_trade: profitPerTrade,
          status: 'running',
          started_at: new Date().toISOString(),
          is_sandbox: isSandbox,
        })
        .select()
        .single();

      if (error) throw error;
      
      toast.success(`${botName} started`);
      fetchBots();
      return data;
    } catch (error) {
      console.error('Error starting bot:', error);
      toast.error('Failed to start bot');
      return null;
    }
  };

  const stopBot = async (botId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('bot_runs')
        .update({ 
          status: 'stopped',
          stopped_at: new Date().toISOString(),
        })
        .eq('id', botId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('Bot stopped');
      fetchBots();
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  const updateBotPnl = async (botId: string, pnl: number, trades: number, hitRate: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('bot_runs')
        .update({ 
          current_pnl: pnl,
          trades_executed: trades,
          hit_rate: hitRate,
        })
        .eq('id', botId)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating bot P&L:', error);
    }
  };

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  // Listen to reset trigger - clear bots immediately
  useEffect(() => {
    if (resetTrigger > 0) {
      setBots([]);
      setStats({ totalBots: 0, activeBots: 0, totalPnl: 0, totalTrades: 0 });
      setAnalysisData({ analysis: null, stats: null });
      // Delay refetch to allow database deletes to complete
      setTimeout(() => {
        fetchBots();
      }, 500);
    }
  }, [resetTrigger, fetchBots]);

  // Subscribe to realtime updates for bot_runs AND trades tables
  useEffect(() => {
    if (!user) return;

    const isSandbox = tradingMode === 'demo';
    
    // Channel for bot_runs
    const botChannel = supabase
      .channel('bot-runs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_runs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('📊 Bot run update received:', payload.eventType);
          fetchBots();
        }
      )
      .subscribe();

    // Channel for trades - for Live mode real trade updates
    const tradesChannel = supabase
      .channel('trades-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newTrade = payload.new as { is_sandbox: boolean; pair: string; profit_loss: number };
          // Only log for non-sandbox trades (real trades)
          if (!newTrade.is_sandbox) {
            console.log(`🔴 LIVE TRADE: ${newTrade.pair}, P&L: $${newTrade.profit_loss?.toFixed(2)}`);
          }
          // Refetch to update metrics
          fetchBots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(botChannel);
      supabase.removeChannel(tradesChannel);
    };
  }, [user, fetchBots, tradingMode]);

  // Analyze bot performance
  const analyzeBot = async (botId: string, botName: string) => {
    setAnalysisLoading(true);
    setShowAnalysisModal(true);
    setAnalyzedBotName(botName);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-bot-performance', {
        body: { botId }
      });

      if (error) throw error;

      setAnalysisData({
        analysis: data.analysis,
        stats: data.stats,
      });
    } catch (err) {
      console.error('Analysis failed:', err);
      toast.error('Failed to analyze bot performance');
      setAnalysisData({ analysis: null, stats: null });
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Stop bot with automatic analysis
  const stopBotWithAnalysis = async (botId: string, botName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('bot_runs')
        .update({ 
          status: 'stopped',
          stopped_at: new Date().toISOString(),
        })
        .eq('id', botId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success('Bot stopped');
      fetchBots();
      
      // Trigger analysis after stopping
      await analyzeBot(botId, botName);
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  // Helper methods for specific bot types
  const getSpotBot = () => bots.find(b => b.botName === 'GreenBack Spot' && b.status === 'running');
  const getLeverageBot = () => bots.find(b => b.botName === 'GreenBack Leverage' && b.status === 'running');
  
  const startSpotBot = (dailyTarget: number, profitPerTrade: number, isSandbox: boolean = true) => 
    startBot('GreenBack Spot', 'spot', dailyTarget, profitPerTrade, isSandbox);
  
  const startLeverageBot = (dailyTarget: number, profitPerTrade: number, isSandbox: boolean = true) => 
    startBot('GreenBack Leverage', 'leverage', dailyTarget, profitPerTrade, isSandbox);

  // Update bot configuration (persists to database)
  const updateBotConfig = async (botId: string, config: { profitPerTrade?: number; dailyTarget?: number; stopLoss?: number }) => {
    if (!user) return;

    try {
      const updateData: any = {};
      if (config.profitPerTrade !== undefined) updateData.profit_per_trade = config.profitPerTrade;
      if (config.dailyTarget !== undefined) updateData.daily_target = config.dailyTarget;

      const { error } = await supabase
        .from('bot_runs')
        .update(updateData)
        .eq('id', botId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      await fetchBots(); // Refetch to sync all components
      return true;
    } catch (error) {
      console.error('Error updating bot config:', error);
      toast.error('Failed to update bot configuration');
      return false;
    }
  };

  return { 
    bots, 
    stats, 
    loading, 
    startBot, 
    stopBot,
    stopBotWithAnalysis,
    updateBotPnl,
    updateBotConfig,
    refetch: fetchBots,
    getSpotBot,
    getLeverageBot,
    startSpotBot,
    startLeverageBot,
    // Analysis state
    analyzeBot,
    analysisData,
    analysisLoading,
    showAnalysisModal,
    setShowAnalysisModal,
    analyzedBotName,
  };
}
