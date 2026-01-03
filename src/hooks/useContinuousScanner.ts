/**
 * Continuous Scanner Hook
 * Provides React state management for the continuous market scanner
 */

import { useState, useEffect, useCallback } from 'react';
import { continuousMarketScanner, type ScanOpportunity } from '@/lib/continuousMarketScanner';
import { useAuth } from './useAuth';

interface ScannerState {
  isScanning: boolean;
  opportunities: ScanOpportunity[];
  stats: {
    opportunityCount: number;
    rejectionsLast5Min: number;
    symbolsActive: number;
  };
}

export function useContinuousScanner(
  prices: Array<{ symbol: string; price: number; change_24h?: number; volume?: number }>
) {
  const { user } = useAuth();
  const [state, setState] = useState<ScannerState>({
    isScanning: false,
    opportunities: [],
    stats: {
      opportunityCount: 0,
      rejectionsLast5Min: 0,
      symbolsActive: 0,
    },
  });

  const priceGetter = useCallback((symbol: string) => {
    const priceData = prices.find(p => p.symbol.toUpperCase() === symbol.toUpperCase());
    if (!priceData) return null;
    return {
      price: priceData.price,
      change: priceData.change_24h || 0,
      volume: priceData.volume || 0,
    };
  }, [prices]);

  const startScanning = useCallback(() => {
    continuousMarketScanner.start(priceGetter, user?.id);
    setState(prev => ({ ...prev, isScanning: true }));
  }, [priceGetter, user?.id]);

  const stopScanning = useCallback(() => {
    continuousMarketScanner.stop();
    setState(prev => ({ ...prev, isScanning: false, opportunities: [] }));
  }, []);

  // Subscribe to opportunities
  useEffect(() => {
    const unsubscribe = continuousMarketScanner.onOpportunity((opportunity) => {
      setState(prev => ({
        ...prev,
        opportunities: [opportunity, ...prev.opportunities].slice(0, 20),
      }));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Update stats periodically
  useEffect(() => {
    if (!state.isScanning) return;

    const interval = setInterval(() => {
      const stats = continuousMarketScanner.getStats();
      const opportunities = continuousMarketScanner.getAllOpportunities();
      
      setState(prev => ({
        ...prev,
        opportunities,
        stats: {
          opportunityCount: stats.opportunityCount,
          rejectionsLast5Min: stats.rejectionsLast5Min,
          symbolsActive: stats.symbolsActive,
        },
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isScanning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      continuousMarketScanner.stop();
    };
  }, []);

  return {
    ...state,
    startScanning,
    stopScanning,
    getBestOpportunity: (exchange?: string) => continuousMarketScanner.getBestOpportunity(exchange),
  };
}
