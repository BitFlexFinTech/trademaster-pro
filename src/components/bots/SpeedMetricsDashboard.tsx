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

  // Fixed card dimensions: 280px x 200px per spec
  const cardStyle = { width: '280px', height: '200px', minWidth: '260px' };

  return (
    <Card 
      className={cn("rounded-xl shadow-sm border border-border/50", className)}
      style={cardStyle}
    >
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-xs flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-primary" />
          Execution Speed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3">
        {/* Avg Execution Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Avg Exec</span>
          </div>
          <div className="flex items-center gap-1.5">
            {history.executionMs.length > 1 && (
              <Sparkline 
                data={history.executionMs} 
                className="w-10 h-3" 
                color={avgExecutionMs < 500 ? 'green' : avgExecutionMs < 1000 ? 'yellow' : 'red'}
              />
            )}
            <span className={cn("text-xs font-mono font-medium", getExecutionColor(avgExecutionMs))}>
              {avgExecutionMs.toFixed(0)}ms
            </span>
          </div>
        </div>

        {/* Cache Hit Rate */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Cache</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Progress value={cacheHitRate} className="w-10 h-1" />
            <span className={cn(
              "text-xs font-mono font-medium",
              cacheHitRate >= 80 ? 'text-green-500' : cacheHitRate >= 50 ? 'text-yellow-500' : 'text-red-500'
            )}>
              {cacheHitRate.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* API Latency */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Latency</span>
          </div>
          <div className="flex items-center gap-1.5">
            {history.apiLatency.length > 1 && (
              <Sparkline 
                data={history.apiLatency} 
                className="w-10 h-3" 
                color={apiLatency < 200 ? 'green' : apiLatency < 500 ? 'yellow' : 'red'}
              />
            )}
            <span className={cn("text-xs font-mono font-medium", getLatencyColor(apiLatency))}>
              {apiLatency.toFixed(0)}ms
            </span>
          </div>
        </div>

        {/* Trades Per Minute */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Trades/min</span>
          </div>
          <div className="flex items-center gap-1.5">
            {history.tradesPerMin.length > 1 && (
              <Sparkline 
                data={history.tradesPerMin} 
                className="w-10 h-3" 
                color="blue"
              />
            )}
            <span className="text-xs font-mono font-medium text-primary">
              {tradesPerMin.toFixed(1)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
