import { useTradeTimingAdvisor } from '@/hooks/useTradeTimingAdvisor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, RefreshCw, ArrowUp, ArrowDown, Clock, AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TradeTimingAdvisorProps {
  className?: string;
}

export function TradeTimingAdvisor({ className }: TradeTimingAdvisorProps) {
  const { signals, loading, lastUpdate, bestSignal, refresh } = useTradeTimingAdvisor();

  const getSignalConfig = (signal: 'optimal' | 'good' | 'wait' | 'avoid') => {
    switch (signal) {
      case 'optimal':
        return {
          icon: CheckCircle2,
          label: 'OPTIMAL',
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
        };
      case 'good':
        return {
          icon: Target,
          label: 'GOOD',
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
        };
      case 'wait':
        return {
          icon: Timer,
          label: 'WAIT',
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
        };
      case 'avoid':
        return {
          icon: AlertTriangle,
          label: 'AVOID',
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
        };
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="py-2 px-3 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">Trade Timing Advisor</CardTitle>
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
      <CardContent className="p-2 space-y-1.5">
        {signals.slice(0, 5).map((signal) => {
          const config = getSignalConfig(signal.signal);
          const Icon = config.icon;
          
          return (
            <div 
              key={signal.symbol}
              className={cn(
                'flex items-center justify-between px-2 py-1.5 rounded-md border',
                config.bg,
                config.border
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-xs">{signal.symbol}</span>
                <div className="flex items-center gap-0.5">
                  {signal.direction === 'long' ? (
                    <ArrowUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDown className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-[9px] text-muted-foreground uppercase">
                    {signal.direction}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Icon className={cn('h-3.5 w-3.5', config.color)} />
                <span className={cn('text-[10px] font-medium', config.color)}>
                  {config.label}
                </span>
                <Badge variant="outline" className={cn('text-[9px] h-4 px-1', config.color)}>
                  {signal.confidence}%
                </Badge>
              </div>
            </div>
          );
        })}
        
        {/* Best Entry Highlight */}
        {bestSignal && (
          <div className="mt-2 px-2 py-1.5 bg-green-500/10 border border-green-500/30 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[10px] font-medium text-green-600">BEST ENTRY</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold">{bestSignal.symbol}</span>
                {bestSignal.direction === 'long' ? (
                  <ArrowUp className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-red-500" />
                )}
                <span className="text-[10px] text-green-600">{bestSignal.confidence}% conf</span>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">{bestSignal.reason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
