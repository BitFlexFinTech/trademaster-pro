/**
 * Capital Deployment Hook
 * React state management for the capital manager with history tracking
 * NOW WITH AUTO-DEPLOY: Syncs open trades and enables automatic capital deployment
 */

import { useState, useEffect, useCallback } from 'react';
import { capitalManager, type ExchangeCapital, type Position, type AutoDeployConfig } from '@/lib/capitalManager';
import { useAuth } from '@/hooks/useAuth';

interface ExchangeCapitalForChart {
  exchange: string;
  total: number;
  deployed: number;
  idle: number;
  utilization: number;
}

interface CapitalState {
  exchanges: ExchangeCapital[];
  exchangesForChart: ExchangeCapitalForChart[];
  totalCapital: number;
  totalDeployed: number;
  totalIdle: number;
  overallUtilization: number;
  isMonitoring: boolean;
  autoDeployEnabled: boolean;
}

export function useCapitalDeployment(
  usdtFloat: Array<{ exchange: string; amount: number }>
) {
  const { user } = useAuth();
  const [state, setState] = useState<CapitalState>({
    exchanges: [],
    exchangesForChart: [],
    totalCapital: 0,
    totalDeployed: 0,
    totalIdle: 0,
    overallUtilization: 0,
    isMonitoring: false,
    autoDeployEnabled: false,
  });

  // Update balances from usdtFloat
  useEffect(() => {
    usdtFloat.forEach(({ exchange, amount }) => {
      capitalManager.updateBalance(exchange, amount);
    });
    
    // Update state with current balances even when not monitoring
    const status = capitalManager.getCapitalStatus();
    const totalCapital = status.reduce((sum, ex) => sum + ex.total, 0);
    const totalDeployed = status.reduce((sum, ex) => sum + ex.deployed, 0);
    const totalIdle = status.reduce((sum, ex) => sum + ex.idle, 0);
    
    const exchangesForChart = status.map(ex => ({
      exchange: ex.name,
      total: ex.total,
      deployed: ex.deployed,
      idle: ex.idle,
      utilization: ex.utilizationPercent,
    }));

    setState(prev => ({
      ...prev,
      exchanges: status,
      exchangesForChart,
      totalCapital,
      totalDeployed,
      totalIdle,
      overallUtilization: totalCapital > 0 ? (totalDeployed / totalCapital) * 100 : 0,
    }));
  }, [usdtFloat]);

  // Sync open trades on mount
  useEffect(() => {
    if (!user?.id) return;
    capitalManager.syncOpenTrades(user.id);
  }, [user?.id]);

  const startMonitoring = useCallback(() => {
    capitalManager.start((status) => {
      const totalCapital = status.reduce((sum, ex) => sum + ex.total, 0);
      const totalDeployed = status.reduce((sum, ex) => sum + ex.deployed, 0);
      const totalIdle = status.reduce((sum, ex) => sum + ex.idle, 0);
      
      const exchangesForChart = status.map(ex => ({
        exchange: ex.name,
        total: ex.total,
        deployed: ex.deployed,
        idle: ex.idle,
        utilization: ex.utilizationPercent,
      }));

      setState(prev => ({
        ...prev,
        exchanges: status,
        exchangesForChart,
        totalCapital,
        totalDeployed,
        totalIdle,
        overallUtilization: totalCapital > 0 ? (totalDeployed / totalCapital) * 100 : 0,
        isMonitoring: true,
      }));
    });
  }, []);

  const stopMonitoring = useCallback(() => {
    capitalManager.stop();
    setState(prev => ({ ...prev, isMonitoring: false, autoDeployEnabled: false }));
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

  // Enable auto-deployment of idle capital
  const enableAutoDeploy = useCallback((config: Omit<AutoDeployConfig, 'enabled'>) => {
    capitalManager.setAutoDeployConfig({ ...config, enabled: true });
    setState(prev => ({ ...prev, autoDeployEnabled: true }));
  }, []);

  // Disable auto-deployment
  const disableAutoDeploy = useCallback(() => {
    capitalManager.setAutoDeployConfig(null);
    setState(prev => ({ ...prev, autoDeployEnabled: false }));
  }, []);

  // Sync open trades manually
  const syncOpenTrades = useCallback(async () => {
    if (!user?.id) return;
    await capitalManager.syncOpenTrades(user.id);
  }, [user?.id]);

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
    enableAutoDeploy,
    disableAutoDeploy,
    syncOpenTrades,
    getPositions: (exchange: string, symbol?: string) => capitalManager.getPositions(exchange, symbol),
  };
}
