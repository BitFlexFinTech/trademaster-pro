import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Zap, Database, Clock, TrendingUp, Lightbulb, Server, RefreshCw } from 'lucide-react';
import { useBottleneckAnalysis } from '@/hooks/useBottleneckAnalysis';
import { cn } from '@/lib/utils';

const PHASE_LABELS: Record<string, string> = {
  pairSelection: 'Pair Selection',
  aiAnalysis: 'AI Analysis',
  orderPreparation: 'Order Prep',
  orderPlacement: 'Order Placement',
  confirmation: 'Confirmation',
};

const PHASE_COLORS: Record<string, string> = {
  pairSelection: 'bg-blue-500',
  aiAnalysis: 'bg-purple-500',
  orderPreparation: 'bg-orange-500',
  orderPlacement: 'bg-green-500',
  confirmation: 'bg-cyan-500',
};

export function BottleneckAnalyzer() {
  const {
    phaseBreakdown,
    apiBottlenecks,
    cacheStats,
    avgTotalDuration,
    slowestTrades,
    recommendations,
    loading,
    tradeCount,
  } = useBottleneckAnalysis(7);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (tradeCount === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-yellow-500" />
            Execution Bottleneck Analyzer
          </CardTitle>
          <CardDescription>Analyze trade execution performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No telemetry data available yet</p>
            <p className="text-sm">Trades with execution telemetry will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-yellow-500" />
              Execution Bottleneck Analyzer
            </CardTitle>
            <CardDescription>
              Analyzed {tradeCount} trades • Avg: {avgTotalDuration}ms
            </CardDescription>
          </div>
          <Badge variant={avgTotalDuration < 1000 ? 'default' : avgTotalDuration < 2000 ? 'secondary' : 'destructive'}>
            {avgTotalDuration < 1000 ? 'Fast' : avgTotalDuration < 2000 ? 'Normal' : 'Slow'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Phase Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            Phase Breakdown
          </div>
          <div className="space-y-2">
            {phaseBreakdown.map((phase) => (
              <TooltipProvider key={phase.phase}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {PHASE_LABELS[phase.phase] || phase.phase}
                        </span>
                        <span className="font-mono">
                          {phase.avgDuration}ms
                          <span className="text-muted-foreground text-xs ml-1">
                            ({phase.percentOfTotal.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn('h-full transition-all', PHASE_COLORS[phase.phase] || 'bg-primary')}
                          style={{ width: `${Math.min(phase.percentOfTotal, 100)}%` }}
                        />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Max: {phase.maxDuration}ms • {phase.frequency} samples</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* Cache Stats */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4" />
            Cache Performance
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-green-500">{cacheStats.totalHits}</div>
              <div className="text-xs text-muted-foreground">Cache Hits</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-orange-500">{cacheStats.totalMisses}</div>
              <div className="text-xs text-muted-foreground">Cache Misses</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className={cn(
                'text-2xl font-bold',
                cacheStats.hitRate > 70 ? 'text-green-500' : cacheStats.hitRate > 40 ? 'text-yellow-500' : 'text-red-500'
              )}>
                {cacheStats.hitRate.toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">Hit Rate</div>
            </div>
          </div>
        </div>

        {/* Slowest API Endpoints */}
        {apiBottlenecks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Server className="h-4 w-4" />
              Slowest API Endpoints
            </div>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {apiBottlenecks.slice(0, 5).map((api, idx) => (
                  <div key={api.endpoint} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4">{idx + 1}.</span>
                      <span className="font-mono text-xs truncate max-w-[200px]">{api.endpoint}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono">{api.avgDuration}ms</span>
                      {api.errorRate > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {api.errorRate.toFixed(0)}% err
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Recommendations
            </div>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <TrendingUp className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slowest Trades */}
        {slowestTrades.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Slowest Trades
            </div>
            <div className="space-y-1 text-xs">
              {slowestTrades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{trade.pair}</Badge>
                    <span className="text-muted-foreground">{trade.exchange}</span>
                  </div>
                  <span className="font-mono text-orange-500">{trade.duration}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
