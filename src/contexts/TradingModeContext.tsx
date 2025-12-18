import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const DEFAULT_VIRTUAL_BALANCE = 1000;
export const MAX_USDT_ALLOCATION = 5000;
export const DEFAULT_BASE_BALANCE = 0;  // CRITICAL: No hardcoded default - use real balances

// Default demo allocation percentages
export const DEFAULT_DEMO_ALLOCATION = {
  USDT: 50,
  BTC: 25,
  ETH: 15,
  SOL: 10,
};

// Default base balance per exchange - ZERO by default, populated from real data
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

// Single source of truth for exchange balances
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
  // Balance Floor (S) - immutable session start balance
  sessionStartBalance: Record<string, number>;
  initializeSessionBalance: (exchange: string, balance: number) => void;
  // Profit Vault (V) - segregated profits, NEVER traded
  profitVault: Record<string, number>;
  vaultProfit: (exchange: string, amount: number) => void;
  getTotalVaultedProfits: () => number;
  // Get tradeable amount (S only, excludes V)
  getTradeableAmount: (exchange: string) => number;
  // SINGLE SOURCE OF TRUTH: Real exchange balances
  exchangeBalances: ExchangeBalance[];
  fetchExchangeBalances: () => Promise<void>;
  getRealBalance: (exchange: string) => number;
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
  
  // Session Start Balance (S) - immutable balance floor
  const [sessionStartBalance, setSessionStartBalance] = useState<Record<string, number>>({});
  const sessionStartBalanceRef = useRef<Record<string, number>>({});
  
  // Profit Vault (V) - segregated profits, NEVER used for trading
  const [profitVault, setProfitVault] = useState<Record<string, number>>({});
  
  // SINGLE SOURCE OF TRUTH: Real exchange balances from database
  const [exchangeBalances, setExchangeBalances] = useState<ExchangeBalance[]>([]);

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
    setResetTrigger(prev => prev + 1);
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

  // Initialize session start balance (S) - IMMUTABLE once set
  const initializeSessionBalance = useCallback((exchange: string, balance: number) => {
    // Only set if not already initialized - S is immutable
    if (sessionStartBalanceRef.current[exchange] !== undefined) {
      if (import.meta.env.DEV) console.log(`[BALANCE FLOOR] ${exchange} already initialized: $${sessionStartBalanceRef.current[exchange]}`);
      return;
    }
    sessionStartBalanceRef.current[exchange] = balance;
    setSessionStartBalance(prev => ({ ...prev, [exchange]: balance }));
    if (import.meta.env.DEV) console.log(`[BALANCE FLOOR] Initialized ${exchange}: $${balance} (immutable)`);
  }, []);

  // Vault profit (V) - segregated, NEVER debited for trading
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

  // Get total vaulted profits
  const getTotalVaultedProfits = useCallback((): number => {
    return Object.values(profitVault).reduce((sum, v) => sum + v, 0);
  }, [profitVault]);

  // Get tradeable amount (S only, excludes V)
  const getTradeableAmount = useCallback((exchange: string): number => {
    const S = sessionStartBalance[exchange] || baseBalancePerExchange[exchange] || DEFAULT_BASE_BALANCE;
    // V is EXCLUDED - only S is tradeable
    return S;
  }, [sessionStartBalance, baseBalancePerExchange]);

  // Cancel stale orders before fetching balances to free up locked USDT
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

  // CRITICAL: Fetch real exchange balances from database - SINGLE SOURCE OF TRUTH
  // Calculates TOTAL PORTFOLIO VALUE (all assets × current prices), not just USDT
  const fetchExchangeBalances = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Fetch ALL holdings (not just stablecoins)
      const { data: holdings, error } = await supabase
        .from('portfolio_holdings')
        .select('exchange_name, asset_symbol, quantity, updated_at')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Fetch current prices from price_cache
      const { data: prices } = await supabase
        .from('price_cache')
        .select('symbol, price');
      
      // Create price map (symbol -> USD price)
      const priceMap = new Map<string, number>();
      prices?.forEach(p => {
        priceMap.set(p.symbol, p.price);
        priceMap.set(p.symbol.replace('USDT', ''), p.price); // Also map BTC -> price
      });
      // Stablecoins are always $1
      priceMap.set('USDT', 1);
      priceMap.set('USDC', 1);
      priceMap.set('USD', 1);
      
      // Group by exchange and calculate TOTAL VALUE
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
        
        // Get price for this asset
        const price = priceMap.get(h.asset_symbol) || 0;
        const assetValue = h.quantity * price;
        
        // Track USDT balance separately (stablecoins only)
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
        .filter(([_, data]) => data.totalValue > 0.01) // STRICT: Only exchanges with value > $0.01
        .map(([exchange, data]) => ({
          exchange,
          usdtBalance: data.usdtBalance,
          totalValue: data.totalValue, // TOTAL value of ALL assets
          lastSyncAt: data.lastSync,
          isStale: (now.getTime() - data.lastSync.getTime()) > 5 * 60 * 1000,
        }));
      
      setExchangeBalances(newBalances);
      
      // Update base balance per exchange to reflect TOTAL VALUE (not just USDT)
      const newBaseBalances: Record<string, number> = { ...DEFAULT_BASE_BALANCE_PER_EXCHANGE };
      newBalances.forEach(b => {
        newBaseBalances[b.exchange] = b.totalValue; // Use total value
      });
      setBaseBalancePerExchangeState(newBaseBalances);
      
      if (import.meta.env.DEV) {
        console.log('[BALANCE SYNC] Real exchange balances (TOTAL VALUE):', newBalances);
        newBalances.forEach(b => {
          console.log(`  ${b.exchange}: $${b.totalValue.toFixed(2)} total (USDT: $${b.usdtBalance.toFixed(2)})`);
        });
      }
    } catch (err) {
      console.error('[BALANCE SYNC] Failed to fetch:', err);
    }
  }, []);

  // Get real balance for a specific exchange - returns TOTAL VALUE
  const getRealBalance = useCallback((exchange: string): number => {
    const balance = exchangeBalances.find(b => b.exchange === exchange);
    return balance?.totalValue || 0; // Return TOTAL VALUE, not just USDT
  }, [exchangeBalances]);

  const triggerSync = useCallback(async () => {
    try {
      // CRITICAL: Cancel stale orders FIRST to free up locked USDT
      await cancelStaleOrders(60); // Cancel orders older than 60 seconds
      
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances');
      
      if (error) throw error;
      
      setLastSyncTime(new Date());
      
      // CRITICAL: Fetch updated balances after sync
      await fetchExchangeBalances();
      
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
  }, [fetchExchangeBalances, cancelStaleOrders]);

  const setMode = useCallback((newMode: 'demo' | 'live') => {
    setModeState(newMode);
    if (newMode === 'live') {
      triggerSync();
    }
  }, [triggerSync]);

  const resetDemo = useCallback(async (userId: string) => {
    setVirtualBalanceState(DEFAULT_VIRTUAL_BALANCE);
    localStorage.setItem('virtualBalance', String(DEFAULT_VIRTUAL_BALANCE));
    setDemoAllocationState(DEFAULT_DEMO_ALLOCATION);
    localStorage.setItem('demoAllocation', JSON.stringify(DEFAULT_DEMO_ALLOCATION));
    
    // Reset profit vault and session balance
    setProfitVault({});
    setSessionStartBalance({});
    sessionStartBalanceRef.current = {};

    await supabase.from('trades').delete().eq('user_id', userId).eq('is_sandbox', true);
    await supabase.from('bot_runs').delete().eq('user_id', userId);
    await supabase.from('backtest_runs').delete().eq('user_id', userId);

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

  // CRITICAL: Subscribe to portfolio_holdings AND price_cache for real-time balance updates
  useEffect(() => {
    fetchExchangeBalances();
    
    // Subscribe to portfolio changes
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
    
    // Subscribe to price changes to update total values in real-time
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
          // Recalculate total values when prices change
          fetchExchangeBalances();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(portfolioChannel);
      supabase.removeChannel(priceChannel);
    };
  }, [fetchExchangeBalances]);

  // Auto-sync every 5 minutes in Live mode
  useEffect(() => {
    if (mode === 'live') {
      triggerSync();
      syncIntervalRef.current = setInterval(() => {
        triggerSync();
      }, 5 * 60 * 1000);

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
