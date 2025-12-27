// Vibrant flat color palette for charts (Tekashi 69 inspired spectrum)
export const VIBRANT_CHART_COLORS = [
  'hsl(152, 100%, 50%)',  // Lime green (primary)
  'hsl(195, 100%, 50%)',  // Electric blue
  'hsl(328, 100%, 54%)',  // Neon pink
  'hsl(51, 100%, 50%)',   // Golden yellow
  'hsl(270, 50%, 53%)',   // Cyber purple
  'hsl(174, 72%, 56%)',   // Turquoise
  'hsl(18, 100%, 60%)',   // Hot orange
];

// Hex versions for libraries that don't support HSL
export const VIBRANT_CHART_COLORS_HEX = [
  '#00FF88', // Lime green
  '#00BFFF', // Electric blue
  '#FF1493', // Neon pink
  '#FFD700', // Golden yellow
  '#9B59B6', // Cyber purple
  '#40E0D0', // Turquoise
  '#FF6B35', // Hot orange
];

// Regime colors
export const REGIME_COLORS = {
  BULL: 'hsl(152, 100%, 50%)',   // Lime green
  BEAR: 'hsl(0, 100%, 71%)',     // Coral red
  CHOP: 'hsl(18, 100%, 60%)',    // Hot orange
};

export const REGIME_COLORS_HEX = {
  BULL: '#00FF88',
  BEAR: '#FF6B6B',
  CHOP: '#FF6B35',
};

// Bot accent colors
export const BOT_ACCENT_COLORS = {
  spot: 'hsl(195, 100%, 50%)',       // Electric blue
  leverage: 'hsl(328, 100%, 54%)',   // Neon pink
  defi: 'hsl(270, 50%, 53%)',        // Cyber purple
  grid: 'hsl(51, 100%, 50%)',        // Golden yellow
  arbitrage: 'hsl(174, 72%, 56%)',   // Turquoise
  custom: 'hsl(18, 100%, 60%)',      // Hot orange
};

export const BOT_ACCENT_COLORS_HEX = {
  spot: '#00BFFF',
  leverage: '#FF1493',
  defi: '#9B59B6',
  grid: '#FFD700',
  arbitrage: '#40E0D0',
  custom: '#FF6B35',
};

// Dashboard card colors
export const DASHBOARD_CARD_COLORS = {
  portfolioHealth: 'hsl(51, 100%, 50%)',   // Golden yellow
  aiCopilot: 'hsl(270, 50%, 53%)',         // Cyber purple
  pnlTicker: 'hsl(195, 100%, 50%)',        // Electric blue
  hitRateGauge: 'hsl(174, 72%, 56%)',      // Turquoise
  riskDashboard: 'hsl(328, 100%, 54%)',    // Neon pink
  rateLimitMonitor: 'hsl(120, 100%, 80%)', // Mint
};

// Exchange colors for status widget
export const EXCHANGE_COLORS = {
  Binance: '#F0B90B',
  OKX: '#FFFFFF',
  Bybit: '#F7A600',
  KuCoin: '#24AE8F',
  Kraken: '#5741D9',
  Nexo: '#4DA3FF',
  Hyperliquid: '#00FF88',
};

// Get color for recharts by index
export function getChartColor(index: number): string {
  return VIBRANT_CHART_COLORS_HEX[index % VIBRANT_CHART_COLORS_HEX.length];
}

// Get recharts config object
export function getRechartsConfig(keys: string[]) {
  return keys.reduce((acc, key, index) => {
    acc[key] = {
      color: getChartColor(index),
      label: key,
    };
    return acc;
  }, {} as Record<string, { color: string; label: string }>);
}
