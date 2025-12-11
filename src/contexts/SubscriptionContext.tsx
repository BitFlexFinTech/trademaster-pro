import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type PlanType = 'free' | 'pro' | 'enterprise';

interface PlanLimits {
  signalsPerDay: number;
  tradesPerDay: number;
  features: string[];
}

interface SubscriptionContextType {
  plan: PlanType;
  signalsUsed: number;
  tradesUsed: number;
  limits: PlanLimits;
  canUseSignal: () => boolean;
  canExecuteTrade: () => boolean;
  incrementSignalUsage: () => void;
  incrementTradeUsage: () => void;
  upgradePlan: (newPlan: PlanType) => Promise<void>;
  loading: boolean;
}

const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    signalsPerDay: 10,
    tradesPerDay: 5,
    features: ['Basic arbitrage alerts', '10 AI signals/day', '5 trades/day', 'Community support'],
  },
  pro: {
    signalsPerDay: 100,
    tradesPerDay: -1, // unlimited
    features: ['All arbitrage alerts', '100 AI signals/day', 'Unlimited trades', 'Priority support', 'Advanced analytics', 'Custom alerts'],
  },
  enterprise: {
    signalsPerDay: -1, // unlimited
    tradesPerDay: -1, // unlimited
    features: ['Everything in Pro', 'Unlimited signals', 'API access', 'Dedicated support', 'Custom integrations', 'White-label options'],
  },
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>('free');
  const [signalsUsed, setSignalsUsed] = useState(0);
  const [tradesUsed, setTradesUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchSubscriptionData();
    } else {
      setPlan('free');
      setSignalsUsed(0);
      setTradesUsed(0);
      setLoading(false);
    }
  }, [user]);

  const fetchSubscriptionData = async () => {
    if (!user) return;
    
    try {
      // Fetch subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subscription) {
        setPlan(subscription.plan as PlanType);
      }

      // Fetch today's usage
      const today = new Date().toISOString().split('T')[0];
      const { data: usage } = await supabase
        .from('usage_limits')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      if (usage) {
        setSignalsUsed(usage.signals_used);
        setTradesUsed(usage.trades_used);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const limits = PLAN_LIMITS[plan];

  const canUseSignal = () => {
    if (limits.signalsPerDay === -1) return true;
    return signalsUsed < limits.signalsPerDay;
  };

  const canExecuteTrade = () => {
    if (limits.tradesPerDay === -1) return true;
    return tradesUsed < limits.tradesPerDay;
  };

  const incrementSignalUsage = async () => {
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    setSignalsUsed(prev => prev + 1);

    try {
      await supabase
        .from('usage_limits')
        .upsert({
          user_id: user.id,
          date: today,
          signals_used: signalsUsed + 1,
          trades_used: tradesUsed,
        }, {
          onConflict: 'user_id,date',
        });
    } catch (error) {
      console.error('Error updating signal usage:', error);
    }
  };

  const incrementTradeUsage = async () => {
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    setTradesUsed(prev => prev + 1);

    try {
      await supabase
        .from('usage_limits')
        .upsert({
          user_id: user.id,
          date: today,
          signals_used: signalsUsed,
          trades_used: tradesUsed + 1,
        }, {
          onConflict: 'user_id,date',
        });
    } catch (error) {
      console.error('Error updating trade usage:', error);
    }
  };

  const upgradePlan = async (newPlan: PlanType) => {
    if (!user) return;

    // Mock upgrade - in production this would integrate with Stripe
    try {
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          plan: newPlan,
          status: 'active',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        }, {
          onConflict: 'user_id',
        });

      setPlan(newPlan);
    } catch (error) {
      console.error('Error upgrading plan:', error);
      throw error;
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{
        plan,
        signalsUsed,
        tradesUsed,
        limits,
        canUseSignal,
        canExecuteTrade,
        incrementSignalUsage,
        incrementTradeUsage,
        upgradePlan,
        loading,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export { PLAN_LIMITS };
