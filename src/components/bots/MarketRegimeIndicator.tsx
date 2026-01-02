import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssetTrend {
  symbol: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: number;
  price: number;
  change24h: number;
}

interface MarketRegimeIndicatorProps {
  className?: string;
}

// Top 10 cryptos to track
const TOP_CRYPTOS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 
  'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC'
];

export function MarketRegimeIndicator({ className }: MarketRegimeIndicatorProps) {
  const [assetTrends, setAssetTrends] = useState<AssetTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch price data and calculate trends
  const fetchTrends = async () => {
    try {
      const trends: AssetTrend[] = [];
      
      // Fetch prices from Binance
      const symbols = TOP_CRYPTOS.map(s => `${s}USDT`);
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        for (const ticker of data) {
          const symbol = ticker.symbol.replace('USDT', '');
          const price = parseFloat(ticker.lastPrice);
          const change24h = parseFloat(ticker.priceChangePercent);
          const momentum = parseFloat(ticker.priceChangePercent) / 100;
          
          // Determine trend based on 24h change
          let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
          if (change24h > 1) trend = 'bullish';
          else if (change24h < -1) trend = 'bearish';
          
          trends.push({
            symbol,
            trend,
            momentum,
            price,
            change24h,
          });
        }
      }
      
      setAssetTrends(trends);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch market trends:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
    const interval = setInterval(fetchTrends, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Calculate overall market regime
  const marketRegime = useMemo(() => {
    if (assetTrends.length === 0) return { regime: 'neutral' as const, confidence: 0 };
    
    const bullishCount = assetTrends.filter(a => a.trend === 'bullish').length;
    const bearishCount = assetTrends.filter(a => a.trend === 'bearish').length;
    const totalMomentum = assetTrends.reduce((sum, a) => sum + a.momentum, 0);
    const avgMomentum = totalMomentum / assetTrends.length;
    
    let regime: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let confidence = 50;
    
    if (bullishCount >= 6 && avgMomentum > 0.01) {
      regime = 'bullish';
      confidence = Math.min(95, 50 + bullishCount * 5);
    } else if (bearishCount >= 6 && avgMomentum < -0.01) {
      regime = 'bearish';
      confidence = Math.min(95, 50 + bearishCount * 5);
    } else if (bullishCount > bearishCount + 2) {
      regime = 'bullish';
      confidence = 60 + (bullishCount - bearishCount) * 5;
    } else if (bearishCount > bullishCount + 2) {
      regime = 'bearish';
      confidence = 60 + (bearishCount - bullishCount) * 5;
    }
    
    return { regime, confidence, bullishCount, bearishCount, avgMomentum };
  }, [assetTrends]);

  const regimeConfig = {
    bullish: {
      icon: TrendingUp,
      label: 'BULLISH',
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      description: 'Market trending up - favor LONG positions',
    },
    bearish: {
      icon: TrendingDown,
      label: 'BEARISH',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      description: 'Market trending down - favor SHORT positions',
    },
    neutral: {
      icon: Minus,
      label: 'NEUTRAL',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      description: 'Mixed signals - trade with caution',
    },
  };

  const config = regimeConfig[marketRegime.regime];
  const Icon = config.icon;

  return (
    <Card className={cn('overflow-hidden', config.border, className)}>
      <CardHeader className={cn('py-2 px-3', config.bg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Market Regime</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {lastUpdate.toLocaleTimeString()}
            </span>
            <RefreshCw 
              className={cn('h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground', loading && 'animate-spin')}
              onClick={() => { setLoading(true); fetchTrends(); }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {/* Main Regime Display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-full', config.bg)}>
              <Icon className={cn('h-5 w-5', config.color)} />
            </div>
            <div>
              <span className={cn('font-bold text-lg', config.color)}>
                {config.label}
              </span>
              <p className="text-[10px] text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <Badge variant="outline" className={cn('text-xs', config.color)}>
            {marketRegime.confidence}% confidence
          </Badge>
        </div>

        {/* Asset Grid */}
        <div className="grid grid-cols-5 gap-1">
          {assetTrends.slice(0, 10).map((asset) => (
            <div
              key={asset.symbol}
              className={cn(
                'flex flex-col items-center p-1 rounded text-center',
                asset.trend === 'bullish' && 'bg-green-500/10',
                asset.trend === 'bearish' && 'bg-red-500/10',
                asset.trend === 'neutral' && 'bg-muted/50'
              )}
            >
              <span className="text-[9px] font-medium text-muted-foreground">
                {asset.symbol}
              </span>
              <div className="flex items-center gap-0.5">
                {asset.trend === 'bullish' && <TrendingUp className="h-2.5 w-2.5 text-green-500" />}
                {asset.trend === 'bearish' && <TrendingDown className="h-2.5 w-2.5 text-red-500" />}
                {asset.trend === 'neutral' && <Minus className="h-2.5 w-2.5 text-yellow-500" />}
                <span className={cn(
                  'text-[10px] font-medium',
                  asset.change24h > 0 ? 'text-green-500' : asset.change24h < 0 ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {asset.change24h > 0 ? '+' : ''}{asset.change24h.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t">
          <span className="text-green-500">
            ↑ {marketRegime.bullishCount || 0} bullish
          </span>
          <span className="text-yellow-500">
            ↔ {assetTrends.filter(a => a.trend === 'neutral').length} neutral
          </span>
          <span className="text-red-500">
            ↓ {marketRegime.bearishCount || 0} bearish
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
