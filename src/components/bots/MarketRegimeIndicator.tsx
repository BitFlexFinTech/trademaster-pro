import { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  const [isExpanded, setIsExpanded] = useState(false);

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
    if (assetTrends.length === 0) return { regime: 'neutral' as const, confidence: 0, bullishCount: 0, bearishCount: 0 };
    
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
      label: 'BULLISH',
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
    bearish: {
      icon: TrendingDown,
      label: 'BEARISH',
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    neutral: {
      icon: Minus,
      label: 'NEUTRAL',
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
  };

  const config = regimeConfig[marketRegime.regime];
  const Icon = config.icon;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
        {/* Compact Banner - Always Visible */}
        <CollapsibleTrigger className="w-full">
          <div className={cn('flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors', config.bg)}>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Market Regime</span>
              <div className="flex items-center gap-1.5">
                <Icon className={cn('h-4 w-4', config.color)} />
                <span className={cn('font-bold text-sm', config.color)}>{config.label}</span>
                <Badge variant="outline" className={cn('text-[9px] h-4 px-1', config.color)}>
                  {marketRegime.confidence}%
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Summary Stats */}
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-green-500">↑{marketRegime.bullishCount}</span>
                <span className="text-yellow-500">↔{marketRegime.neutralCount}</span>
                <span className="text-red-500">↓{marketRegime.bearishCount}</span>
              </div>
              
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground">
                  {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <RefreshCw 
                  className={cn('h-3 w-3 text-muted-foreground', loading && 'animate-spin')}
                  onClick={(e) => { e.stopPropagation(); setLoading(true); fetchTrends(); }}
                />
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        {/* Expandable Details */}
        <CollapsibleContent>
          <div className="px-3 py-2 border-t">
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
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
