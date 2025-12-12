import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

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

  return { 
    bots, 
    stats, 
    loading, 
    startBot, 
    stopBot, 
    updateBotPnl,
    refetch: fetchBots 
  };
}
