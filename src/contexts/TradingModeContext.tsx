import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const DEFAULT_VIRTUAL_BALANCE = 1000;
export const MAX_USDT_ALLOCATION = 5000;
export const DEFAULT_BASE_BALANCE = 0;

export const DEFAULT_DEMO_ALLOCATION = {
  USDT: 50,
  BTC: 25,
  ETH: 15,
  SOL: 10,
};

export const DEFAULT_BASE_BALANCE_PER_EXCHANGE: Record<string, number> = {
  Binance: 0,
  OKX: 0,
  Bybit: 0,
  Kraken: 0,
  Nexo: 0,
  KuCoin: 0,
  Hyperliquid: 0,
};

interface DemoAllocation {
  USDT: number;
  BTC: number;
  ETH: number;
  SOL: number;
}

export interface ExchangeBalance {
  exchange: string;
  usdtBalance: number;
  totalValue: number;
  lastSyncAt: Date;
  isStale: boolean;
}

interface TradingModeContextType {
  mode: 'demo' | 'live';
  setMode: (mode: 'demo' | 'live') => void;
  virtualBalance: number;
  setVirtualBalance: (balance: number | ((prev: number) => number)) => void;
  updateVirtualBalance: (newBalance: number) => void;
  resetDemo: (userId: string) => Promise<void>;
  // THREE SEPARATE TRIGGERS - CRITICAL for proper data sync
  resetTrigger: number;         // Manual demo reset only
  syncTrigger: number;          // Balance/data sync (does NOT reset P&L)
  dailyResetTrigger: number;    // 24-hour P&L reset ONLY
  triggerSync: () => void;
  triggerDailyReset: () => void;
  // Session management for 24-hour cycle
  sessionStartTime: Date | null;
  startNewSession: () => void;
  demoAllocation: DemoAllocation;
  setDemoAllocation: (allocation: DemoAllocation) => void;
  lastSyncTime: Date | null;
  baseBalancePerExchange: Record<string, number>;
  setBaseBalancePerExchange: (balances: Record<string, number>) => void;
  getAvailableFloat: (exchange: string, totalBalance: number) => number;
  lockedProfits: Record<string, number>;
  lockProfit: (exchange: string, amount: number) => void;
  resetLockedProfits: () => void;
  sessionStartBalance: Record<string, number>;
  initializeSessionBalance: (exchange: string, balance: number) => void;
  profitVault: Record<string, number>;
  vaultProfit: (exchange: string, amount: number) => void;
  getTotalVaultedProfits: () => number;
  getTradeableAmount: (exchange: string) => number;
  exchangeBalances: ExchangeBalance[];
  fetchExchangeBalances: () => Promise<void>;
  getRealBalance: (exchange: string) => number;
}

const TradingModeContext = createContext<TradingModeContextType | null>(null);

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<'demo' | 'live'>('demo');
  const [virtualBalance, setVirtualBalanceState] = useState(DEFAULT_VIRTUAL_BALANCE);
  
  // THREE SEPARATE TRIGGERS - CRITICAL
  const [resetTrigger, setResetTrigger] = useState(0);       // Manual demo reset
  const [syncTrigger, setSyncTrigger] = useState(0);          // Balance sync (NO P&L reset)
  const [dailyResetTrigger, setDailyResetTrigger] = useState(0); // 24-hour P&L reset
  
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [demoAllocation, setDemoAllocationState] = useState<DemoAllocation>(DEFAULT_DEMO_ALLOCATION);
  const [baseBalancePerExchange, setBaseBalancePerExchangeState] = useState<Record<string, number>>(DEFAULT_BASE_BALANCE_PER_EXCHANGE);
  const [lockedProfits, setLockedProfits] = useState<Record<string, number>>({});
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const dailyCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Session management for 24-hour cycle
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  
  const [sessionStartBalance, setSessionStartBalance] = useState<Record<string, number>>({});
  const sessionStartBalanceRef = useRef<Record<string, number>>({});
  
  const [profitVault, setProfitVault] = useState<Record<string, number>>({});
  const [exchangeBalances, setExchangeBalances] = useState<ExchangeBalance[]>([]);

  const setVirtualBalance = useCallback((balance: number | ((prev: number) => number)) => {
    if (typeof balance === 'function') {
      setVirtualBalanceState(prev => balance(prev));
    } else {
      setVirtualBalanceState(balance);
    }
  }, []);

  // Update virtual balance - triggers SYNC only (not P&L reset)
  const updateVirtualBalance = useCallback((newBalance: number) => {
    setVirtualBalanceState(newBalance);
    localStorage.setItem('virtualBalance', String(newBalance));
    setSyncTrigger(prev => prev + 1); // Sync trigger - NOT reset trigger
    toast.success('Virtual Balance Updated', {
      description: `Balance set to $${newBalance.toLocaleString()}. All components synced.`,
    });
  }, []);

  const setDemoAllocation = useCallback((allocation: DemoAllocation) => {
    const total = allocation.USDT + allocation.BTC + allocation.ETH + allocation.SOL;
    if (Math.abs(total - 100) > 0.01) {
      console.warn('Demo allocation must sum to 100%');
      return;
    }
    setDemoAllocationState(allocation);
    localStorage.setItem('demoAllocation', JSON.stringify(allocation));
  }, []);

  const setBaseBalancePerExchange = useCallback((balances: Record<string, number>) => {
    setBaseBalancePerExchangeState(balances);
    localStorage.setItem('baseBalancePerExchange', JSON.stringify(balances));
    setSyncTrigger(prev => prev + 1); // Sync trigger - NOT reset trigger
  }, []);

  const getAvailableFloat = useCallback((exchange: string, totalBalance: number): number => {
    const baseBalance = baseBalancePerExchange[exchange] || DEFAULT_BASE_BALANCE;
    const locked = lockedProfits[exchange] || 0;
    return Math.max(0, totalBalance - baseBalance - locked);
  }, [baseBalancePerExchange, lockedProfits]);

  const lockProfit = useCallback((exchange: string, amount: number) => {
    if (amount <= 0) return;
    setLockedProfits(prev => ({
      ...prev,
      [exchange]: (prev[exchange] || 0) + amount
    }));
  }, []);

  const resetLockedProfits = useCallback(() => {
    setLockedProfits({});
  }, []);

  const initializeSessionBalance = useCallback((exchange: string, balance: number) => {
    if (sessionStartBalanceRef.current[exchange] !== undefined) {
      if (import.meta.env.DEV) console.log(`[BALANCE FLOOR] ${exchange} already initialized: $${sessionStartBalanceRef.current[exchange]}`);
      return;
    }
    sessionStartBalanceRef.current[exchange] = balance;
    setSessionStartBalance(prev => ({ ...prev, [exchange]: balance }));
    if (import.meta.env.DEV) console.log(`[BALANCE FLOOR] Initialized ${exchange}: $${balance} (immutable)`);
  }, []);

  const vaultProfit = useCallback((exchange: string, amount: number) => {
    if (amount <= 0) return;
    setProfitVault(prev => {
      const newVault = {
        ...prev,
        [exchange]: (prev[exchange] || 0) + amount
      };
      if (import.meta.env.DEV) console.log(`[PROFIT VAULT] Added $${amount.toFixed(2)} to ${exchange}. Total vaulted: $${Object.values(newVault).reduce((a, b) => a + b, 0).toFixed(2)}`);
      return newVault;
    });
  }, []);

  const getTotalVaultedProfits = useCallback((): number => {
    return Object.values(profitVault).reduce((sum, v) => sum + v, 0);
  }, [profitVault]);

  const getTradeableAmount = useCallback((exchange: string): number => {
    const S = sessionStartBalance[exchange] || baseBalancePerExchange[exchange] || DEFAULT_BASE_BALANCE;
    return S;
  }, [sessionStartBalance, baseBalancePerExchange]);

  const cancelStaleOrders = useCallback(async (maxAgeSeconds: number = 60) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return 0;
      
      const { data, error } = await supabase.functions.invoke('cancel-stale-orders', {
        body: { maxAgeSeconds },
      });
      
      if (error) {
        console.warn('[STALE ORDERS] Failed to cancel:', error);
        return 0;
      }
      
      if (data?.cancelledCount > 0) {
        console.log(`[STALE ORDERS] Cancelled ${data.cancelledCount} stale orders to free up USDT`);
        toast.info(`Cancelled ${data.cancelledCount} stale orders`, {
          description: 'USDT freed up for trading',
        });
      }
      
      return data?.cancelledCount || 0;
    } catch (err) {
      console.warn('[STALE ORDERS] Error:', err);
      return 0;
    }
  }, []);

  const fetchExchangeBalances = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: holdings, error } = await supabase
        .from('portfolio_holdings')
        .select('exchange_name, asset_symbol, quantity, updated_at')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      const { data: prices } = await supabase
        .from('price_cache')
        .select('symbol, price');
      
      const priceMap = new Map<string, number>();
      prices?.forEach(p => {
        priceMap.set(p.symbol, p.price);
        priceMap.set(p.symbol.replace('USDT', ''), p.price);
      });
      priceMap.set('USDT', 1);
      priceMap.set('USDC', 1);
      priceMap.set('USD', 1);
      
      const balanceMap = new Map<string, { 
        usdtBalance: number; 
        totalValue: number; 
        lastSync: Date;
        assets: Record<string, { quantity: number; value: number }>;
      }>();
      
      holdings?.forEach(h => {
        if (!h.exchange_name) return;
        
        const existing = balanceMap.get(h.exchange_name) || { 
          usdtBalance: 0, 
          totalValue: 0, 
          lastSync: new Date(0),
          assets: {}
        };
        
        const price = priceMap.get(h.asset_symbol) || 0;
        const assetValue = h.quantity * price;
        const isStablecoin = ['USDT', 'USDC', 'USD'].includes(h.asset_symbol);
        
        balanceMap.set(h.exchange_name, {
          usdtBalance: existing.usdtBalance + (isStablecoin ? h.quantity : 0),
          totalValue: existing.totalValue + assetValue,
          lastSync: new Date(h.updated_at) > existing.lastSync ? new Date(h.updated_at) : existing.lastSync,
          assets: {
            ...existing.assets,
            [h.asset_symbol]: { quantity: h.quantity, value: assetValue }
          }
        });
      });
      
      const now = new Date();
      const newBalances: ExchangeBalance[] = Array.from(balanceMap.entries())
        .filter(([_, data]) => data.totalValue > 0.01)
        .map(([exchange, data]) => ({
          exchange,
          usdtBalance: data.usdtBalance,
          totalValue: data.totalValue,
          lastSyncAt: data.lastSync,
          isStale: (now.getTime() - data.lastSync.getTime()) > 5 * 60 * 1000,
        }));
      
      setExchangeBalances(newBalances);
      
      const newBaseBalances: Record<string, number> = { ...DEFAULT_BASE_BALANCE_PER_EXCHANGE };
      newBalances.forEach(b => {
        newBaseBalances[b.exchange] = b.totalValue;
      });
      setBaseBalancePerExchangeState(newBaseBalances);
      
      if (import.meta.env.DEV) {
        console.log('[BALANCE SYNC] Real exchange balances (TOTAL VALUE):', newBalances);
      }
    } catch (err) {
      console.error('[BALANCE SYNC] Failed to fetch:', err);
    }
  }, []);

  const getRealBalance = useCallback((exchange: string): number => {
    const balance = exchangeBalances.find(b => b.exchange === exchange);
    return balance?.totalValue || 0;
  }, [exchangeBalances]);

  // Start new session - resets 24-hour cycle
  const startNewSession = useCallback(() => {
    const now = new Date();
    setSessionStartTime(now);
    localStorage.setItem('sessionStartTime', now.toISOString());
    console.log(`[SESSION] New 24-hour session started at ${now.toISOString()}`);
  }, []);

  // Trigger 24-hour daily reset with analysis
  const triggerDailyReset = useCallback(async () => {
    console.log('[DAILY RESET] 24-hour cycle complete - triggering P&L reset');
    
    try {
      // Call daily-analysis edge function to generate report
      const { data, error } = await supabase.functions.invoke('daily-analysis', {
        body: { sessionStartTime: sessionStartTime?.toISOString() }
      });
      
      if (error) {
        console.error('[DAILY RESET] Analysis error:', error);
      } else {
        console.log('[DAILY RESET] Analysis generated:', data);
        toast.success('24-Hour Analysis Generated', {
          description: 'Check your performance report for insights.',
        });
      }
    } catch (err) {
      console.error('[DAILY RESET] Failed:', err);
    }
    
    // Reset P&L via dailyResetTrigger
    setDailyResetTrigger(prev => prev + 1);
    
    // Start new session
    startNewSession();
    
    // Reset session balance and profit vault
    setProfitVault({});
    setSessionStartBalance({});
    sessionStartBalanceRef.current = {};
  }, [sessionStartTime, startNewSession]);

  // Trigger sync without P&L reset
  const triggerSync = useCallback(async () => {
    try {
      await cancelStaleOrders(60);
      
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances');
      
      if (error) throw error;
      
      setLastSyncTime(new Date());
      await fetchExchangeBalances();
      
      // Increment sync trigger (NOT reset trigger)
      setSyncTrigger(prev => prev + 1);
      
      if (data?.synced > 0) {
        toast.success(`Sync Complete`, {
          description: `Updated ${data.synced} holdings from ${data.exchanges?.length || 0} exchanges`,
        });
      }
    } catch (err) {
      console.error('Sync failed:', err);
      toast.error('Sync failed', {
        description: 'Could not sync exchange balances. Try again.',
      });
    }
  }, [fetchExchangeBalances, cancelStaleOrders]);

  const setMode = useCallback((newMode: 'demo' | 'live') => {
    setModeState(newMode);
    if (newMode === 'live') {
      triggerSync();
    }
  }, [triggerSync]);

  // Full demo reset - resets EVERYTHING including P&L
  const resetDemo = useCallback(async (userId: string) => {
    setVirtualBalanceState(DEFAULT_VIRTUAL_BALANCE);
    localStorage.setItem('virtualBalance', String(DEFAULT_VIRTUAL_BALANCE));
    setDemoAllocationState(DEFAULT_DEMO_ALLOCATION);
    localStorage.setItem('demoAllocation', JSON.stringify(DEFAULT_DEMO_ALLOCATION));
    
    setProfitVault({});
    setSessionStartBalance({});
    sessionStartBalanceRef.current = {};

    await supabase.from('trades').delete().eq('user_id', userId).eq('is_sandbox', true);
    await supabase.from('bot_runs').delete().eq('user_id', userId);
    await supabase.from('backtest_runs').delete().eq('user_id', userId);

    // Reset trigger - full reset including P&L
    setResetTrigger(prev => prev + 1);
    
    // Start fresh session
    startNewSession();
  }, [startNewSession]);

  // Load session start time from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('tradingMode');
    const savedBalance = localStorage.getItem('virtualBalance');
    const savedAllocation = localStorage.getItem('demoAllocation');
    const savedBaseBalance = localStorage.getItem('baseBalancePerExchange');
    const savedSessionStart = localStorage.getItem('sessionStartTime');
    
    if (savedMode) setModeState(savedMode as 'demo' | 'live');
    if (savedBalance) setVirtualBalanceState(Number(savedBalance));
    if (savedAllocation) {
      try {
        setDemoAllocationState(JSON.parse(savedAllocation));
      } catch (e) {}
    }
    if (savedBaseBalance) {
      try {
        setBaseBalancePerExchangeState(JSON.parse(savedBaseBalance));
      } catch (e) {}
    }
    
    // Load or initialize session start time
    if (savedSessionStart) {
      setSessionStartTime(new Date(savedSessionStart));
    } else {
      // No session exists - start new one
      const now = new Date();
      setSessionStartTime(now);
      localStorage.setItem('sessionStartTime', now.toISOString());
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('tradingMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('virtualBalance', String(virtualBalance));
  }, [virtualBalance]);

  // Subscribe to portfolio_holdings AND price_cache for real-time balance updates
  useEffect(() => {
    fetchExchangeBalances();
    
    const portfolioChannel = supabase
      .channel('portfolio-balance-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portfolio_holdings',
        },
        () => {
          if (import.meta.env.DEV) console.log('[REALTIME] portfolio_holdings changed, fetching balances...');
          fetchExchangeBalances();
        }
      )
      .subscribe();
    
    const priceChannel = supabase
      .channel('price-updates-for-balance')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'price_cache',
        },
        () => {
          fetchExchangeBalances();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(portfolioChannel);
      supabase.removeChannel(priceChannel);
    };
  }, [fetchExchangeBalances]);

  // 24-HOUR CYCLE CHECK - Every minute, check if 24 hours have passed
  useEffect(() => {
    const check24HourReset = () => {
      if (!sessionStartTime) return;
      
      const hoursSinceStart = (Date.now() - sessionStartTime.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceStart >= 24) {
        console.log(`[24H CYCLE] ${hoursSinceStart.toFixed(1)} hours elapsed - triggering daily reset`);
        triggerDailyReset();
      }
    };
    
    // Check immediately on mount
    check24HourReset();
    
    // Check every minute
    dailyCheckIntervalRef.current = setInterval(check24HourReset, 60 * 1000);
    
    return () => {
      if (dailyCheckIntervalRef.current) {
        clearInterval(dailyCheckIntervalRef.current);
      }
    };
  }, [sessionStartTime, triggerDailyReset]);

  // Auto-sync every 30 SECONDS in Live mode (changed from 5 minutes)
  useEffect(() => {
    if (mode === 'live') {
      triggerSync();
      syncIntervalRef.current = setInterval(() => {
        fetchExchangeBalances(); // Just refresh balances, no toast spam
        setSyncTrigger(prev => prev + 1);
      }, 30 * 1000); // 30 seconds

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
        }
      };
    } else {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    }
  }, [mode, triggerSync, fetchExchangeBalances]);

  return (
    <TradingModeContext.Provider value={{ 
      mode, 
      setMode, 
      virtualBalance, 
      setVirtualBalance,
      updateVirtualBalance,
      resetDemo, 
      resetTrigger,
      syncTrigger,
      dailyResetTrigger,
      triggerSync,
      triggerDailyReset,
      sessionStartTime,
      startNewSession,
      demoAllocation,
      setDemoAllocation,
      lastSyncTime,
      baseBalancePerExchange,
      setBaseBalancePerExchange,
      getAvailableFloat,
      lockedProfits,
      lockProfit,
      resetLockedProfits,
      sessionStartBalance,
      initializeSessionBalance,
      profitVault,
      vaultProfit,
      getTotalVaultedProfits,
      getTradeableAmount,
      exchangeBalances,
      fetchExchangeBalances,
      getRealBalance,
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
