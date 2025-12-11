import type { OHLCData } from '@/lib/indicators';

interface ChartRightSidebarProps {
  symbol: string;
  data: OHLCData[];
  currentPrice: number | null;
}

export function ChartRightSidebar({ symbol, data, currentPrice }: ChartRightSidebarProps) {
  // Calculate performance metrics
  const calculateChange = (periods: number) => {
    if (data.length < periods + 1) return null;
    const oldPrice = data[data.length - periods - 1]?.close;
    const newPrice = data[data.length - 1]?.close;
    if (!oldPrice || !newPrice) return null;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  };

  // Calculate volume stats
  const recentVolume = data.slice(-24).reduce((sum, d) => sum + (d.volume || 0), 0);
  const avgVolume = data.length > 0 
    ? data.reduce((sum, d) => sum + (d.volume || 0), 0) / data.length 
    : 0;

  // Calculate simple technical rating
  const calculateTechnicalRating = () => {
    if (data.length < 50) return 'Neutral';
    const closes = data.map(d => d.close);
    const current = closes[closes.length - 1];
    
    // Simple MA check
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    
    let score = 0;
    if (current > sma20) score++;
    if (current > sma50) score++;
    if (sma20 > sma50) score++;
    
    if (score >= 3) return 'Strong Buy';
    if (score === 2) return 'Buy';
    if (score === 1) return 'Neutral';
    return 'Sell';
  };

  const performanceData = [
    { label: '1D', value: calculateChange(1) },
    { label: '1W', value: calculateChange(7) },
    { label: '1M', value: calculateChange(30) },
    { label: '3M', value: calculateChange(90) },
  ];

  const technicalRating = calculateTechnicalRating();
  const ratingColors: Record<string, string> = {
    'Strong Buy': 'text-primary',
    'Buy': 'text-primary/80',
    'Neutral': 'text-muted-foreground',
    'Sell': 'text-destructive/80',
    'Strong Sell': 'text-destructive',
  };

  return (
    <div className="w-56 bg-card border-l border-border p-3 space-y-4 overflow-y-auto text-sm">
      {/* Key Stats */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="font-medium text-foreground">{symbol.replace('/', '')}</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">Volume (24h)</span>
            <span className="font-mono text-xs">{(recentVolume / 1000).toFixed(2)}K</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-xs">Avg Vol</span>
            <span className="font-mono text-xs">{(avgVolume / 1000).toFixed(2)}K</span>
          </div>
          {data.length > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">High</span>
                <span className="font-mono text-xs text-primary">
                  ${Math.max(...data.slice(-24).map(d => d.high)).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">Low</span>
                <span className="font-mono text-xs text-destructive">
                  ${Math.min(...data.slice(-24).map(d => d.low)).toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Performance */}
      <div>
        <h4 className="text-xs text-muted-foreground mb-2 font-medium">Performance</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {performanceData.map((item) => (
            <div
              key={item.label}
              className={`p-1.5 rounded text-center text-xs ${
                item.value === null
                  ? 'bg-muted/50 text-muted-foreground'
                  : item.value >= 0
                    ? 'bg-primary/15 text-primary'
                    : 'bg-destructive/15 text-destructive'
              }`}
            >
              <div className="font-mono font-medium">
                {item.value !== null ? `${item.value >= 0 ? '+' : ''}${item.value.toFixed(2)}%` : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Technicals */}
      <div>
        <h4 className="text-xs text-muted-foreground mb-2 font-medium">Technicals</h4>
        <div className="text-center p-3 bg-secondary/50 rounded">
          <p className={`text-sm font-medium ${ratingColors[technicalRating]}`}>
            {technicalRating}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2 text-[10px]">
            <span className="text-destructive">Sell</span>
            <div className="w-16 h-1.5 bg-gradient-to-r from-destructive via-muted to-primary rounded" />
            <span className="text-primary">Buy</span>
          </div>
        </div>
      </div>

      {/* OHLC */}
      {data.length > 0 && (
        <div>
          <h4 className="text-xs text-muted-foreground mb-2 font-medium">Latest Candle</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">O</span>
              <span className="font-mono">${data[data.length - 1].open.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">H</span>
              <span className="font-mono text-primary">${data[data.length - 1].high.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">L</span>
              <span className="font-mono text-destructive">${data[data.length - 1].low.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">C</span>
              <span className="font-mono">${data[data.length - 1].close.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
