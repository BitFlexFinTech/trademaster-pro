import { useSpeedMetrics } from '@/hooks/useSpeedMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Gauge, Timer, Database, Zap, Activity } from 'lucide-react';
import { Sparkline } from '@/components/ui/sparkline';

interface SpeedMetricsDashboardProps {
  className?: string;
}

export function SpeedMetricsDashboard({ className }: SpeedMetricsDashboardProps) {
  const { avgExecutionMs, cacheHitRate, apiLatency, tradesPerMin, history, loading } = useSpeedMetrics();

  const getExecutionColor = (ms: number) => {
    if (ms < 500) return 'text-green-500';
    if (ms < 1000) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 200) return 'text-green-500';
    if (ms < 500) return 'text-yellow-500';
    return 'text-red-500';
  };

  if (loading) {
    return (
      <Card className={cn("rounded-xl shadow-sm animate-pulse", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Speed Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
          <div className="h-4 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-xl shadow-sm border border-border/50", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          Execution Speed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Avg Execution Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Execution</span>
          </div>
          <div className="flex items-center gap-2">
            {history.executionMs.length > 1 && (
              <Sparkline 
                data={history.executionMs} 
                className="w-14 h-4" 
                color={avgExecutionMs < 500 ? 'green' : avgExecutionMs < 1000 ? 'yellow' : 'red'}
              />
            )}
            <span className={cn("text-sm font-mono font-medium", getExecutionColor(avgExecutionMs))}>
              {avgExecutionMs.toFixed(0)}ms
            </span>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Cache Hits</span>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={cacheHitRate} className="w-14 h-1.5" />
            <span className={cn(
              "text-sm font-mono font-medium",
              cacheHitRate >= 80 ? 'text-green-500' : cacheHitRate >= 50 ? 'text-yellow-500' : 'text-red-500'
            )}>
              {cacheHitRate.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* API Latency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">API Latency</span>
          </div>
          <div className="flex items-center gap-2">
            {history.apiLatency.length > 1 && (
              <Sparkline 
                data={history.apiLatency} 
                className="w-14 h-4" 
                color={apiLatency < 200 ? 'green' : apiLatency < 500 ? 'yellow' : 'red'}
              />
            )}
            <span className={cn("text-sm font-mono font-medium", getLatencyColor(apiLatency))}>
              {apiLatency.toFixed(0)}ms
            </span>
          </div>
        </div>

        {/* Trades Per Minute */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Trades/min</span>
          </div>
          <div className="flex items-center gap-2">
            {history.tradesPerMin.length > 1 && (
              <Sparkline 
                data={history.tradesPerMin} 
                className="w-14 h-4" 
                color="blue"
              />
            )}
            <span className="text-sm font-mono font-medium text-primary">
              {tradesPerMin.toFixed(1)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
