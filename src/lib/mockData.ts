// Mock data for CryptoArb Dashboard

export const tickerData = [
  { symbol: 'ETH', price: 3456.78, change: -0.45 },
  { symbol: 'SOL', price: 178.92, change: 3.21 },
  { symbol: 'XRP', price: 0.52, change: 0.87 },
  { symbol: 'DOGE', price: 0.12, change: -1.23 },
  { symbol: 'ADA', price: 0.46, change: 2.15 },
  { symbol: 'AVAX', price: 42.50, change: 4.32 },
  { symbol: 'LINK', price: 14.20, change: 1.87 },
  { symbol: 'DOT', price: 7.12, change: -0.92 },
  { symbol: 'MATIC', price: 0.89, change: 2.45 },
  { symbol: 'BTC', price: 67500.00, change: 1.87 },
];

export const portfolioData = {
  totalValue: 125000,
  change24h: 2340,
  changePercent: 1.87,
  holdings: [
    { symbol: 'BTC', value: 62500, percent: 50 },
    { symbol: 'ETH', value: 37500, percent: 30 },
    { symbol: 'USDT', value: 25000, percent: 20 },
  ],
};

export const opportunitiesData = {
  topProfit: 3.50,
  avgProfit: 1.20,
  crossEx: 0.8,
  triangular: 0.7,
  funding: 0.6,
  liveCount: 50,
};

export const autoEarnData = {
  activeStrategies: 0,
  totalStrategies: 7,
  earnings24h: 0,
  dailyProfitTarget: 0.55,
  bestStrategy: 'Stablecoin Yield',
};

export const aiSummaryData = {
  updatedAgo: '5m',
  topOpportunities: [
    { pair: 'AVAX/USDT', route: 'Aave', profit: 3.26 },
    { pair: 'AVAX/USDT', route: 'Nexo', profit: 3.25 },
    { pair: 'SOL/USDT', route: 'KuCoin', profit: 2.61 },
  ],
  bestStrategy: 'Stablecoin Yield',
  bestStrategyProfit: 0.55,
  signalsWinRate: 72.5,
  profit24h: 1847.32,
  trades24h: 28,
};

export const arbitrageOpportunities = [
  { id: 1, pair: 'ETH/USDT', route: 'Kraken → Hyperliquid', buyPrice: 3450.00, sellPrice: 3570.75, profitPercent: 3.50, profitUsd: 35.00, volume24h: '25.21M', expires: '1:35', amount: 1000, type: 'CEX' },
  { id: 2, pair: 'LINK/USDT', route: 'OKX → Bybit', buyPrice: 108.00, sellPrice: 111.71, profitPercent: 3.44, profitUsd: 34.35, volume24h: '30.81M', expires: '2:18', amount: 1000, type: 'CEX' },
  { id: 3, pair: 'DOGE/USDT', route: 'dYdX → Uniswap', buyPrice: 82.00, sellPrice: 84.76, profitPercent: 3.37, profitUsd: 33.70, volume24h: '33.92M', expires: '3:54', amount: 1000, type: 'DeFi' },
  { id: 4, pair: 'BTC/USDT', route: 'Hyperliquid → Bybit', buyPrice: 67500.00, sellPrice: 69730.88, profitPercent: 3.31, profitUsd: 33.05, volume24h: '29.85M', expires: '4:52', amount: 1000, type: 'CEX' },
  { id: 5, pair: 'SOL/USDT', route: 'Bybit → Hyperliquid', buyPrice: 63.00, sellPrice: 65.04, profitPercent: 3.24, profitUsd: 32.40, volume24h: '32.01M', expires: '5:44', amount: 1000, type: 'CEX' },
  { id: 6, pair: 'XRP/USDT', route: 'Compound → Curve', buyPrice: 137.00, sellPrice: 141.35, profitPercent: 3.17, profitUsd: 31.75, volume24h: '27.60M', expires: '3:25', amount: 1000, type: 'DeFi' },
  { id: 7, pair: 'AVAX/USDT', route: 'Binance → KuCoin', buyPrice: 42.00, sellPrice: 43.26, profitPercent: 3.00, profitUsd: 30.00, volume24h: '18.45M', expires: '2:10', amount: 1000, type: 'CEX' },
  { id: 8, pair: 'DOT/USDT', route: 'Kraken → OKX', buyPrice: 7.10, sellPrice: 7.30, profitPercent: 2.82, profitUsd: 28.20, volume24h: '12.33M', expires: '4:15', amount: 1000, type: 'CEX' },
];

export const newsData = [
  {
    id: 1,
    title: 'Bitcoin Surges Past $68,000 as Institutional Demand Grows',
    summary: 'Major institutional investors are increasing their Bitcoin holdings, with several hedge funds...',
    source: 'CryptoCompare',
    timestamp: '36 minutes ago',
  },
  {
    id: 2,
    title: 'Ethereum Layer 2 Solutions See Record TVL',
    summary: 'Arbitrum and Optimism have reached all-time high Total Value Locked as users seek lower transactio...',
    source: 'DeFiLlama',
    timestamp: 'about 1 hour ago',
  },
  {
    id: 3,
    title: 'SEC Approves New Crypto ETF Applications',
    summary: 'Regulatory clarity continues to improve as multiple spot crypto ETF applications receive approva...',
    source: 'Bloomberg',
    timestamp: 'about 2 hours ago',
  },
  {
    id: 4,
    title: 'Solana Network Achieves New TPS Record',
    summary: 'The Solana blockchain has processed over 65,000 transactions per second during peak activity...',
    source: 'CoinDesk',
    timestamp: '3 hours ago',
  },
];

export const signalsData = [
  { id: 1, pair: 'BTC/USDT', exchange: 'Binance', direction: 'LONG', entry: 67500.00, tp1: 67905.00, tp2: 68445.00, tp3: 68985.00, sl: 66487.50, amount: 1000, leverage: 10, risk: 'LOW', profit: '+220.00$', expires: '5:00' },
  { id: 2, pair: 'ETH/USDT', exchange: 'Bybit', direction: 'LONG', entry: 3450.00, tp1: 3470.70, tp2: 3498.30, tp3: 3525.90, sl: 3398.25, amount: 1000, leverage: 10, risk: 'LOW', profit: '+220.00$', expires: '4:15' },
  { id: 3, pair: 'SOL/USDT', exchange: 'OKX', direction: 'LONG', entry: 178.00, tp1: 179.07, tp2: 180.49, tp3: 181.92, sl: 175.33, amount: 1000, leverage: 10, risk: 'MEDIUM', profit: '+220.00$', expires: '3:30' },
  { id: 4, pair: 'XRP/USDT', exchange: 'KuCoin', direction: 'LONG', entry: 0.52, tp1: 0.52, tp2: 0.53, tp3: 0.53, sl: 0.51, amount: 1000, leverage: 10, risk: 'MEDIUM', profit: '+220.00$', expires: '2:45' },
  { id: 5, pair: 'LINK/USDT', exchange: 'Hyperliquid', direction: 'LONG', entry: 14.20, tp1: 14.29, tp2: 14.40, tp3: 14.51, sl: 13.99, amount: 1000, leverage: 10, risk: 'HIGH', profit: '+220.00$', expires: '2:00' },
  { id: 6, pair: 'AVAX/USDT', exchange: 'OKX', direction: 'SHORT', entry: 85.00, tp1: 84.49, tp2: 83.81, tp3: 83.13, sl: 86.27, amount: 1000, leverage: 5, risk: 'LOW', profit: '+110.00$', expires: '4:40' },
  { id: 7, pair: 'DOGE/USDT', exchange: 'KuCoin', direction: 'SHORT', entry: 0.12, tp1: 0.12, tp2: 0.12, tp3: 0.12, sl: 0.12, amount: 1000, leverage: 5, risk: 'LOW', profit: '+110.00$', expires: '4:00' },
  { id: 8, pair: 'ADA/USDT', exchange: 'Hyperliquid', direction: 'SHORT', entry: 0.46, tp1: 0.46, tp2: 0.45, tp3: 0.45, sl: 0.47, amount: 1000, leverage: 5, risk: 'MEDIUM', profit: '+110.00$', expires: '3:20' },
  { id: 9, pair: 'DOT/USDT', exchange: 'Binance', direction: 'SHORT', entry: 7.12, tp1: 7.08, tp2: 7.02, tp3: 6.96, sl: 7.23, amount: 1000, leverage: 5, risk: 'MEDIUM', profit: '+110.00$', expires: '2:40' },
  { id: 10, pair: 'MATIC/USDT', exchange: 'Bybit', direction: 'SHORT', entry: 158.00, tp1: 157.05, tp2: 155.79, tp3: 154.52, sl: 160.37, amount: 1000, leverage: 5, risk: 'HIGH', profit: '+110.00$', expires: '2:00' },
];

export const autoEarnStrategies = [
  { id: 1, name: 'Cross-Exchange Arbitrage', description: 'Exploit price differences between CEX pairs', exchange: 'Binance ↔ Bybit', dailyProfit: '0.3-0.8%', requiredUsdt: 5000, riskScore: 'MEDIUM', type: 'CEX', maxLeverage: 20, status: 'idle' },
  { id: 2, name: 'Triangular Arbitrage', description: 'Profit from 3-way currency pair inefficiencies', exchange: 'KuCoin', dailyProfit: '0.2-0.5%', requiredUsdt: 3000, riskScore: 'LOW', type: 'CEX', maxLeverage: 10, status: 'idle' },
  { id: 3, name: 'Funding Rate Arbitrage', description: 'Capitalize on perpetual futures funding rates', exchange: 'Hyperliquid', dailyProfit: '0.1-0.4%', requiredUsdt: 10000, riskScore: 'LOW', type: 'CEX', maxLeverage: 50, status: 'idle' },
  { id: 4, name: 'Stablecoin Yield', description: 'Earn yields on stablecoin deposits', exchange: 'Nexo', dailyProfit: '0.55%', requiredUsdt: 1000, riskScore: 'LOW', type: 'CEX', maxLeverage: 1, status: 'idle' },
  { id: 5, name: 'Volatility Scalping', description: 'Quick trades during high volatility periods', exchange: 'OKX', dailyProfit: '0.5-1.5%', requiredUsdt: 2000, riskScore: 'HIGH', type: 'CEX', maxLeverage: 25, status: 'idle' },
  { id: 6, name: 'DeFi Yield Farming', description: 'Provide liquidity to DeFi protocols for yield', exchange: 'Aave / Curve', dailyProfit: '0.3-0.6%', requiredUsdt: 5000, riskScore: 'MEDIUM', type: 'DeFi', maxLeverage: 1, status: 'idle' },
  { id: 7, name: 'Liquidity Provision', description: 'Earn fees by providing DEX liquidity', exchange: 'Uniswap / GMX', dailyProfit: '0.2-0.5%', requiredUsdt: 3000, riskScore: 'MEDIUM', type: 'DeFi', maxLeverage: 1, status: 'idle' },
];

export const airdropData = [
  { id: 1, project: 'LayerZero', token: '$ZRO', network: 'Ethereum', eligibility: 'Eligible', potentialValue: 1200, claimDeadline: 'Dec 31, 2024', status: 'claimable' },
  { id: 2, project: 'zkSync Era', token: '$ZK', network: 'zkSync', eligibility: 'Eligible', potentialValue: 850, claimDeadline: 'Jan 15, 2025', status: 'claimable' },
  { id: 3, project: 'Starknet', token: '$STRK', network: 'Starknet', eligibility: 'Pending', potentialValue: 500, claimDeadline: 'Feb 1, 2025', status: 'pending' },
  { id: 4, project: 'Scroll', token: '$SCR', network: 'Scroll', eligibility: 'Not Eligible', potentialValue: 300, claimDeadline: 'N/A', status: 'not-eligible' },
  { id: 5, project: 'Blast', token: '$BLAST', network: 'Blast', eligibility: 'Eligible', potentialValue: 2100, claimDeadline: 'Dec 20, 2024', status: 'claimable' },
  { id: 6, project: 'Linea', token: '$LNA', network: 'Linea', eligibility: 'Pending', potentialValue: 400, claimDeadline: 'TBA', status: 'pending' },
];

export const riskData = {
  totalExposure: 125000,
  portfolioVaR: 3.03,
  sharpeRatio: 1.77,
  overallRisk: 'MEDIUM',
  assetsRequiringHedge: 2,
  assets: [
    { asset: 'BTC/USDT', exposure: 45000, var95: 2.8, sharpeRatio: 1.85, riskScore: 'MEDIUM', suggestedHedge: 'Short 0.2 BTC via Bybit' },
    { asset: 'ETH/USDT', exposure: 28000, var95: 3.2, sharpeRatio: 1.65, riskScore: 'MEDIUM', suggestedHedge: 'Short 2 ETH via OKX' },
    { asset: 'SOL/USDT', exposure: 15000, var95: 4.5, sharpeRatio: 1.42, riskScore: 'HIGH', suggestedHedge: 'Short 50 SOL via Hyperliquid' },
    { asset: 'AVAX/USDT', exposure: 12000, var95: 4.1, sharpeRatio: 1.38, riskScore: 'HIGH', suggestedHedge: 'Short 80 AVAX via KuCoin' },
    { asset: 'LINK/USDT', exposure: 8000, var95: 3.5, sharpeRatio: 1.52, riskScore: 'MEDIUM', suggestedHedge: 'Short 300 LINK via Binance' },
    { asset: 'Stablecoins', exposure: 17000, var95: 0.1, sharpeRatio: 2.80, riskScore: 'LOW', suggestedHedge: 'No hedge needed' },
  ],
};

export const sandboxData = {
  virtualBalance: 10000,
  status: 'IDLE',
  backtestPeriod: { start: '01/01/2024', end: '01/12/2024' },
  selectedAsset: 'BTC/USDT',
  summary: {
    totalPnL: 2830,
    totalTrades: 77,
    winRate: 72.7,
    finalBalance: 12830,
  },
  monthlyBreakdown: [
    { period: 'Jan 2024', pnl: 450, trades: 12, winRate: 75 },
    { period: 'Feb 2024', pnl: 680, trades: 15, winRate: 73 },
    { period: 'Mar 2024', pnl: -120, trades: 8, winRate: 50 },
    { period: 'Apr 2024', pnl: 920, trades: 18, winRate: 78 },
    { period: 'May 2024', pnl: 340, trades: 10, winRate: 70 },
    { period: 'Jun 2024', pnl: 560, trades: 14, winRate: 71 },
  ],
};

export const botsData = {
  activeBots: 1,
  bots: [
    { id: 1, name: 'Peanuts', type: 'AI Grid Arbitrage', status: 'Running', todayProfit: 18.50, tradesToday: 37, dailyGoal: 30 },
    { id: 2, name: 'Peanuts Pro', type: 'Multi-Exchange Grid', status: 'Stopped', todayProfit: 0, tradesToday: 0, dailyGoal: 30 },
  ],
  config: {
    tradingAmount: 5000,
    profitPerTrade: 0.50,
    potential24h: 60.00,
    maxTrades24h: 2880,
  },
  activeExchanges: ['Binance', 'Bybit', 'KuCoin', 'Nexo.com'],
  usdtFloat: [
    { exchange: 'Binance', amount: 2500 },
    { exchange: 'Bybit', amount: 1800 },
    { exchange: 'OKX', amount: 0, warning: true },
    { exchange: 'KuCoin', amount: 950 },
    { exchange: 'Hyperliquid', amount: 0, warning: true },
    { exchange: 'Kraken', amount: 350, warning: true },
    { exchange: 'Nexo.com', amount: 5000 },
  ],
};

export const exchangeConnections = [
  { id: 'binance', name: 'Binance', color: '#F0B90B', connected: false },
  { id: 'bybit', name: 'Bybit', color: '#F7A600', connected: false },
  { id: 'okx', name: 'OKX', color: '#FFFFFF', connected: false },
  { id: 'kucoin', name: 'KuCoin', color: '#23AF91', connected: false },
  { id: 'hyperliquid', name: 'Hyperliquid', color: '#6366F1', connected: false },
  { id: 'kraken', name: 'Kraken', color: '#7B61FF', connected: false },
  { id: 'nexo', name: 'Nexo.com', color: '#1A4FBA', connected: false },
];

export const demoAccountData = {
  apiConnections: [
    { id: 'coingecko', name: 'CoinGecko API', icon: '🦎', connected: true },
    { id: 'cryptocompare', name: 'CryptoCompare', icon: '📊', connected: true },
    { id: 'youtube', name: 'YouTube API', icon: '▶️', connected: false },
  ],
  defiWallets: [
    { id: 'metamask', name: 'MetaMask', icon: '🦊', connected: false },
    { id: 'phantom', name: 'Phantom', icon: '👻', connected: false },
  ],
  visibility: {
    portfolio: true,
    opportunities: true,
    autoEarn: true,
    aiSummary: true,
    signals: true,
    news: true,
    videos: true,
  },
  alertSettings: {
    profitThreshold: 2,
    pushNotifications: true,
    emailAlerts: false,
    soundAlerts: true,
  },
};
