import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';

export interface ProfitGoal {
  target: number;
  current: number;
  percent: number;
  tradesCount: number;
}

export interface Badge {
  id: string;
  badge_type: string;
  badge_name: string;
  earned_at: string;
  data?: Json;
}

export interface ProfitGoalsData {
  daily: ProfitGoal;
  weekly: ProfitGoal;
  monthly: ProfitGoal;
  streak: number;
  badges: Badge[];
  loading: boolean;
}

const DEFAULT_GOALS = {
  daily: 10,
  weekly: 70,
  monthly: 300,
};

export function useProfitGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<ProfitGoalsData>({
    daily: { target: DEFAULT_GOALS.daily, current: 0, percent: 0, tradesCount: 0 },
    weekly: { target: DEFAULT_GOALS.weekly, current: 0, percent: 0, tradesCount: 0 },
    monthly: { target: DEFAULT_GOALS.monthly, current: 0, percent: 0, tradesCount: 0 },
    streak: 0,
    badges: [],
    loading: true,
  });

  const fetchGoals = useCallback(async () => {
    if (!user) return;

    try {
      const now = new Date();
      const dayStart = startOfDay(now).toISOString();
      const dayEnd = endOfDay(now).toISOString();
      const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      // Fetch user's custom goal targets
      const { data: goalSettings } = await supabase
        .from('profit_goals')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const targets = {
        daily: goalSettings?.daily_target || DEFAULT_GOALS.daily,
        weekly: goalSettings?.weekly_target || DEFAULT_GOALS.weekly,
        monthly: goalSettings?.monthly_target || DEFAULT_GOALS.monthly,
      };

      // Fetch closed trades for each period
      const [dailyTrades, weeklyTrades, monthlyTrades, badges] = await Promise.all([
        supabase
          .from('trades')
          .select('profit_loss')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('closed_at', dayStart)
          .lte('closed_at', dayEnd),
        supabase
          .from('trades')
          .select('profit_loss')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('closed_at', weekStart)
          .lte('closed_at', weekEnd),
        supabase
          .from('trades')
          .select('profit_loss')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .gte('closed_at', monthStart)
          .lte('closed_at', monthEnd),
        supabase
          .from('profit_badges')
          .select('*')
          .eq('user_id', user.id)
          .order('earned_at', { ascending: false })
          .limit(10),
      ]);

      const dailyProfit = (dailyTrades.data || []).reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const weeklyProfit = (weeklyTrades.data || []).reduce((sum, t) => sum + (t.profit_loss || 0), 0);
      const monthlyProfit = (monthlyTrades.data || []).reduce((sum, t) => sum + (t.profit_loss || 0), 0);

      // Calculate winning streak
      const { data: recentTrades } = await supabase
        .from('trades')
        .select('profit_loss')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(50);

      let streak = 0;
      for (const trade of recentTrades || []) {
        if ((trade.profit_loss || 0) > 0) {
          streak++;
        } else {
          break;
        }
      }

      setGoals({
        daily: {
          target: targets.daily,
          current: dailyProfit,
          percent: Math.min(100, (dailyProfit / targets.daily) * 100),
          tradesCount: dailyTrades.data?.length || 0,
        },
        weekly: {
          target: targets.weekly,
          current: weeklyProfit,
          percent: Math.min(100, (weeklyProfit / targets.weekly) * 100),
          tradesCount: weeklyTrades.data?.length || 0,
        },
        monthly: {
          target: targets.monthly,
          current: monthlyProfit,
          percent: Math.min(100, (monthlyProfit / targets.monthly) * 100),
          tradesCount: monthlyTrades.data?.length || 0,
        },
        streak,
        badges: (badges.data || []) as Badge[],
        loading: false,
      });

      // Check for new badges to award
      await checkAndAwardBadges(user.id, dailyProfit, weeklyProfit, monthlyProfit, streak, (badges.data || []) as Badge[]);
    } catch (error) {
      console.error('Error fetching profit goals:', error);
      setGoals(prev => ({ ...prev, loading: false }));
    }
  }, [user]);

  const checkAndAwardBadges = async (
    userId: string,
    dailyProfit: number,
    weeklyProfit: number,
    monthlyProfit: number,
    streak: number,
    existingBadges: Badge[]
  ) => {
    const badgeTypes = new Set(existingBadges.map(b => b.badge_type));
    const newBadges: { badge_type: string; badge_name: string; data?: Json }[] = [];

    // Daily Champion - Hit daily goal
    if (dailyProfit >= DEFAULT_GOALS.daily && !badgeTypes.has('daily_champion')) {
      newBadges.push({ badge_type: 'daily_champion', badge_name: 'Daily Champion', data: { profit: dailyProfit } });
    }

    // Week Warrior - Hit weekly goal
    if (weeklyProfit >= DEFAULT_GOALS.weekly && !badgeTypes.has('week_warrior')) {
      newBadges.push({ badge_type: 'week_warrior', badge_name: 'Week Warrior', data: { profit: weeklyProfit } });
    }

    // Monthly Master - Hit monthly goal
    if (monthlyProfit >= DEFAULT_GOALS.monthly && !badgeTypes.has('monthly_master')) {
      newBadges.push({ badge_type: 'monthly_master', badge_name: 'Monthly Master', data: { profit: monthlyProfit } });
    }

    // Consistent Closer - 10 consecutive wins
    if (streak >= 10 && !badgeTypes.has('consistent_closer')) {
      newBadges.push({ badge_type: 'consistent_closer', badge_name: 'Consistent Closer', data: { streak } });
    }

    // First $100 - Total monthly profit milestone
    if (monthlyProfit >= 100 && !badgeTypes.has('first_100')) {
      newBadges.push({ badge_type: 'first_100', badge_name: 'First $100', data: { profit: monthlyProfit } });
    }

    // Hot Streak - 5 consecutive wins
    if (streak >= 5 && !badgeTypes.has('hot_streak')) {
      newBadges.push({ badge_type: 'hot_streak', badge_name: 'Hot Streak', data: { streak } });
    }

    // Insert new badges
    if (newBadges.length > 0) {
      await supabase.from('profit_badges').insert(
        newBadges.map(b => ({ user_id: userId, ...b }))
      );
    }
  };

  const updateGoalTargets = async (daily: number, weekly: number, monthly: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profit_goals')
        .upsert({
          user_id: user.id,
          daily_target: daily,
          weekly_target: weekly,
          monthly_target: monthly,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      await fetchGoals();
    } catch (error) {
      console.error('Error updating goal targets:', error);
    }
  };

  useEffect(() => {
    fetchGoals();

    // Subscribe to trade changes for real-time updates
    const channel = supabase
      .channel('profit-goals-trades')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        () => {
          fetchGoals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGoals]);

  return { ...goals, refetch: fetchGoals, updateGoalTargets };
}