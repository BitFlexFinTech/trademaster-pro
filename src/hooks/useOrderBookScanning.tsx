import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  scanForArbitrageOpportunities, 
  scanForQualifiedTrades,
  getBestTradeOpportunity,
  ArbitrageOpportunity, 
  QualifiedTrade 
} from '@/lib/orderBookScanner';
import { MIN_NET_PROFIT } from '@/lib/exchangeFees';

interface UseOrderBookScanningOptions {
  exchanges: string[];
  minNetProfit?: number;
  scanIntervalMs?: number;
  enabled?: boolean;
}

interface UseOrderBookScanningReturn {
  opportunities: ArbitrageOpportunity[];
  qualifiedTrades: QualifiedTrade[];
  bestTrade: QualifiedTrade | null;
  isScanning: boolean;
  lastScanTime: number | null;
  scanCount: number;
  startScanning: () => void;
  stopScanning: () => void;
  scanNow: () => Promise<void>;
}

export function useOrderBookScanning({
  exchanges,
  minNetProfit = MIN_NET_PROFIT,
  scanIntervalMs = 5000,
  enabled = false,
}: UseOrderBookScanningOptions): UseOrderBookScanningReturn {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [qualifiedTrades, setQualifiedTrades] = useState<QualifiedTrade[]>([]);
  const [bestTrade, setBestTrade] = useState<QualifiedTrade | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [scanCount, setScanCount] = useState(0);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isScanningRef = useRef(false);

  const performScan = useCallback(async () => {
    if (isScanningRef.current) return;
    if (exchanges.length === 0) return;
    
    isScanningRef.current = true;
    
    try {
      // Scan for arbitrage opportunities
      const arb = await scanForArbitrageOpportunities(exchanges, minNetProfit);
      setOpportunities(arb);
      
      // Scan for qualified trades
      const trades = await scanForQualifiedTrades(exchanges, minNetProfit);
      setQualifiedTrades(trades);
      
      // Get best opportunity
      const best = await getBestTradeOpportunity(exchanges, minNetProfit);
      setBestTrade(best);
      
      setLastScanTime(Date.now());
      setScanCount(prev => prev + 1);
    } catch (err) {
      console.error('Order book scan error:', err);
    } finally {
      isScanningRef.current = false;
    }
  }, [exchanges, minNetProfit]);

  const startScanning = useCallback(() => {
    if (intervalRef.current) return;
    
    setIsScanning(true);
    performScan(); // Initial scan
    
    intervalRef.current = setInterval(performScan, scanIntervalMs);
  }, [performScan, scanIntervalMs]);

  const stopScanning = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const scanNow = useCallback(async () => {
    await performScan();
  }, [performScan]);

  // Auto-start if enabled
  useEffect(() => {
    if (enabled) {
      startScanning();
    } else {
      stopScanning();
    }
    
    return () => {
      stopScanning();
    };
  }, [enabled, startScanning, stopScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    opportunities,
    qualifiedTrades,
    bestTrade,
    isScanning,
    lastScanTime,
    scanCount,
    startScanning,
    stopScanning,
    scanNow,
  };
}
