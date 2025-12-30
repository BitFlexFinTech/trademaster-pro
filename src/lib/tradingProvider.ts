/**
 * Trading Provider Interface - Live/Demo Mode Parity
 * Unified interface ensuring both modes use identical execution logic
 */

import { supabase } from '@/integrations/supabase/client';
import { demoDataStore } from './demoDataStore';
import { toast } from 'sonner';

export interface TradeOrder {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  price?: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  tradeId?: string;
  filledPrice?: number;
  filledQuantity?: number;
  commission?: number;
  error?: string;
  timestamp: number;
}

export interface BalanceInfo {
  exchange: string;
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface ITradingProvider {
  readonly mode: 'live' | 'demo';
  
  // Order execution
  executeOrder(exchange: string, order: TradeOrder): Promise<TradeResult>;
  cancelOrder(exchange: string, orderId: string): Promise<boolean>;
  
  // Balance queries
  getBalance(exchange: string, asset?: string): Promise<BalanceInfo[]>;
  
  // Position management
  getOpenPositions(exchange: string): Promise<any[]>;
  closePosition(exchange: string, symbol: string, quantity?: number): Promise<TradeResult>;
  closeAllPositions(exchange: string): Promise<{ closed: number; errors: number }>;
}

/**
 * Live Trading Provider - Real exchange execution via Edge Functions
 */
export class LiveTradingProvider implements ITradingProvider {
  readonly mode = 'live' as const;

  async executeOrder(exchange: string, order: TradeOrder): Promise<TradeResult> {
    try {
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          exchange,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          quantity: order.quantity,
          price: order.price,
          leverage: order.leverage,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        },
      });

      if (error) throw error;

      return {
        success: data?.success ?? false,
        orderId: data?.orderId,
        tradeId: data?.tradeId,
        filledPrice: data?.filledPrice,
        filledQuantity: data?.filledQuantity,
        commission: data?.commission,
        error: data?.error,
        timestamp: Date.now(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Trade execution failed', { description: errorMessage });
      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  async cancelOrder(exchange: string, orderId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('cancel-stale-orders', {
        body: { exchange, orderId },
      });

      if (error) throw error;
      return data?.success ?? false;
    } catch (err) {
      toast.error('Failed to cancel order');
      return false;
    }
  }

  async getBalance(exchange: string, asset?: string): Promise<BalanceInfo[]> {
    try {
      const { data, error } = await supabase.functions.invoke('sync-exchange-balances', {
        body: { exchange, asset },
      });

      if (error) throw error;
      return data?.balances ?? [];
    } catch (err) {
      toast.error('Failed to fetch balance');
      return [];
    }
  }

  async getOpenPositions(exchange: string): Promise<any[]> {
    try {
      const { data, error } = await supabase.functions.invoke('binance-futures-positions', {
        body: { exchange },
      });

      if (error) throw error;
      return data?.positions ?? [];
    } catch (err) {
      return [];
    }
  }

  async closePosition(exchange: string, symbol: string, quantity?: number): Promise<TradeResult> {
    try {
      const { data, error } = await supabase.functions.invoke('convert-to-usdt', {
        body: { exchange, symbol, quantity },
      });

      if (error) throw error;

      return {
        success: data?.success ?? false,
        filledPrice: data?.filledPrice,
        timestamp: Date.now(),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  async closeAllPositions(exchange: string): Promise<{ closed: number; errors: number }> {
    try {
      const { data, error } = await supabase.functions.invoke('convert-to-usdt', {
        body: { exchange, closeAll: true },
      });

      if (error) throw error;

      const successCount = data?.closedPositions?.filter((p: any) => p.success).length ?? 0;
      const errorCount = data?.closedPositions?.filter((p: any) => !p.success).length ?? 0;

      return { closed: successCount, errors: errorCount };
    } catch (err) {
      toast.error('Failed to close positions');
      return { closed: 0, errors: 1 };
    }
  }
}

/**
 * Demo Trading Provider - Simulated execution with local state
 */
export class DemoTradingProvider implements ITradingProvider {
  readonly mode = 'demo' as const;

  async executeOrder(exchange: string, order: TradeOrder): Promise<TradeResult> {
    // Simulate network latency
    await this.simulateLatency();

    // Get current price (would come from WebSocket in real implementation)
    const currentPrice = order.price || this.getSimulatedPrice(order.symbol);
    
    // Simulate fill with slight slippage
    const slippage = (Math.random() - 0.5) * 0.001; // ±0.05% slippage
    const filledPrice = currentPrice * (1 + slippage);
    const commission = order.quantity * filledPrice * 0.001; // 0.1% fee

    const tradeId = `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Store in demo data store
    demoDataStore.addTrade({
      id: tradeId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: filledPrice,
      commission,
      timestamp: Date.now(),
      exchange,
    });

    return {
      success: true,
      orderId: tradeId,
      tradeId,
      filledPrice,
      filledQuantity: order.quantity,
      commission,
      timestamp: Date.now(),
    };
  }

  async cancelOrder(_exchange: string, orderId: string): Promise<boolean> {
    await this.simulateLatency();
    demoDataStore.removeOrder(orderId);
    return true;
  }

  async getBalance(exchange: string, asset?: string): Promise<BalanceInfo[]> {
    await this.simulateLatency();
    return demoDataStore.getBalances(exchange, asset);
  }

  async getOpenPositions(exchange: string): Promise<any[]> {
    await this.simulateLatency();
    return demoDataStore.getOpenPositions(exchange);
  }

  async closePosition(exchange: string, symbol: string, _quantity?: number): Promise<TradeResult> {
    await this.simulateLatency();
    
    const position = demoDataStore.getPosition(exchange, symbol);
    if (!position) {
      return {
        success: false,
        error: 'Position not found',
        timestamp: Date.now(),
      };
    }

    demoDataStore.closePosition(exchange, symbol);
    
    return {
      success: true,
      filledPrice: this.getSimulatedPrice(symbol),
      timestamp: Date.now(),
    };
  }

  async closeAllPositions(exchange: string): Promise<{ closed: number; errors: number }> {
    await this.simulateLatency();
    const count = demoDataStore.closeAllPositions(exchange);
    return { closed: count, errors: 0 };
  }

  private async simulateLatency(): Promise<void> {
    const latency = 50 + Math.random() * 100; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, latency));
  }

  private getSimulatedPrice(symbol: string): number {
    // Base prices for common pairs
    const basePrices: Record<string, number> = {
      BTCUSDT: 95000,
      ETHUSDT: 3400,
      BNBUSDT: 700,
      SOLUSDT: 190,
      XRPUSDT: 2.2,
    };
    
    const base = basePrices[symbol.toUpperCase()] || 100;
    // Add some random movement
    return base * (1 + (Math.random() - 0.5) * 0.002);
  }
}

/**
 * Get the appropriate trading provider based on mode
 */
export function getTradingProvider(mode: 'live' | 'demo'): ITradingProvider {
  if (mode === 'live') {
    return new LiveTradingProvider();
  }
  return new DemoTradingProvider();
}

// Singleton instances
export const liveTradingProvider = new LiveTradingProvider();
export const demoTradingProvider = new DemoTradingProvider();
