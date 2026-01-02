import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Radar, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MTFSignal {
  timeframe: string;
  direction: 'long' | 'short' | 'neutral';
  momentum: number;
  strength: number;
}

interface TradeDirectionIndicatorProps {
  isSearching: boolean;
  direction: 'long' | 'short' | null;
  confidence: number;
  pair: string | null;
  mtfSignals?: MTFSignal[];
  reasoning?: string;
  className?: string;
}

export function TradeDirectionIndicator({
  isSearching,
  direction,
  confidence,
  pair,
  mtfSignals,
  reasoning,
  className,
}: TradeDirectionIndicatorProps) {
  if (!isSearching && !direction) {
    return null;
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-3">
        {isSearching ? (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radar className="h-8 w-8 text-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity className="h-3 w-3 text-primary animate-pulse" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Analyzing Market...</p>
              <p className="text-xs text-muted-foreground">
                Checking MTF signals for best entry
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Direction Display */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  direction === 'long' 
                    ? "bg-emerald-500/20" 
                    : "bg-red-500/20"
                )}>
                  {direction === 'long' ? (
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {direction === 'long' ? 'LONG' : 'SHORT'} {pair}
                  </p>
                  <p className="text-xs text-muted-foreground">{reasoning}</p>
                </div>
              </div>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  confidence >= 70 ? "border-emerald-500 text-emerald-500" :
                  confidence >= 50 ? "border-amber-500 text-amber-500" :
                  "border-muted-foreground"
                )}
              >
                {confidence}% conf
              </Badge>
            </div>

            {/* MTF Signals Grid */}
            {mtfSignals && mtfSignals.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {mtfSignals.map((signal) => (
                  <div 
                    key={signal.timeframe}
                    className={cn(
                      "p-2 rounded-lg text-center",
                      signal.direction === 'long' 
                        ? "bg-emerald-500/10 border border-emerald-500/30" 
                        : signal.direction === 'short'
                        ? "bg-red-500/10 border border-red-500/30"
                        : "bg-muted border border-border"
                    )}
                  >
                    <p className="text-[10px] text-muted-foreground uppercase">
                      {signal.timeframe}
                    </p>
                    <div className="flex items-center justify-center gap-1">
                      {signal.direction === 'long' ? (
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                      ) : signal.direction === 'short' ? (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      ) : (
                        <Activity className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        signal.momentum >= 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {signal.momentum >= 0 ? '+' : ''}{(signal.momentum * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
