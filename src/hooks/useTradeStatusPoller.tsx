/**
 * Trade Status Poller Hook - Phase 3
 * Centralized polling for PENDING trades to track limit order fills and stop losses
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { calculateNetProfit } from '@/lib/exchangeFees';
import { toast } from 'sonner';

interface PendingTrade {
  tradeId: string;
  entryOrderId: string;
  exitOrderId: string;
  exchange: string;
  symbol: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetExitPrice: number;
  positionSize: number;
  quantity: string;
  placedAt: string;
  stopLossPrice?: number;
  leverage: number;
}

interface TradeStatusResult {
  filled: boolean;
  cancelled: boolean;
  avgPrice: number;
  pnl: number;
  isWin: boolean;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIMEOUT' | 'CANCELLED' | 'PENDING';
}

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_TIME_MS = 30000; // Max 30 seconds polling
const STOP_LOSS_PERCENT = 0.2; // 0.2% stop loss

export function useTradeStatusPoller() {
  const { user } = useAuth();
  const [pendingTrades, setPendingTrades] = useState<Map<string, PendingTrade>>(new Map());
  const [completedTrades, setCompletedTrades] = useState<TradeStatusResult[]>([]);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pricesRef = useRef<Map<string, number>>(new Map());

  // Update price reference for stop loss checking
  const updatePrice = useCallback((symbol: string, price: number) => {
    pricesRef.current.set(symbol, price);
  }, []);

  // Add a pending trade to poll
  const addPendingTrade = useCallback((trade: PendingTrade) => {
    console.log(`📋 Adding pending trade for polling: ${trade.tradeId}`);
    setPendingTrades(prev => {
      const next = new Map(prev);
      next.set(trade.tradeId, trade);
      return next;
    });
    
    // Start polling for this trade
    startPolling(trade);
  }, []);

  // Check if stop loss is hit based on current price
  const checkStopLoss = useCallback((trade: PendingTrade): boolean => {
    const currentPrice = pricesRef.current.get(trade.symbol.replace('/', ''));
    if (!currentPrice) return false;

    const slPrice = trade.direction === 'long'
      ? trade.entryPrice * (1 - STOP_LOSS_PERCENT / 100)
      : trade.entryPrice * (1 + STOP_LOSS_PERCENT / 100);

    const slHit = trade.direction === 'long'
      ? currentPrice <= slPrice
      : currentPrice >= slPrice;

    if (slHit) {
      console.log(`🛑 STOP LOSS HIT for ${trade.pair}: Current ${currentPrice}, SL ${slPrice}`);
    }

    return slHit;
  }, []);

  // Poll for trade status
  const pollTradeStatus = useCallback(async (trade: PendingTrade): Promise<TradeStatusResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: {
          exchange: trade.exchange,
          orderId: trade.exitOrderId,
          symbol: trade.symbol.replace('/', ''),
          tradeId: trade.tradeId,
        }
      });

      if (error) {
        console.error('Error checking trade status:', error);
        return null;
      }

      if (data?.filled) {
        // Trade completed - calculate P&L
        const exitPrice = data.avgPrice || trade.targetExitPrice;
        const pnl = calculateNetProfit(trade.entryPrice, exitPrice, trade.positionSize, trade.exchange) * trade.leverage;
        const isWin = pnl > 0;

        console.log(`✅ Trade FILLED: ${trade.pair} @ ${exitPrice}, P&L: $${pnl.toFixed(2)}`);

        return {
          filled: true,
          cancelled: false,
          avgPrice: exitPrice,
          pnl,
          isWin,
          exitReason: 'TAKE_PROFIT',
        };
      }

      if (data?.status === 'CANCELLED') {
        return {
          filled: false,
          cancelled: true,
          avgPrice: 0,
          pnl: 0,
          isWin: false,
          exitReason: 'CANCELLED',
        };
      }

      // Check stop loss while waiting for limit order
      if (checkStopLoss(trade)) {
        // Cancel limit order and return stop loss result
        const currentPrice = pricesRef.current.get(trade.symbol.replace('/', '')) || trade.entryPrice;
        const pnl = calculateNetProfit(trade.entryPrice, currentPrice, trade.positionSize, trade.exchange) * trade.leverage;

        return {
          filled: true,
          cancelled: false,
          avgPrice: currentPrice,
          pnl,
          isWin: false,
          exitReason: 'STOP_LOSS',
        };
      }

      return null; // Still pending
    } catch (err) {
      console.error('Poll error:', err);
      return null;
    }
  }, [checkStopLoss]);

  // Start polling for a trade
  const startPolling = useCallback((trade: PendingTrade) => {
    const startTime = Date.now();

    const poll = async () => {
      const elapsed = Date.now() - startTime;

      // Timeout check
      if (elapsed >= MAX_POLL_TIME_MS) {
        console.log(`⏰ Polling timeout for ${trade.tradeId}`);
        stopPolling(trade.tradeId);
        
        // Mark as timeout - position may still be open
        const currentPrice = pricesRef.current.get(trade.symbol.replace('/', '')) || trade.entryPrice;
        const pnl = calculateNetProfit(trade.entryPrice, currentPrice, trade.positionSize, trade.exchange) * trade.leverage;
        
        const result: TradeStatusResult = {
          filled: false,
          cancelled: false,
          avgPrice: currentPrice,
          pnl,
          isWin: pnl > 0,
          exitReason: 'TIMEOUT',
        };
        
        setCompletedTrades(prev => [...prev, result]);
        setPendingTrades(prev => {
          const next = new Map(prev);
          next.delete(trade.tradeId);
          return next;
        });

        toast.warning('Trade timeout', {
          description: `${trade.pair} limit order didn't fill in time. Check exchange for open orders.`,
        });

        return;
      }

      const result = await pollTradeStatus(trade);
      
      if (result) {
        stopPolling(trade.tradeId);
        setCompletedTrades(prev => [...prev, result]);
        setPendingTrades(prev => {
          const next = new Map(prev);
          next.delete(trade.tradeId);
          return next;
        });

        // Update trade record in database
        await supabase.from('trades').update({
          exit_price: result.avgPrice,
          profit_loss: result.pnl,
          profit_percentage: (result.pnl / trade.positionSize) * 100,
          status: 'closed',
          closed_at: new Date().toISOString(),
        }).eq('id', trade.tradeId);

        // Show notification
        if (result.isWin) {
          toast.success(`${trade.pair} +$${result.pnl.toFixed(2)}`, {
            description: `Take profit hit at ${result.avgPrice.toFixed(4)}`,
          });
        } else if (result.exitReason === 'STOP_LOSS') {
          toast.error(`${trade.pair} -$${Math.abs(result.pnl).toFixed(2)}`, {
            description: `Stop loss triggered at ${result.avgPrice.toFixed(4)}`,
          });
        }

        return;
      }

      // Continue polling
      const timeout = setTimeout(poll, POLL_INTERVAL_MS);
      pollingRef.current.set(trade.tradeId, timeout);
    };

    // Start first poll
    poll();
  }, [pollTradeStatus]);

  // Stop polling for a trade
  const stopPolling = useCallback((tradeId: string) => {
    const timeout = pollingRef.current.get(tradeId);
    if (timeout) {
      clearTimeout(timeout);
      pollingRef.current.delete(tradeId);
    }
  }, []);

  // Stop all polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current.forEach(timeout => clearTimeout(timeout));
      pollingRef.current.clear();
    };
  }, []);

  // Get last completed trade
  const getLastCompletedTrade = useCallback(() => {
    return completedTrades[completedTrades.length - 1] || null;
  }, [completedTrades]);

  return {
    pendingTrades: Array.from(pendingTrades.values()),
    completedTrades,
    addPendingTrade,
    updatePrice,
    getLastCompletedTrade,
    hasPendingTrades: pendingTrades.size > 0,
  };
}
