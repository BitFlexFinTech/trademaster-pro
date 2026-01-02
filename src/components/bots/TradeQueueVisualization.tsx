import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Radar, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { cn } from '@/lib/utils';

interface PairScanResult {
  pair: string;
  momentum: number;
  volatility: number;
  qualityScore: number;
  estimatedMinutesToProfit: number;
  canTrade: boolean;
  skipReason?: string;
}

const TOP_PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 
                   'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT'];

export function TradeQueueVisualization({ className }: { className?: string }) {
  const [scanResults, setScanResults] = useState<PairScanResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const { tickersMap, isConnected } = useBinanceWebSocket();
  
  // Scan pairs every 5 seconds
  useEffect(() => {
    if (!isConnected) return;
    
    const scanPairs = () => {
      setIsScanning(true);
      
      const results: PairScanResult[] = TOP_PAIRS.map(pair => {
        const symbol = pair.replace('/', '').toUpperCase();
        const ticker = tickersMap.get(symbol);
        
        if (!ticker) {
          return {
            pair,
            momentum: 0,
            volatility: 0,
            qualityScore: 0,
            estimatedMinutesToProfit: 999,
            canTrade: false,
            skipReason: 'No data',
          };
        }
        
        // Calculate momentum from price change
        const momentum = ticker.priceChangePercent / 100;
        const volatility = Math.abs(momentum) * 10;
        
        // Quality score: momentum strength + volatility
        const qualityScore = Math.min(100, (Math.abs(momentum) * 200) + (volatility * 50));
        
        // Estimate time to $1 profit with $150 position
        const requiredMove = 0.0067; // ~0.67% for $1 on $150
        const avgMovePerMinute = volatility / 60;
        const estimatedMinutes = avgMovePerMinute > 0 ? requiredMove / avgMovePerMinute : 999;
        
        // Trade filter
        const canTrade = Math.abs(momentum) > 0.001 && volatility > 0.001;
        const skipReason = !canTrade 
          ? (Math.abs(momentum) < 0.001 ? 'Low momentum' : 'Low volatility')
          : undefined;
        
        return {
          pair,
          momentum,
          volatility,
          qualityScore,
          estimatedMinutesToProfit: estimatedMinutes,
          canTrade,
          skipReason,
        };
      });
      
      // Sort by quality score (fastest profit potential first)
      results.sort((a, b) => b.qualityScore - a.qualityScore);
      setScanResults(results);
      setIsScanning(false);
    };
    
    scanPairs();
    const interval = setInterval(scanPairs, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, tickersMap]);
  
  return (
    <Card className={cn("card-terminal", className)}>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs flex items-center gap-2">
          <Radar className={cn("h-3.5 w-3.5 text-primary", isScanning && "animate-spin")} />
          Trade Queue Scanner
          <Badge variant="outline" className="text-[9px] h-4">
            {scanResults.filter(r => r.canTrade).length}/{scanResults.length} ready
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {scanResults.slice(0, 6).map((result, idx) => (
            <div 
              key={result.pair}
              className={cn(
                "flex items-center gap-2 p-2 rounded border text-xs",
                result.canTrade 
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-muted/30 bg-muted/5 opacity-60"
              )}
            >
              {/* Rank */}
              <span className="w-4 text-muted-foreground font-mono">#{idx + 1}</span>
              
              {/* Pair */}
              <span className="font-semibold min-w-[70px]">{result.pair}</span>
              
              {/* Direction Arrow */}
              {result.momentum > 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-400" />
              )}
              
              {/* Momentum */}
              <span className={cn(
                "font-mono min-w-[50px]",
                result.momentum > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {result.momentum > 0 ? '+' : ''}{(result.momentum * 100).toFixed(2)}%
              </span>
              
              {/* Quality Score */}
              <div className="flex-1 max-w-[60px]">
                <Progress value={result.qualityScore} className="h-1.5" />
              </div>
              
              {/* ETA */}
              <div className="flex items-center gap-1 min-w-[45px]">
                <Clock className="h-2.5 w-2.5" />
                <span className="font-mono text-[10px]">
                  {result.estimatedMinutesToProfit < 60 
                    ? `${Math.ceil(result.estimatedMinutesToProfit)}m`
                    : result.estimatedMinutesToProfit < 999 ? `${Math.ceil(result.estimatedMinutesToProfit/60)}h` : '—'
                  }
                </span>
              </div>
              
              {/* Status */}
              {result.canTrade ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
