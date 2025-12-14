import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface TradingModeContextType {
  mode: 'demo' | 'live';
  setMode: (mode: 'demo' | 'live') => void;
  virtualBalance: number;
  setVirtualBalance: (balance: number) => void;
}

const TradingModeContext = createContext<TradingModeContextType | null>(null);

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [virtualBalance, setVirtualBalance] = useState(10000);

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
    <TradingModeContext.Provider value={{ mode, setMode, virtualBalance, setVirtualBalance }}>
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
