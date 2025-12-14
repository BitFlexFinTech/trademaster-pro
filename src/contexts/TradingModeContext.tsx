import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TradingModeContextType {
  mode: 'demo' | 'live';
  setMode: (mode: 'demo' | 'live') => void;
  virtualBalance: number;
  setVirtualBalance: (balance: number) => void;
  resetDemo: (userId: string) => Promise<void>;
}

const TradingModeContext = createContext<TradingModeContextType | null>(null);

const DEFAULT_VIRTUAL_BALANCE = 15000;

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [virtualBalance, setVirtualBalance] = useState(DEFAULT_VIRTUAL_BALANCE);

  const resetDemo = useCallback(async (userId: string) => {
    // Reset virtual balance to $15,000
    setVirtualBalance(DEFAULT_VIRTUAL_BALANCE);
    localStorage.setItem('virtualBalance', String(DEFAULT_VIRTUAL_BALANCE));

    // Clear demo trades from database
    await supabase.from('trades').delete().eq('user_id', userId).eq('is_sandbox', true);

    // Reset all bot runs for user
    await supabase.from('bot_runs').delete().eq('user_id', userId);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('tradingMode');
    const savedBalance = localStorage.getItem('virtualBalance');
    if (savedMode) setMode(savedMode as 'demo' | 'live');
    if (savedBalance) setVirtualBalance(Number(savedBalance));
  }, []);

  useEffect(() => {
    localStorage.setItem('tradingMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('virtualBalance', String(virtualBalance));
  }, [virtualBalance]);

  return (
    <TradingModeContext.Provider value={{ mode, setMode, virtualBalance, setVirtualBalance, resetDemo }}>
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
