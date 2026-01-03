import { useVolatilityScanner } from '@/hooks/useVolatilityScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, TrendingUp, TrendingDown, Minus, RefreshCw, Clock, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface VolatilityScannerProps {
  className?: string;
  maxPairs?: number;
}

export function VolatilityScanner({ className, maxPairs = 8 }: VolatilityScannerProps) {
  const { pairs, loading, lastUpdate, topPair, refresh } = useVolatilityScanner();

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  };

  const getMomentumIcon = (momentum: 'up' | 'down' | 'neutral') => {
    switch (momentum) {
      case 'up': return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'down': return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return <Minus className="h-3 w-3 text-yellow-500" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500 bg-green-500/10';
    if (score >= 50) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-muted-foreground bg-muted/50';
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="py-2 px-3 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Volatility Scanner</CardTitle>
            <Badge variant="outline" className="text-[9px] h-4">
              {pairs.length} pairs
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">
              {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <RefreshCw 
              className={cn('h-3 w-3 text-muted-foreground cursor-pointer hover:text-foreground', loading && 'animate-spin')}
              onClick={refresh}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[180px]">
          <div className="p-2 space-y-1">
            {pairs.slice(0, maxPairs).map((pair, index) => (
              <div 
                key={pair.symbol}
                className={cn(
                  'flex items-center justify-between px-2 py-1.5 rounded-md text-xs',
                  index === 0 && 'bg-primary/10 border border-primary/30'
                )}
              >
                <div className="flex items-center gap-2 min-w-[80px]">
                  <span className="font-mono font-medium">{pair.symbol}</span>
                  {getMomentumIcon(pair.momentum)}
                </div>
                
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className={pair.volatilityPercent > 2 ? 'text-orange-500' : ''}>
                    {pair.volatilityPercent.toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex items-center gap-1 text-[10px]">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className={pair.estimatedTimeToProfit < 120 ? 'text-green-500 font-medium' : 'text-muted-foreground'}>
                    ~{formatTime(pair.estimatedTimeToProfit)}
                  </span>
                </div>
                
                <div className="flex items-center gap-1 text-[10px]">
                  <DollarSign className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="font-mono">${pair.recommendedSize}</span>
                </div>
                
                <Badge variant="outline" className={cn('text-[9px] h-4 px-1', getScoreColor(pair.profitPotentialScore))}>
                  {pair.profitPotentialScore}
                </Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        {/* Top Pick Highlight */}
        {topPair && (
          <div className="px-3 py-2 bg-green-500/10 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-green-600">TOP PICK</span>
              <span className="text-xs font-bold">{topPair.symbol}</span>
            </div>
            <span className="text-[10px] text-green-600">
              ~{formatTime(topPair.estimatedTimeToProfit)} to $1 @ ${topPair.recommendedSize}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
