import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const DEFAULT_VIRTUAL_BALANCE = 1000;
export const MAX_USDT_ALLOCATION = 5000;
export const DEFAULT_BASE_BALANCE = 350;  // Locked balance per exchange

// Default demo allocation percentages
export const DEFAULT_DEMO_ALLOCATION = {
  USDT: 50,
  BTC: 25,
  ETH: 15,
  SOL: 10,
};

// Default base balance per exchange (locked - never traded)
export const DEFAULT_BASE_BALANCE_PER_EXCHANGE: Record<string, number> = {
  Binance: 350,
  OKX: 350,
  Bybit: 350,
  Kraken: 350,
  Nexo: 350,
  KuCoin: 350,
  Hyperliquid: 350,
};

interface DemoAllocation {
  USDT: number;
  BTC: number;
  ETH: number;
  SOL: number;
}

interface TradingModeContextType {
  mode: 'demo' | 'live';
  setMode: (mode: 'demo' | 'live') => void;
  virtualBalance: number;
  setVirtualBalance: (balance: number | ((prev: number) => number)) => void;
  updateVirtualBalance: (newBalance: number) => void;
  resetDemo: (userId: string) => Promise<void>;
  resetTrigger: number;
  triggerSync: () => void;
  demoAllocation: DemoAllocation;
  setDemoAllocation: (allocation: DemoAllocation) => void;
  lastSyncTime: Date | null;
  baseBalancePerExchange: Record<string, number>;
  setBaseBalancePerExchange: (balances: Record<string, number>) => void;
  getAvailableFloat: (exchange: string, totalBalance: number) => number;
  lockedProfits: Record<string, number>;
  lockProfit: (exchange: string, amount: number) => void;
  resetLockedProfits: () => void;
}

const TradingModeContext = createContext<TradingModeContextType | null>(null);

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<'demo' | 'live'>('demo');
  const [virtualBalance, setVirtualBalanceState] = useState(DEFAULT_VIRTUAL_BALANCE);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [demoAllocation, setDemoAllocationState] = useState<DemoAllocation>(DEFAULT_DEMO_ALLOCATION);
  const [baseBalancePerExchange, setBaseBalancePerExchangeState] = useState<Record<string, number>>(DEFAULT_BASE_BALANCE_PER_EXCHANGE);
  const [lockedProfits, setLockedProfits] = useState<Record<string, number>>({});
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const setVirtualBalance = useCallback((balance: number | ((prev: number) => number)) => {
    if (typeof balance === 'function') {
      setVirtualBalanceState(prev => balance(prev));
    } else {
      setVirtualBalanceState(balance);
    }
  }, []);

  // Update virtual balance and trigger sync
  const updateVirtualBalance = useCallback((newBalance: number) => {
    setVirtualBalanceState(newBalance);
    localStorage.setItem('virtualBalance', String(newBalance));
    // Trigger sync for all components
    setResetTrigger(prev => prev + 1);
    // Notify user
    toast.success('Virtual Balance Updated', {
      description: `Balance set to $${newBalance.toLocaleString()}. All components synced.`,
    });
  }, []);

  const setDemoAllocation = useCallback((allocation: DemoAllocation) => {
    // Validate that allocations sum to 100
    const total = allocation.USDT + allocation.BTC + allocation.ETH + allocation.SOL;
    if (Math.abs(total - 100) > 0.01) {
      console.warn('Demo allocation must sum to 100%');
      return;
    }
    setDemoAllocationState(allocation);
    localStorage.setItem('demoAllocation', JSON.stringify(allocation));
  }, []);

  // Set base balance per exchange (locked amount - never traded)
  const setBaseBalancePerExchange = useCallback((balances: Record<string, number>) => {
    setBaseBalancePerExchangeState(balances);
    localStorage.setItem('baseBalancePerExchange', JSON.stringify(balances));
    setResetTrigger(prev => prev + 1);
  }, []);

  // Calculate available float for trading (total - base - locked profits)
  const getAvailableFloat = useCallback((exchange: string, totalBalance: number): number => {
    const baseBalance = baseBalancePerExchange[exchange] || DEFAULT_BASE_BALANCE;
    const locked = lockedProfits[exchange] || 0;
    return Math.max(0, totalBalance - baseBalance - locked);
  }, [baseBalancePerExchange, lockedProfits]);

  // Lock profit - keeps profit in USDT, not traded
  const lockProfit = useCallback((exchange: string, amount: number) => {
    if (amount <= 0) return;
    setLockedProfits(prev => ({
      ...prev,
      [exchange]: (prev[exchange] || 0) + amount
    }));
  }, []);

  // Reset locked profits
  const resetLockedProfits = useCallback(() => {
    setLockedProfits({});
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances');
      
      if (error) throw error;
      
      setLastSyncTime(new Date());
      
      // Show notification with count of holdings updated
      if (data?.synced > 0) {
        toast.success(`Sync Complete`, {
          description: `Updated ${data.synced} holdings from ${data.exchanges?.length || 0} exchanges`,
        });
      } else if (data?.exchanges?.length === 0) {
        toast.info('No exchanges connected', {
          description: 'Connect exchanges in Settings to sync real balances',
        });
      } else {
        toast.info('No holdings to sync', {
          description: 'Your exchange balances are up to date',
        });
      }
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Sync failed', {
        description: 'Could not sync exchange balances. Try again.',
      });
    }
  }, []);

  const setMode = useCallback((newMode: 'demo' | 'live') => {
    setModeState(newMode);
    
    // If switching to live mode, trigger sync
    if (newMode === 'live') {
      triggerSync();
    }
  }, [triggerSync]);

  const resetDemo = useCallback(async (userId: string) => {
    // Reset virtual balance to $1,000
    setVirtualBalanceState(DEFAULT_VIRTUAL_BALANCE);
    localStorage.setItem('virtualBalance', String(DEFAULT_VIRTUAL_BALANCE));

    // Reset demo allocation to defaults
    setDemoAllocationState(DEFAULT_DEMO_ALLOCATION);
    localStorage.setItem('demoAllocation', JSON.stringify(DEFAULT_DEMO_ALLOCATION));

    // Clear demo trades from database
    await supabase.from('trades').delete().eq('user_id', userId).eq('is_sandbox', true);

    // Reset all bot runs for user
    await supabase.from('bot_runs').delete().eq('user_id', userId);

    // Reset backtest runs
    await supabase.from('backtest_runs').delete().eq('user_id', userId);

    // Trigger reset event for all components
    setResetTrigger(prev => prev + 1);
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('tradingMode');
    const savedBalance = localStorage.getItem('virtualBalance');
    const savedAllocation = localStorage.getItem('demoAllocation');
    const savedBaseBalance = localStorage.getItem('baseBalancePerExchange');
    
    if (savedMode) setModeState(savedMode as 'demo' | 'live');
    if (savedBalance) setVirtualBalanceState(Number(savedBalance));
    if (savedAllocation) {
      try {
        setDemoAllocationState(JSON.parse(savedAllocation));
      } catch (e) {
        // Use defaults if parse fails
      }
    }
    if (savedBaseBalance) {
      try {
        setBaseBalancePerExchangeState(JSON.parse(savedBaseBalance));
      } catch (e) {
        // Use defaults if parse fails
      }
    }
  }, []);

  // Save mode to localStorage
  useEffect(() => {
    localStorage.setItem('tradingMode', mode);
  }, [mode]);

  // Save virtual balance to localStorage
  useEffect(() => {
    localStorage.setItem('virtualBalance', String(virtualBalance));
  }, [virtualBalance]);

  // Auto-sync every 5 minutes in Live mode
  useEffect(() => {
    if (mode === 'live') {
      // Initial sync when switching to live mode
      triggerSync();

      // Set up 5-minute interval
      syncIntervalRef.current = setInterval(() => {
        triggerSync();
      }, 5 * 60 * 1000); // 5 minutes

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
        }
      };
    } else {
      // Clear interval when in demo mode
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }
  }, [mode, triggerSync]);

  return (
    <TradingModeContext.Provider value={{ 
      mode, 
      setMode, 
      virtualBalance, 
      setVirtualBalance,
      updateVirtualBalance,
      resetDemo, 
      resetTrigger,
      triggerSync,
      demoAllocation,
      setDemoAllocation,
      lastSyncTime,
      baseBalancePerExchange,
      setBaseBalancePerExchange,
      getAvailableFloat,
      lockedProfits,
      lockProfit,
      resetLockedProfits,
    }}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  const context = useContext(TradingModeContext);
  if (!context) {
    throw new Error('useTradingMode must be used within TradingModeProvider');
  }
  return context;
}
