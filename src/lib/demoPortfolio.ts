// Demo portfolio generator - creates synthetic holdings based on virtual balance and real prices

interface DemoHolding {
  symbol: string;
  quantity: number;
  value: number;
  percent: number;
  averageBuyPrice: number;
}

interface PriceData {
  symbol: string;
  price: number;
  change_24h?: number;
}

interface DemoAllocation {
  USDT: number;
  BTC: number;
  ETH: number;
  SOL: number;
}

// Default allocation percentages for demo portfolio
export const DEFAULT_DEMO_ALLOCATIONS: DemoAllocation = {
  USDT: 50,
  BTC: 25,
  ETH: 15,
  SOL: 10,
};

export function generateDemoPortfolio(
  virtualBalance: number,
  prices: PriceData[],
  allocation: DemoAllocation = DEFAULT_DEMO_ALLOCATIONS
): DemoHolding[] {
  const holdings: DemoHolding[] = [];
  
  const allocations = [
    { symbol: 'USDT', percent: allocation.USDT },
    { symbol: 'BTC', percent: allocation.BTC },
    { symbol: 'ETH', percent: allocation.ETH },
    { symbol: 'SOL', percent: allocation.SOL },
  ];

  allocations.forEach(alloc => {
    const value = (virtualBalance * alloc.percent) / 100;
    
    if (alloc.symbol === 'USDT') {
      // USDT is 1:1, no price lookup needed
      holdings.push({
        symbol: 'USDT',
        quantity: value,
        value,
        percent: alloc.percent,
        averageBuyPrice: 1,
      });
    } else {
      // Find real price for crypto asset
      const priceData = prices.find(p => 
        p.symbol.toUpperCase() === alloc.symbol.toUpperCase()
      );
      
      if (priceData && priceData.price > 0) {
        const quantity = value / priceData.price;
        holdings.push({
          symbol: alloc.symbol,
          quantity,
          value,
          percent: alloc.percent,
          averageBuyPrice: priceData.price * 0.95, // Simulate 5% gain average
        });
      }
    }
  });
  
  return holdings;
}

// Calculate demo portfolio total value with real-time prices
export function calculateDemoPortfolioValue(
  virtualBalance: number,
  prices: PriceData[],
  allocation: DemoAllocation = DEFAULT_DEMO_ALLOCATIONS
): { totalValue: number; change24h: number; changePercent: number } {
  const holdings = generateDemoPortfolio(virtualBalance, prices, allocation);
  
  let totalValue = 0;
  let totalChange = 0;
  
  holdings.forEach(holding => {
    const priceData = prices.find(p => 
      p.symbol.toUpperCase() === holding.symbol.toUpperCase()
    );
    
    if (holding.symbol === 'USDT') {
      totalValue += holding.value;
      // USDT has no change
    } else if (priceData) {
      // Use real-time price to calculate current value
      const currentValue = holding.quantity * priceData.price;
      totalValue += currentValue;
      
      // Calculate 24h change based on price change
      const changeAmount = currentValue * (priceData.change_24h || 0) / 100;
      totalChange += changeAmount;
    } else {
      totalValue += holding.value;
    }
  });
  
  const changePercent = totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0;
  
  return {
    totalValue,
    change24h: totalChange,
    changePercent,
  };
}

// Generate demo USDT float per exchange
export function generateDemoUsdtFloat(virtualBalance: number): Array<{ exchange: string; amount: number }> {
  const exchangeAllocations = [
    { exchange: 'Binance', percent: 30 },
    { exchange: 'OKX', percent: 25 },
    { exchange: 'Bybit', percent: 20 },
    { exchange: 'Kraken', percent: 15 },
    { exchange: 'Nexo', percent: 10 },
  ];
  
  return exchangeAllocations.map(ea => ({
    exchange: ea.exchange,
    amount: Math.round((virtualBalance * ea.percent) / 100),
  }));
}
