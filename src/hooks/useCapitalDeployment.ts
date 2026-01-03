/**
 * Capital Deployment Hook
 * React state management for the capital manager
 */

import { useState, useEffect, useCallback } from 'react';
import { capitalManager, type ExchangeCapital, type Position } from '@/lib/capitalManager';

interface CapitalState {
  exchanges: ExchangeCapital[];
  totalCapital: number;
  totalDeployed: number;
  totalIdle: number;
  overallUtilization: number;
  isMonitoring: boolean;
}

export function useCapitalDeployment(
  usdtFloat: Array<{ exchange: string; amount: number }>
) {
  const [state, setState] = useState<CapitalState>({
    exchanges: [],
    totalCapital: 0,
    totalDeployed: 0,
    totalIdle: 0,
    overallUtilization: 0,
    isMonitoring: false,
  });

  // Update balances from usdtFloat
  useEffect(() => {
    usdtFloat.forEach(({ exchange, amount }) => {
      capitalManager.updateBalance(exchange, amount);
    });
  }, [usdtFloat]);

  const startMonitoring = useCallback(() => {
    capitalManager.start((status) => {
      const totalCapital = status.reduce((sum, ex) => sum + ex.total, 0);
      const totalDeployed = status.reduce((sum, ex) => sum + ex.deployed, 0);
      const totalIdle = status.reduce((sum, ex) => sum + ex.idle, 0);

      setState({
        exchanges: status,
        totalCapital,
        totalDeployed,
        totalIdle,
        overallUtilization: totalCapital > 0 ? (totalDeployed / totalCapital) * 100 : 0,
        isMonitoring: true,
      });
    });
  }, []);

  const stopMonitoring = useCallback(() => {
    capitalManager.stop();
    setState(prev => ({ ...prev, isMonitoring: false }));
  }, []);

  const trackPosition = useCallback((exchange: string, position: Position) => {
    capitalManager.trackPosition(exchange, position);
  }, []);

  const handlePositionExit = useCallback(async (
    exchange: string,
    positionId: string,
    exitPrice: number,
    profit: number
  ) => {
    await capitalManager.onPositionExit(exchange, positionId, exitPrice, profit);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      capitalManager.stop();
    };
  }, []);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    trackPosition,
    handlePositionExit,
    getPositions: (exchange: string, symbol?: string) => capitalManager.getPositions(exchange, symbol),
  };
}
