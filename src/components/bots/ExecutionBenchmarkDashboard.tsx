import { Timer, Zap, TrendingUp, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { ExecutionMetrics } from '@/hooks/useExecutionBenchmark';
import type { LatencyMetrics } from '@/hooks/useBinanceWebSocket';

interface ExecutionBenchmarkDashboardProps {
  currentMetrics: ExecutionMetrics | null;
  aggregates: {
    avgCycleTime: number;
    minCycleTime: number;
    maxCycleTime: number;
    cyclesRecorded: number;
    avgSignalTime: number;
    avgAnalysisTime: number;
    avgOrderTime: number;
    avgConfirmTime: number;
  };
  latencyMetrics?: LatencyMetrics;
  className?: string;
}

export function ExecutionBenchmarkDashboard({
  currentMetrics,
  aggregates,
  latencyMetrics,
  className,
}: ExecutionBenchmarkDashboardProps) {
  const hasData = currentMetrics !== null || aggregates.cyclesRecorded > 0;

  // Calculate percentage of total for each stage
  const getStagePercent = (stageMs: number, totalMs: number) => {
    if (totalMs === 0) return 0;
    return Math.round((stageMs / totalMs) * 100);
  };

  const total = currentMetrics?.totalCycleMs || aggregates.avgCycleTime;
  
  const stages = currentMetrics ? [
    { name: 'Signal', ms: currentMetrics.signalDetectionMs, color: 'bg-blue-500' },
    { name: 'Analysis', ms: currentMetrics.analysisMs, color: 'bg-purple-500' },
    { name: 'Order', ms: currentMetrics.orderPlacementMs, color: 'bg-orange-500' },
    { name: 'Confirm', ms: currentMetrics.confirmationMs, color: 'bg-green-500' },
  ] : [
    { name: 'Signal', ms: aggregates.avgSignalTime, color: 'bg-blue-500' },
    { name: 'Analysis', ms: aggregates.avgAnalysisTime, color: 'bg-purple-500' },
    { name: 'Order', ms: aggregates.avgOrderTime, color: 'bg-orange-500' },
    { name: 'Confirm', ms: aggregates.avgConfirmTime, color: 'bg-green-500' },
  ];

  // Calculate WebSocket speed improvement
  const wsImprovement = latencyMetrics && latencyMetrics.restAvgLatencyMs > 0 && latencyMetrics.wsAvgLatencyMs > 0
    ? Math.round(latencyMetrics.restAvgLatencyMs / latencyMetrics.wsAvgLatencyMs)
    : null;

  return (
    <div className={cn("p-3 rounded-lg border bg-card/50", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Timer className="h-3.5 w-3.5 text-primary" />
          Trade Execution Speed
        </div>
        {hasData && (
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
            {aggregates.cyclesRecorded} trades
          </Badge>
        )}
      </div>

      {!hasData ? (
        <div className="text-xs text-muted-foreground text-center py-3">
          No execution data yet. Start trading to see benchmarks.
        </div>
      ) : (
        <>
          {/* Last Trade Cycle Time */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Last Cycle</span>
              <span className={cn(
                "font-mono font-bold",
                total < 500 ? "text-green-500" : total < 2000 ? "text-yellow-500" : "text-red-500"
              )}>
                {total.toFixed(0)}ms
              </span>
            </div>
            
            {/* Stacked progress bar for stages */}
            <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
              {stages.map((stage, i) => {
                const percent = getStagePercent(stage.ms, total);
                if (percent === 0) return null;
                return (
                  <div
                    key={stage.name}
                    className={cn(stage.color, "transition-all duration-300")}
                    style={{ width: `${percent}%` }}
                    title={`${stage.name}: ${stage.ms.toFixed(0)}ms (${percent}%)`}
                  />
                );
              })}
            </div>
          </div>

          {/* Stage Breakdown */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {stages.map(stage => (
              <div key={stage.name} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  <div className={cn("w-1.5 h-1.5 rounded-full", stage.color)} />
                  <span className="text-muted-foreground">{stage.name}</span>
                </div>
                <span className="font-mono">{stage.ms.toFixed(0)}ms</span>
              </div>
            ))}
          </div>

          {/* Aggregates */}
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Avg</span>
              <span>Min</span>
              <span>Max</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span>{aggregates.avgCycleTime.toFixed(0)}ms</span>
              <span className="text-green-500">{aggregates.minCycleTime.toFixed(0)}ms</span>
              <span className="text-red-500">{aggregates.maxCycleTime.toFixed(0)}ms</span>
            </div>
          </div>

          {/* WebSocket Speed Comparison */}
          {wsImprovement && wsImprovement > 1 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  WebSocket Advantage
                </div>
                <span className="text-green-500 font-bold">
                  {wsImprovement}x faster
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>WS: {latencyMetrics?.wsAvgLatencyMs?.toFixed(0) || 0}ms avg</span>
                <span>REST: {latencyMetrics?.restAvgLatencyMs?.toFixed(0) || 0}ms avg</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
