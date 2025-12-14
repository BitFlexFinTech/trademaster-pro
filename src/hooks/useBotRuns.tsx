import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
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

    try {
      const { data, error } = await supabase
        .from('bot_runs')
        .select('*')
        .eq('user_id', user.id)
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
  }, [user]);

  const startBot = async (botName: string, mode: 'spot' | 'leverage', dailyTarget: number, profitPerTrade: number) => {
    if (!user) {
      toast.error('Please login to start bots');
      return null;
    }

    try {
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

  // Subscribe to realtime updates for bot_runs table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('bot-runs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bot_runs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch bots when any change occurs
          fetchBots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchBots]);

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
  
  const startSpotBot = (dailyTarget: number, profitPerTrade: number) => 
    startBot('GreenBack Spot', 'spot', dailyTarget, profitPerTrade);
  
  const startLeverageBot = (dailyTarget: number, profitPerTrade: number) => 
    startBot('GreenBack Leverage', 'leverage', dailyTarget, profitPerTrade);

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
