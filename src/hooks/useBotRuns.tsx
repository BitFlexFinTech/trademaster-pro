import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Use separate triggers for different purposes
  const { resetTrigger, syncTrigger, dailyResetTrigger, mode: tradingMode } = useTradingMode();
  const [bots, setBots] = useState<BotRun[]>([]);
  const [stats, setStats] = useState<BotStats>({ totalBots: 0, activeBots: 0, totalPnl: 0, totalTrades: 0 });
  const [loading, setLoading] = useState(true);
  const [analysisData, setAnalysisData] = useState<AnalysisData>({ analysis: null, stats: null });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analyzedBotName, setAnalyzedBotName] = useState('');
  
  // Debounce ref for realtime updates
  const debouncedFetchRef = useRef<NodeJS.Timeout | null>(null);

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

  const startBot = async (
    botName: string, 
    mode: 'spot' | 'leverage', 
    dailyTarget: number, 
    profitPerTrade: number, 
    isSandbox: boolean = true,
    amountPerTrade?: number,
    tradeIntervalMs?: number
  ) => {
    if (!user) {
      toast.error('Please login to start bots');
      return null;
    }

    try {
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

      // Log the config being used to start the bot
      console.log(`[useBotRuns] Starting ${botName} with config:`, {
        dailyTarget,
        profitPerTrade,
        amountPerTrade,
        tradeIntervalMs,
        isSandbox,
      });

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
      
      toast.success(`${botName} started`, {
        description: `Amount: $${amountPerTrade || 100}, Interval: ${((tradeIntervalMs || 60000) / 1000).toFixed(0)}s`,
      });
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

  const updateBotPnl = async (botId: string, pnl: number, trades: number, hitRate: number): Promise<{ success: boolean; savedPnl?: number; error?: string }> => {
    if (!user) {
      console.warn('[updateBotPnl] No user, skipping update');
      return { success: false, error: 'No user' };
    }

    // Get current values BEFORE update for verification
    const { data: before } = await supabase
      .from('bot_runs')
      .select('current_pnl, trades_executed, hit_rate')
      .eq('id', botId)
      .single();

    console.log(`[updateBotPnl] 📤 Syncing to DB:`, {
      botId,
      before: { pnl: before?.current_pnl, trades: before?.trades_executed },
      sending: { pnl: pnl.toFixed(4), trades, hitRate: hitRate.toFixed(2) },
    });

    try {
      const { data, error } = await supabase
        .from('bot_runs')
        .update({ 
          current_pnl: pnl,
          trades_executed: trades,
          hit_rate: hitRate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', botId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('[updateBotPnl] ❌ Database error:', error);
        return { success: false, error: error.message };
      }

      // VERIFY: Check if values actually changed
      const pnlMismatch = data && Math.abs(data.current_pnl - pnl) > 0.0001;
      if (pnlMismatch) {
        console.warn('[updateBotPnl] ⚠️ P&L MISMATCH! Sent:', pnl, 'Got:', data.current_pnl, '- Retrying...');
        
        // Retry once with explicit values
        const { data: retryData, error: retryError } = await supabase
          .from('bot_runs')
          .update({ current_pnl: pnl, trades_executed: trades, hit_rate: hitRate })
          .eq('id', botId)
          .eq('user_id', user.id)
          .select()
          .single();
          
        if (retryError) {
          console.error('[updateBotPnl] ❌ Retry failed:', retryError);
          return { success: false, savedPnl: data?.current_pnl, error: 'Retry failed' };
        }
        
        console.log('[updateBotPnl] ✅ Retry succeeded:', retryData?.current_pnl);
        return { success: true, savedPnl: retryData?.current_pnl };
      }

      console.log(`[updateBotPnl] ✅ DB updated successfully:`, {
        botId,
        savedPnl: data?.current_pnl,
        savedTrades: data?.trades_executed,
        savedHitRate: data?.hit_rate,
      });

      return { success: true, savedPnl: data?.current_pnl };
    } catch (error: any) {
      console.error('[updateBotPnl] ❌ Exception:', error);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  };

  // Cleanup orphan bot runs (running > 24 hours)
  const cleanupOrphanBots = useCallback(async () => {
    if (!user) return;
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('bot_runs')
      .update({ status: 'stopped', stopped_at: new Date().toISOString() })
      .eq('status', 'running')
      .lt('created_at', yesterday)
      .eq('user_id', user.id)
      .select();
      
    if (data && data.length > 0) {
      console.log(`[cleanupOrphanBots] ✅ Cleaned up ${data.length} orphan bot(s)`);
      toast.info(`Cleaned up ${data.length} stale bot session(s)`);
    }
    if (error) {
      console.error('[cleanupOrphanBots] ❌ Error:', error);
    }
  }, [user]);

  // Force recalculate P&L from actual trades
  const recalculateBotPnl = async (botId: string): Promise<{ success: boolean; newPnl: number; tradeCount: number }> => {
    if (!user) return { success: false, newPnl: 0, tradeCount: 0 };
    
    // Get bot's start time
    const { data: bot } = await supabase
      .from('bot_runs')
      .select('started_at, is_sandbox')
      .eq('id', botId)
      .single();
      
    if (!bot?.started_at) {
      return { success: false, newPnl: 0, tradeCount: 0 };
    }
    
    // Query all trades since bot started
    const { data: trades, error } = await supabase
      .from('trades')
      .select('profit_loss')
      .eq('user_id', user.id)
      .eq('is_sandbox', bot.is_sandbox ?? false)
      .gte('created_at', bot.started_at)
      .not('profit_loss', 'is', null);
      
    if (error) {
      console.error('[recalculateBotPnl] ❌ Error fetching trades:', error);
      return { success: false, newPnl: 0, tradeCount: 0 };
    }
    
    const totalPnl = trades?.reduce((sum, t) => sum + (t.profit_loss || 0), 0) || 0;
    const tradeCount = trades?.length || 0;
    const wins = trades?.filter(t => (t.profit_loss || 0) > 0).length || 0;
    const hitRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;
    
    // Update bot with recalculated values
    const { error: updateError } = await supabase
      .from('bot_runs')
      .update({ current_pnl: totalPnl, trades_executed: tradeCount, hit_rate: hitRate })
      .eq('id', botId)
      .eq('user_id', user.id);
      
    if (updateError) {
      console.error('[recalculateBotPnl] ❌ Error updating bot:', updateError);
      return { success: false, newPnl: totalPnl, tradeCount };
    }
    
    console.log(`[recalculateBotPnl] ✅ Recalculated: $${totalPnl.toFixed(2)} from ${tradeCount} trades`);
    toast.success(`P&L recalculated: $${totalPnl.toFixed(2)} from ${tradeCount} trades`);
    
    await fetchBots(); // Refresh UI
    return { success: true, newPnl: totalPnl, tradeCount };
  };

  useEffect(() => {
    fetchBots();
    cleanupOrphanBots(); // Clean up stale bots on mount
  }, [fetchBots, cleanupOrphanBots]);

  // Listen to FULL RESET trigger - clear bots completely (manual demo reset)
  useEffect(() => {
    if (resetTrigger > 0) {
      console.log('[useBotRuns] Reset trigger - clearing all bot data');
      setStats({ totalBots: 0, activeBots: 0, totalPnl: 0, totalTrades: 0 });
      setAnalysisData({ analysis: null, stats: null });
      // DON'T clear bots array - causes state flash. Just refetch.
      fetchBots();
    }
  }, [resetTrigger, fetchBots]);

  // Listen to SYNC trigger - just refetch without resetting state
  useEffect(() => {
    if (syncTrigger > 0) {
      console.log('[useBotRuns] Sync trigger - refetching bot data (preserving state)');
      fetchBots();
    }
  }, [syncTrigger, fetchBots]);

  // Listen to DAILY RESET trigger - 24-hour P&L reset
  useEffect(() => {
    if (dailyResetTrigger > 0) {
      console.log('[useBotRuns] Daily reset trigger - resetting P&L after 24 hours');
      setStats({ totalBots: 0, activeBots: 0, totalPnl: 0, totalTrades: 0 });
      setAnalysisData({ analysis: null, stats: null });
      // DON'T clear bots array - causes state flash. Just refetch.
      fetchBots();
    }
  }, [dailyResetTrigger, fetchBots]);

  // Subscribe to realtime updates with debounce to prevent rapid state churn
  useEffect(() => {
    if (!user) return;

    // Debounced fetch to prevent rapid updates
    const debouncedFetch = () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
      debouncedFetchRef.current = setTimeout(() => {
        fetchBots();
      }, 500); // Wait 500ms after last change before fetching
    };
    
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
          debouncedFetch(); // Use debounced fetch
        }
      )
      .subscribe();

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
          if (!newTrade.is_sandbox) {
            console.log(`🔴 LIVE TRADE: ${newTrade.pair}, P&L: $${newTrade.profit_loss?.toFixed(2)}`);
          }
          debouncedFetch(); // Use debounced fetch
        }
      )
      .subscribe();

    return () => {
      if (debouncedFetchRef.current) {
        clearTimeout(debouncedFetchRef.current);
      }
      supabase.removeChannel(botChannel);
      supabase.removeChannel(tradesChannel);
    };
  }, [user, fetchBots, tradingMode]);

  const analyzeBot = async (botId: string, botName: string) => {
    console.log(`📊 Starting AI analysis for bot ${botName} (${botId})...`);
    setAnalysisLoading(true);
    setShowAnalysisModal(true);
    setAnalyzedBotName(botName);
    
    try {
      console.log('📤 Invoking analyze-bot-performance edge function...');
      const { data, error } = await supabase.functions.invoke('analyze-bot-performance', {
        body: { botId }
      });

      if (error) {
        console.error('❌ AI analysis edge function error:', error);
        throw error;
      }

      console.log('✅ AI analysis completed:', data);
      
      if (data?.analysis) {
        toast.success('AI analysis ready');
      }

      setAnalysisData({
        analysis: data.analysis,
        stats: data.stats,
      });
    } catch (err) {
      console.error('❌ Analysis failed:', err);
      toast.error('Failed to analyze bot performance');
      setAnalysisData({ analysis: null, stats: null });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const stopBotWithAnalysis = async (botId: string, botName: string) => {
    if (!user) return;

    console.log(`🛑 Stopping bot ${botName} (${botId})...`);

    try {
      const { error } = await supabase
        .from('bot_runs')
        .update({ 
          status: 'stopped',
          stopped_at: new Date().toISOString(),
        })
        .eq('id', botId)
        .eq('user_id', user.id);

      if (error) {
        console.error('❌ Failed to update bot status:', error);
        throw error;
      }
      
      console.log('✅ Bot stopped successfully, triggering AI analysis...');
      toast.success(`${botName} stopped`);
      fetchBots();
      
      await analyzeBot(botId, botName);
    } catch (error) {
      console.error('❌ Error stopping bot:', error);
      toast.error('Failed to stop bot');
    }
  };

  const getSpotBot = () => bots.find(b => b.botName === 'GreenBack Spot' && b.status === 'running');
  const getLeverageBot = () => bots.find(b => b.botName === 'GreenBack Leverage' && b.status === 'running');
  
  const startSpotBot = (dailyTarget: number, profitPerTrade: number, isSandbox: boolean = true) => 
    startBot('GreenBack Spot', 'spot', dailyTarget, profitPerTrade, isSandbox);
  
  const startLeverageBot = (dailyTarget: number, profitPerTrade: number, isSandbox: boolean = true) => 
    startBot('GreenBack Leverage', 'leverage', dailyTarget, profitPerTrade, isSandbox);

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
      
      await fetchBots();
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
    recalculateBotPnl,
    cleanupOrphanBots,
    refetch: fetchBots,
    getSpotBot,
    getLeverageBot,
    startSpotBot,
    startLeverageBot,
    analyzeBot,
    analysisData,
    analysisLoading,
    showAnalysisModal,
    setShowAnalysisModal,
    analyzedBotName,
  };
}
