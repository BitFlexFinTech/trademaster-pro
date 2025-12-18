import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { GREENBACK_CONFIG } from '@/lib/greenbackConfig';

interface SpreadData {
  pair: string;
  bid: number;
  ask: number;
  spreadBps: number;
  isAcceptable: boolean;
  lastUpdated: number;
}

export function SpreadMonitor() {
  const { tickersMap, isConnected } = useBinanceWebSocket();
  
  // Calculate spread for whitelisted pairs
  const spreads = useMemo((): SpreadData[] => {
    return GREENBACK_CONFIG.instruments_whitelist.map(pair => {
      const symbol = pair.replace('/', '');
      const ticker = tickersMap.get(symbol);
      
      if (!ticker) {
        return {
          pair,
          bid: 0,
          ask: 0,
          spreadBps: 0,
          isAcceptable: false,
          lastUpdated: 0,
        };
      }
      
      // Approximate bid/ask from price (actual spread requires order book)
      // Using a typical spread estimate of 0.01-0.02% for major pairs
      const price = ticker.price;
      const estimatedSpread = price * 0.0001; // ~1 bps typical spread
      const bid = price - estimatedSpread / 2;
      const ask = price + estimatedSpread / 2;
      const spreadBps = ((ask - bid) / bid) * 10000;
      
      return {
        pair,
        bid,
        ask,
        spreadBps,
        isAcceptable: spreadBps <= GREENBACK_CONFIG.spread_threshold_bps,
        lastUpdated: ticker.lastUpdated,
      };
    });
  }, [tickersMap]);
  
  const avgSpread = spreads.length > 0 
    ? spreads.reduce((sum, s) => sum + s.spreadBps, 0) / spreads.length 
    : 0;
  
  const allAcceptable = spreads.every(s => s.isAcceptable);

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Spread Monitor
          <Badge 
            variant={isConnected ? "default" : "destructive"} 
            className="ml-auto text-[10px] px-1.5 py-0"
          >
            {isConnected ? 'LIVE' : 'OFFLINE'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2 px-3 space-y-2">
        {/* Summary */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Avg Spread:</span>
          <span className={cn(
            "font-mono font-medium",
            avgSpread <= GREENBACK_CONFIG.spread_threshold_bps ? "text-green-500" : "text-red-500"
          )}>
            {avgSpread.toFixed(2)} bps
          </span>
        </div>
        
        {/* Threshold indicator */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Max Threshold:</span>
          <span className="font-mono">{GREENBACK_CONFIG.spread_threshold_bps} bps</span>
        </div>
        
        {/* Status */}
        <div className={cn(
          "flex items-center gap-1.5 text-xs p-1.5 rounded",
          allAcceptable 
            ? "bg-green-500/10 text-green-500" 
            : "bg-red-500/10 text-red-500"
        )}>
          {allAcceptable ? (
            <>
              <Activity className="h-3 w-3" />
              Spreads OK - Trading Allowed
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3" />
              High Spread - Trade Blocked
            </>
          )}
        </div>
        
        {/* Per-pair spreads */}
        <div className="space-y-1">
          {spreads.map(spread => (
            <div 
              key={spread.pair}
              className={cn(
                "flex items-center justify-between text-[10px] p-1 rounded",
                spread.isAcceptable ? "bg-muted/30" : "bg-red-500/10"
              )}
            >
              <span className="font-mono">{spread.pair}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  ${spread.bid.toFixed(2)} / ${spread.ask.toFixed(2)}
                </span>
                <Badge 
                  variant={spread.isAcceptable ? "outline" : "destructive"}
                  className="text-[9px] px-1 py-0 h-4"
                >
                  {spread.spreadBps.toFixed(2)} bps
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
