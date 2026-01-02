import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Zap, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LatencyMetrics {
  wsLatencyMs: number;
  wsAvgLatencyMs: number;
  restLatencyMs: number;
  restAvgLatencyMs: number;
  lastWsUpdate: number;
  wsUpdatesPerSec: number;
  restCallsCount: number;
}

interface LatencyMetricsDisplayProps {
  metrics: LatencyMetrics;
  compact?: boolean;
  className?: string;
}

export function LatencyMetricsDisplay({ metrics, compact = true, className }: LatencyMetricsDisplayProps) {
  const wsLatency = metrics.wsAvgLatencyMs || metrics.wsLatencyMs || 0;
  const restLatency = metrics.restAvgLatencyMs || metrics.restLatencyMs || 0;
  const improvementFactor = restLatency > 0 && wsLatency > 0 
    ? Math.round(restLatency / wsLatency) 
    : 0;
  
  // Color coding based on latency
  const getLatencyColor = (ms: number, isWs: boolean) => {
    if (isWs) {
      if (ms < 10) return 'text-green-500';
      if (ms < 50) return 'text-yellow-500';
      return 'text-red-500';
    } else {
      if (ms < 100) return 'text-green-500';
      if (ms < 200) return 'text-yellow-500';
      return 'text-red-500';
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn("gap-1 text-xs cursor-help", className)}
            >
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className={getLatencyColor(wsLatency, true)}>
                {wsLatency < 1 ? '<1' : Math.round(wsLatency)}ms
              </span>
              {improvementFactor > 1 && (
                <span className="text-muted-foreground">
                  ({improvementFactor}x)
                </span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="w-64">
            <div className="space-y-2 text-xs">
              <div className="font-medium border-b pb-1">Price Feed Latency</div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  WebSocket:
                </span>
                <span className={getLatencyColor(wsLatency, true)}>
                  {wsLatency < 1 ? '<1' : Math.round(wsLatency)}ms avg
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  REST Fallback:
                </span>
                <span className={getLatencyColor(restLatency, false)}>
                  {restLatency > 0 ? `${Math.round(restLatency)}ms avg` : 'N/A'}
                </span>
              </div>
              
              <div className="flex justify-between border-t pt-1">
                <span>Updates/sec:</span>
                <span className="text-green-500">{metrics.wsUpdatesPerSec.toFixed(1)}</span>
              </div>
              
              {improvementFactor > 1 && (
                <div className="flex justify-between text-green-500 font-medium">
                  <span>Speed Improvement:</span>
                  <span>{improvementFactor}x faster</span>
                </div>
              )}
              
              {metrics.restCallsCount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>REST calls made:</span>
                  <span>{metrics.restCallsCount}</span>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full display mode
  return (
    <div className={cn("p-3 rounded-lg border bg-card space-y-2", className)}>
      <div className="font-medium text-sm flex items-center gap-2">
        <Zap className="h-4 w-4 text-yellow-500" />
        Price Feed Latency
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex flex-col">
          <span className="text-muted-foreground">WebSocket</span>
          <span className={cn("font-mono font-bold", getLatencyColor(wsLatency, true))}>
            {wsLatency < 1 ? '<1' : Math.round(wsLatency)}ms
          </span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-muted-foreground">REST</span>
          <span className={cn("font-mono font-bold", getLatencyColor(restLatency, false))}>
            {restLatency > 0 ? `${Math.round(restLatency)}ms` : 'N/A'}
          </span>
        </div>
      </div>
      
      {improvementFactor > 1 && (
        <div className="text-xs text-green-500 font-medium text-center pt-1 border-t">
          WebSocket is {improvementFactor}x faster
        </div>
      )}
    </div>
  );
}
