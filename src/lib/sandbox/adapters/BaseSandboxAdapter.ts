import { SandboxExchangeAdapter, PaperOrder, Position, Balance } from '../types';

export class BaseSandboxAdapter implements SandboxExchangeAdapter {
  name: string;
  maxLeverage: number;
  fees: { maker: number; taker: number };
  
  private balance: number;
  private positions: Position[] = [];
  private orderCounter = 0;

  constructor(
    name: string,
    maxLeverage: number,
    fees: { maker: number; taker: number },
    initialBalance: number = 1000
  ) {
    this.name = name;
    this.maxLeverage = maxLeverage;
    this.fees = fees;
    this.balance = initialBalance;
  }

  async placeOrderPaper(order: Omit<PaperOrder, 'id' | 'timestamp'>): Promise<{
    success: boolean;
    orderId: string;
    fillPrice: number;
    slippage: number;
    fee: number;
  }> {
    // Simulate slippage (0.01% - 0.05%)
    const slippagePercent = 0.0001 + Math.random() * 0.0004;
    const slippageDirection = order.direction === 'long' ? 1 : -1;
    const slippage = order.entryPrice * slippagePercent * slippageDirection;
    const fillPrice = order.entryPrice + slippage;
    
    // Calculate fee
    const fee = order.amount * this.fees.taker;
    
    // Check if we have enough balance
    const requiredMargin = order.amount / order.leverage;
    if (requiredMargin + fee > this.balance) {
      return {
        success: false,
        orderId: '',
        fillPrice: 0,
        slippage: 0,
        fee: 0,
      };
    }
    
    // Deduct from balance
    this.balance -= (requiredMargin + fee);
    
    // Add position
    this.positions.push({
      pair: order.pair,
      direction: order.direction,
      entryPrice: fillPrice,
      amount: order.amount,
      unrealizedPnl: 0,
      exchange: this.name,
    });
    
    this.orderCounter++;
    
    return {
      success: true,
      orderId: `${this.name}-${this.orderCounter}-${Date.now()}`,
      fillPrice,
      slippage: Math.abs(slippage),
      fee,
    };
  }

  getPositions(): Position[] {
    return [...this.positions];
  }

  getBalance(): Balance {
    const inPosition = this.positions.reduce((sum, p) => sum + p.amount, 0);
    return {
      exchange: this.name,
      available: this.balance,
      inPosition,
      total: this.balance + inPosition,
    };
  }

  resetBalance(amount: number): void {
    this.balance = amount;
    this.positions = [];
  }

  closePosition(pair: string, exitPrice: number): { pnl: number; fee: number } | null {
    const posIndex = this.positions.findIndex(p => p.pair === pair);
    if (posIndex === -1) return null;
    
    const position = this.positions[posIndex];
    const priceChange = position.direction === 'long'
      ? (exitPrice - position.entryPrice) / position.entryPrice
      : (position.entryPrice - exitPrice) / position.entryPrice;
    
    const pnl = position.amount * priceChange;
    const fee = position.amount * this.fees.taker;
    
    // Return margin + pnl - fee to balance
    this.balance += position.amount + pnl - fee;
    
    // Remove position
    this.positions.splice(posIndex, 1);
    
    return { pnl, fee };
  }
}
