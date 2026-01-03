/**
 * Continuous Scanner Hook
 * Provides React state management for the continuous market scanner
 */

import { useState, useEffect, useCallback } from 'react';
import { continuousMarketScanner, type ScanOpportunity } from '@/lib/continuousMarketScanner';
import { useAuth } from './useAuth';

interface RejectionBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

interface ScannerState {
  isScanning: boolean;
  opportunities: ScanOpportunity[];
  stats: {
    opportunityCount: number;
    rejectionsLast5Min: number;
    symbolsActive: number;
  };
  detailedStats: {
    rejectionBreakdown: RejectionBreakdown[];
    topOpportunities: Array<{ symbol: string; confidence: number; expectedDuration: number }>;
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
    detailedStats: {
      rejectionBreakdown: [],
      topOpportunities: [],
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
    setState(prev => ({ 
      ...prev, 
      isScanning: false, 
      opportunities: [],
      detailedStats: { rejectionBreakdown: [], topOpportunities: [] },
    }));
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

    const statsInterval = setInterval(() => {
      const detailedStats = continuousMarketScanner.getDetailedStats();
      const opportunities = continuousMarketScanner.getAllOpportunities();
      
      setState(prev => ({
        ...prev,
        opportunities,
        stats: {
          opportunityCount: detailedStats.opportunityCount,
          rejectionsLast5Min: detailedStats.rejectionsLast5Min,
          symbolsActive: detailedStats.symbolsActive,
        },
        detailedStats: {
          rejectionBreakdown: detailedStats.rejectionBreakdown,
          topOpportunities: detailedStats.topOpportunities,
        },
      }));
    }, 1000);

    // Clear rejection stats every 5 minutes
    const clearStatsInterval = setInterval(() => {
      continuousMarketScanner.clearRejectionStats();
    }, 300000);

    return () => {
      clearInterval(statsInterval);
      clearInterval(clearStatsInterval);
    };
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
