import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useExecutionOptimization, type OptimizationRecommendation } from '@/hooks/useExecutionOptimization';
import { AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Minus, Zap, Lightbulb, Clock, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

// Target durations for each phase (ms)
const PHASE_TARGETS: Record<string, number> = {
  pairSelection: 100,
  aiAnalysis: 200,
  orderPreparation: 50,
  orderPlacement: 500,
  confirmation: 100,
};

const PHASE_LABELS: Record<string, string> = {
  pairSelection: 'Pair Selection',
  aiAnalysis: 'AI Analysis',
  orderPreparation: 'Order Prep',
  orderPlacement: 'Order Place',
  confirmation: 'Confirmation',
};

function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'degrading' }) {
  if (trend === 'improving') return <TrendingDown className="w-3 h-3 text-green-500" />;
  if (trend === 'degrading') return <TrendingUp className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function SeverityBadge({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
  const variants = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-amber-500/20 text-amber-400',
    critical: 'bg-red-500/20 text-red-400',
  };
  return (
    <Badge className={`${variants[severity]} text-[10px]`}>
      {severity.toUpperCase()}
    </Badge>
  );
}

function RecommendationCard({ rec }: { rec: OptimizationRecommendation }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-2">
      <div className="flex items-start gap-2">
        <Lightbulb className={`w-4 h-4 mt-0.5 ${
          rec.severity === 'critical' ? 'text-red-400' :
          rec.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium">{rec.title}</span>
            <SeverityBadge severity={rec.severity} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{rec.description}</p>
        </div>
      </div>
      <div className="pl-6 space-y-1">
        <p className="text-[10px] text-primary/80">
          <span className="font-medium">Action:</span> {rec.suggestedAction}
        </p>
        <p className="text-[10px] text-green-400/80">
          <span className="font-medium">Expected:</span> {rec.expectedImprovement}
        </p>
      </div>
    </div>
  );
}

export function ExecutionOptimizationPanel({ className }: { className?: string }) {
  const {
    phaseMetrics,
    slowestPhase,
    fastestExchange,
    recommendations,
    telemetryRate,
    totalAnalyzed,
    exchangeComparison,
    isLoading,
  } = useExecutionOptimization();

  if (isLoading) {
    return (
      <Card className={`card-terminal ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Execution Optimization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = Object.keys(phaseMetrics).length > 0;

  return (
    <Card className={`card-terminal ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Execution Optimization
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {totalAnalyzed} trades analyzed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No telemetry data yet</p>
            <p className="text-[10px] mt-1">Execute trades to collect timing data</p>
          </div>
        ) : (
          <>
            {/* Phase Performance Bars */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Phase Performance
              </h4>
              <div className="space-y-2">
                {Object.entries(PHASE_LABELS).map(([key, label]) => {
                  const metric = phaseMetrics[key];
                  if (!metric) return null;

                  const target = PHASE_TARGETS[key] || 100;
                  const ratio = Math.min(metric.avgMs / target, 3);
                  const progressValue = Math.min((ratio / 3) * 100, 100);
                  const isSlow = metric.avgMs > target * 1.5;
                  const isCritical = metric.avgMs > target * 3;

                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className={isSlow ? 'text-amber-400' : 'text-foreground'}>{label}</span>
                          <TrendIcon trend={metric.trend} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${isCritical ? 'text-red-400' : isSlow ? 'text-amber-400' : 'text-green-400'}`}>
                            {metric.avgMs.toFixed(0)}ms
                          </span>
                          <span className="text-muted-foreground">/ {target}ms</span>
                        </div>
                      </div>
                      <Progress 
                        value={progressValue} 
                        className={`h-1.5 ${isCritical ? '[&>div]:bg-red-500' : isSlow ? '[&>div]:bg-amber-500' : '[&>div]:bg-green-500'}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-2">
              {slowestPhase && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400">Slowest Phase</p>
                  <p className="text-xs font-medium">{PHASE_LABELS[slowestPhase] || slowestPhase}</p>
                </div>
              )}
              {fastestExchange && (
                <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
                  <p className="text-[10px] text-green-400">Fastest Exchange</p>
                  <p className="text-xs font-medium capitalize">{fastestExchange}</p>
                </div>
              )}
            </div>

            {/* Exchange Comparison */}
            {Object.keys(exchangeComparison).length > 1 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium">Exchange Speed</h4>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(exchangeComparison)
                    .sort(([, a], [, b]) => a.avgMs - b.avgMs)
                    .map(([exchange, data]) => (
                      <Badge key={exchange} variant="outline" className="text-[10px] capitalize">
                        {exchange}: {data.avgMs.toFixed(0)}ms ({data.count})
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium flex items-center gap-2">
                  <Lightbulb className="w-3 h-3 text-primary" />
                  Recommendations ({recommendations.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recommendations.slice(0, 3).map((rec) => (
                    <RecommendationCard key={rec.id} rec={rec} />
                  ))}
                </div>
              </div>
            )}

            {recommendations.length === 0 && (
              <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <div>
                  <p className="text-xs font-medium text-green-400">All phases optimized</p>
                  <p className="text-[10px] text-muted-foreground">Execution speed is within target ranges</p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
