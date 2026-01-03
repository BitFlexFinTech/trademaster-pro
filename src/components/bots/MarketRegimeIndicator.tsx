import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    // Real-time updates every 10 seconds
    const interval = setInterval(fetchTrends, 10000);
    return () => clearInterval(interval);
  }, []);

  // Calculate overall market regime
  const marketRegime = useMemo(() => {
    if (assetTrends.length === 0) return { regime: 'neutral' as const, confidence: 0, bullishCount: 0, bearishCount: 0, neutralCount: 0 };
    
    const bullishCount = assetTrends.filter(a => a.trend === 'bullish').length;
    const bearishCount = assetTrends.filter(a => a.trend === 'bearish').length;
    const neutralCount = assetTrends.filter(a => a.trend === 'neutral').length;
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
    
    return { regime, confidence, bullishCount, bearishCount, neutralCount };
  }, [assetTrends]);

  const regimeConfig = {
    bullish: {
      icon: TrendingUp,
      label: 'BULL',
      color: 'text-green-500',
      bg: 'bg-green-500/10 border-green-500/30',
    },
    bearish: {
      icon: TrendingDown,
      label: 'BEAR',
      color: 'text-red-500',
      bg: 'bg-red-500/10 border-red-500/30',
    },
    neutral: {
      icon: Minus,
      label: 'CHOP',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10 border-yellow-500/30',
    },
  };

  const config = regimeConfig[marketRegime.regime];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'flex items-center gap-2 px-2 py-1 rounded border cursor-help transition-colors hover:bg-muted/50',
          config.bg,
          className
        )}>
          <Icon className={cn('h-3.5 w-3.5', config.color)} />
          <span className={cn('text-xs font-bold', config.color)}>{config.label}</span>
          <Badge variant="outline" className={cn('text-[8px] h-3.5 px-1', config.color)}>
            {marketRegime.confidence}%
          </Badge>
          <div className="flex items-center gap-1 text-[9px]">
            <span className="text-green-500">↑{marketRegime.bullishCount}</span>
            <span className="text-yellow-500">•{marketRegime.neutralCount}</span>
            <span className="text-red-500">↓{marketRegime.bearishCount}</span>
          </div>
          <RefreshCw 
            className={cn('h-2.5 w-2.5 text-muted-foreground', loading && 'animate-spin')}
            onClick={(e) => { e.stopPropagation(); setLoading(true); fetchTrends(); }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px] max-w-[250px]">
        <div className="space-y-1">
          <p className="font-medium">Market Regime: {config.label} ({marketRegime.confidence}% confidence)</p>
          <div className="grid grid-cols-5 gap-1">
            {assetTrends.slice(0, 10).map((asset) => (
              <div key={asset.symbol} className="text-center">
                <span className={cn(
                  'text-[9px]',
                  asset.change24h > 0 ? 'text-green-500' : asset.change24h < 0 ? 'text-red-500' : 'text-muted-foreground'
                )}>
                  {asset.symbol} {asset.change24h > 0 ? '+' : ''}{asset.change24h.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">Updated: {lastUpdate.toLocaleTimeString()}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
