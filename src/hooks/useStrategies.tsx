import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Strategy {
  id: string;
  name: string;
  description: string;
  exchange: string;
  dailyProfit: string;
  requiredUsdt: number;
  riskScore: string;
  maxLeverage: number;
  type: 'CEX' | 'DeFi';
  status: 'idle' | 'running' | 'stopped';
  deployedUsdt: number;
  totalProfit: number;
}

const DEFAULT_STRATEGIES: Omit<Strategy, 'status' | 'deployedUsdt' | 'totalProfit'>[] = [
  { id: '1', name: 'Cross-Exchange Arbitrage', description: 'Exploit price differences between major CEXs', exchange: 'Binance/OKX', dailyProfit: '0.5-1.2%', requiredUsdt: 5000, riskScore: 'LOW', maxLeverage: 3, type: 'CEX' },
  { id: '2', name: 'Triangular Arbitrage', description: 'Trade between 3 pairs on same exchange', exchange: 'Binance', dailyProfit: '0.3-0.8%', requiredUsdt: 10000, riskScore: 'LOW', maxLeverage: 1, type: 'CEX' },
  { id: '3', name: 'Funding Rate Arbitrage', description: 'Capture funding rate differences in perpetuals', exchange: 'Bybit', dailyProfit: '0.1-0.4%', requiredUsdt: 20000, riskScore: 'MEDIUM', maxLeverage: 10, type: 'CEX' },
  { id: '4', name: 'Stablecoin Arbitrage', description: 'Trade stablecoin depegs across pools', exchange: 'Curve', dailyProfit: '0.2-0.6%', requiredUsdt: 50000, riskScore: 'LOW', maxLeverage: 1, type: 'DeFi' },
  { id: '5', name: 'Volatility Scalping', description: 'Capture micro price movements with high frequency', exchange: 'Hyperliquid', dailyProfit: '0.8-2.0%', requiredUsdt: 3000, riskScore: 'HIGH', maxLeverage: 20, type: 'CEX' },
  { id: '6', name: 'Yield Farming', description: 'Provide liquidity to DeFi pools for rewards', exchange: 'Uniswap', dailyProfit: '0.1-0.3%', requiredUsdt: 10000, riskScore: 'MEDIUM', maxLeverage: 1, type: 'DeFi' },
  { id: '7', name: 'Liquidity Provision', description: 'Market make on DEX concentrated liquidity pools', exchange: 'Uniswap V3', dailyProfit: '0.2-0.5%', requiredUsdt: 25000, riskScore: 'MEDIUM', maxLeverage: 1, type: 'DeFi' },
];

export function useStrategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCount, setActiveCount] = useState(0);
  const [totalDeployed, setTotalDeployed] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);

  const fetchStrategies = useCallback(async () => {
    if (!user) {
      // Return default strategies with idle status
      setStrategies(DEFAULT_STRATEGIES.map(s => ({ ...s, status: 'idle', deployedUsdt: 0, totalProfit: 0 })));
      setLoading(false);
      return;
    }

    try {
      const { data: executions, error } = await supabase
        .from('strategy_executions')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Merge DB data with default strategies
      const executionMap = new Map(executions?.map(e => [e.strategy_name, e]));
      
      const mergedStrategies = DEFAULT_STRATEGIES.map(s => {
        const execution = executionMap.get(s.name);
        return {
          ...s,
          status: (execution?.status as 'idle' | 'running' | 'stopped') || 'idle',
          deployedUsdt: execution?.deployed_usdt || 0,
          totalProfit: execution?.total_profit || 0,
        };
      });

      setStrategies(mergedStrategies);
      
      const running = mergedStrategies.filter(s => s.status === 'running');
      setActiveCount(running.length);
      setTotalDeployed(running.reduce((sum, s) => sum + s.deployedUsdt, 0));
      setTotalEarnings(mergedStrategies.reduce((sum, s) => sum + s.totalProfit, 0));
    } catch (error) {
      console.error('Error fetching strategies:', error);
      setStrategies(DEFAULT_STRATEGIES.map(s => ({ ...s, status: 'idle', deployedUsdt: 0, totalProfit: 0 })));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const startStrategy = async (strategyName: string, deployedUsdt: number) => {
    if (!user) {
      toast.error('Please login to start strategies');
      return;
    }

    try {
      const { error } = await supabase
        .from('strategy_executions')
        .upsert({
          user_id: user.id,
          strategy_name: strategyName,
          status: 'running',
          deployed_usdt: deployedUsdt,
          started_at: new Date().toISOString(),
          exchange: DEFAULT_STRATEGIES.find(s => s.name === strategyName)?.exchange || 'Unknown',
        }, { onConflict: 'user_id,strategy_name' });

      if (error) throw error;
      
      toast.success(`Started ${strategyName}`);
      fetchStrategies();
    } catch (error) {
      console.error('Error starting strategy:', error);
      toast.error('Failed to start strategy');
    }
  };

  const stopStrategy = async (strategyName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('strategy_executions')
        .update({ status: 'stopped' })
        .eq('user_id', user.id)
        .eq('strategy_name', strategyName);

      if (error) throw error;
      
      toast.success(`Stopped ${strategyName}`);
      fetchStrategies();
    } catch (error) {
      console.error('Error stopping strategy:', error);
      toast.error('Failed to stop strategy');
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return { 
    strategies, 
    loading, 
    activeCount, 
    totalDeployed, 
    totalEarnings,
    startStrategy, 
    stopStrategy, 
    refetch: fetchStrategies 
  };
}
