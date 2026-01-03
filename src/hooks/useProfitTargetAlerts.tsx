/**
 * Profit Target Alerts Hook
 * Notifies when positions are within 10% of profit target
 * Allows manual intervention before auto-close
 */

import { useEffect, useRef } from 'react';
import { useBotStore } from '@/stores/botStore';
import { useNotificationStack } from './useNotificationStack';

interface AlertedPosition {
  id: string;
  alertedAt: number;
}

export function useProfitTargetAlerts() {
  const positions = useBotStore(state => state.positions);
  const { notify } = useNotificationStack();
  const alertedPositions = useRef<Map<string, AlertedPosition>>(new Map());
  
  useEffect(() => {
    const ALERT_COOLDOWN = 60000; // Don't re-alert same position for 1 minute
    const now = Date.now();
    
    positions.forEach(pos => {
      // Determine profit target based on leverage
      const profitTarget = (pos.leverage && pos.leverage > 1) ? 3 : 1; // $3 for leverage, $1 for spot
      const threshold = profitTarget * 0.9; // 90% of target (within 10%)
      
      const unrealizedPnL = pos.unrealizedPnL || 0;
      
      // Check if position is approaching profit target
      if (unrealizedPnL >= threshold && unrealizedPnL < profitTarget) {
        const existingAlert = alertedPositions.current.get(pos.id);
        
        // Only alert if we haven't alerted recently
        if (!existingAlert || (now - existingAlert.alertedAt > ALERT_COOLDOWN)) {
          const progressPercent = ((unrealizedPnL / profitTarget) * 100).toFixed(0);
          
          notify({
            type: 'info',
            title: '📈 Approaching Profit Target',
            message: `${pos.symbol} is at $${unrealizedPnL.toFixed(2)} (${progressPercent}% of $${profitTarget} target). Consider manual intervention.`,
            autoDismiss: true,
            duration: 15000,
            dismissable: true,
          });
          
          alertedPositions.current.set(pos.id, {
            id: pos.id,
            alertedAt: now,
          });
        }
      }
      
      // Clear alert tracking when position closes or falls below threshold
      if (unrealizedPnL < threshold * 0.8) {
        alertedPositions.current.delete(pos.id);
      }
    });
    
    // Cleanup old alerts for positions that no longer exist
    const currentPositionIds = new Set(positions.map(p => p.id));
    alertedPositions.current.forEach((_, id) => {
      if (!currentPositionIds.has(id)) {
        alertedPositions.current.delete(id);
      }
    });
  }, [positions, notify]);
}
