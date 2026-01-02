import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CompoundConfig {
  enabled: boolean;
  percentage: number;      // 25, 50, 75, 100
  threshold: number;       // Only compound after reaching $X profit
  maxMultiplier: number;   // Cap at Nx original position
}

export interface CompoundState {
  originalPositionSize: number;
  currentPositionSize: number;
  currentMultiplier: number;
  totalCompounded: number;
  totalProfit: number;
}

const DEFAULT_CONFIG: CompoundConfig = {
  enabled: false,
  percentage: 50,
  threshold: 5,
  maxMultiplier: 2,
};

export function useAutoCompound(basePositionSize: number = 100) {
  const { user } = useAuth();
  const [config, setConfig] = useState<CompoundConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<CompoundState>({
    originalPositionSize: basePositionSize,
    currentPositionSize: basePositionSize,
    currentMultiplier: 1,
    totalCompounded: 0,
    totalProfit: 0,
  });
  const [loading, setLoading] = useState(true);

  // Load config from database
  useEffect(() => {
    if (!user) return;

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('bot_config')
          .select('auto_compound_enabled, compound_percentage, compound_threshold, compound_max_multiplier, amount_per_trade')
          .eq('user_id', user.id)
          .single();

        if (data && !error) {
          setConfig({
            enabled: data.auto_compound_enabled ?? false,
            percentage: data.compound_percentage ?? 50,
            threshold: data.compound_threshold ?? 5,
            maxMultiplier: data.compound_max_multiplier ?? 2,
          });
          
          setState(prev => ({
            ...prev,
            originalPositionSize: data.amount_per_trade ?? basePositionSize,
            currentPositionSize: data.amount_per_trade ?? basePositionSize,
          }));
        }
      } catch (err) {
        console.error('Failed to load compound config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [user, basePositionSize]);

  // Save config to database
  const updateConfig = useCallback(async (updates: Partial<CompoundConfig>) => {
    if (!user) return;

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    try {
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          auto_compound_enabled: newConfig.enabled,
          compound_percentage: newConfig.percentage,
          compound_threshold: newConfig.threshold,
          compound_max_multiplier: newConfig.maxMultiplier,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      
      toast.success('Compound settings saved');
    } catch (err) {
      console.error('Failed to save compound config:', err);
      toast.error('Failed to save settings');
    }
  }, [user, config]);

  // Calculate compounded position size after a profitable trade
  const calculateCompoundedSize = useCallback((profitAmount: number): number => {
    if (!config.enabled) return state.originalPositionSize;
    
    const newTotalProfit = state.totalProfit + profitAmount;
    
    // Check if we've met the threshold
    if (newTotalProfit < config.threshold) {
      return state.currentPositionSize;
    }
    
    // Calculate compound amount
    const compoundAmount = profitAmount * (config.percentage / 100);
    const newPositionSize = state.currentPositionSize + compoundAmount;
    
    // Apply max multiplier cap
    const maxSize = state.originalPositionSize * config.maxMultiplier;
    const cappedSize = Math.min(newPositionSize, maxSize);
    
    return cappedSize;
  }, [config, state]);

  // Apply compound after a successful trade
  const applyCompound = useCallback((profitAmount: number) => {
    if (!config.enabled || profitAmount <= 0) return;
    
    const newTotalProfit = state.totalProfit + profitAmount;
    
    // Only compound if threshold is met
    if (newTotalProfit < config.threshold) {
      setState(prev => ({
        ...prev,
        totalProfit: newTotalProfit,
      }));
      return;
    }
    
    const compoundAmount = profitAmount * (config.percentage / 100);
    const newPositionSize = calculateCompoundedSize(profitAmount);
    const newMultiplier = newPositionSize / state.originalPositionSize;
    
    setState(prev => ({
      ...prev,
      currentPositionSize: newPositionSize,
      currentMultiplier: newMultiplier,
      totalCompounded: prev.totalCompounded + compoundAmount,
      totalProfit: newTotalProfit,
    }));
    
    // Update database
    if (user) {
      supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          amount_per_trade: newPositionSize,
        }, { onConflict: 'user_id' })
        .then(() => {
          toast.success(`📈 Compounded +$${compoundAmount.toFixed(2)}`, {
            description: `New position: $${newPositionSize.toFixed(2)} (${newMultiplier.toFixed(2)}x)`,
          });
        });
    }
  }, [config, state, user, calculateCompoundedSize]);

  // Reset compound state (e.g., at start of new session)
  const resetCompound = useCallback(() => {
    setState({
      originalPositionSize: basePositionSize,
      currentPositionSize: basePositionSize,
      currentMultiplier: 1,
      totalCompounded: 0,
      totalProfit: 0,
    });
    
    if (user) {
      supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          amount_per_trade: basePositionSize,
        }, { onConflict: 'user_id' });
    }
  }, [user, basePositionSize]);

  return {
    config,
    state,
    loading,
    updateConfig,
    applyCompound,
    resetCompound,
    calculateCompoundedSize,
    // Convenience getters
    isEnabled: config.enabled,
    currentSize: state.currentPositionSize,
    multiplier: state.currentMultiplier,
    totalCompounded: state.totalCompounded,
  };
}
