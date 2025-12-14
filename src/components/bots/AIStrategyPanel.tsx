import { useState } from 'react';
import { Brain, Lightbulb, Check, X, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HitRateGauge } from './HitRateGauge';
import { cn } from '@/lib/utils';

interface AIRecommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  currentValue: number | string;
  suggestedValue: number | string;
  impact: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

interface StrategyMetrics {
  currentHitRate: number;
  targetHitRate: number;
  requiredHitRate: number;
  signalThreshold: number;
  currentPnL: number;
  dailyTarget: number;
  tradesExecuted: number;
  projectedDailyPnL: number;
  isOnTrack: boolean;
}

interface AIStrategyPanelProps {
  metrics: StrategyMetrics | null;
  recommendations: AIRecommendation[];
  onApplyRecommendation: (rec: AIRecommendation) => void;
  onDismissRecommendation: (id: string) => void;
  isRunning: boolean;
  className?: string;
}

export function AIStrategyPanel({
  metrics,
  recommendations,
  onApplyRecommendation,
  onDismissRecommendation,
  isRunning,
  className,
}: AIStrategyPanelProps) {
  const [expandedRec, setExpandedRec] = useState<string | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-destructive text-destructive bg-destructive/10';
      case 'medium': return 'border-warning text-warning bg-warning/10';
      default: return 'border-muted-foreground text-muted-foreground bg-muted/10';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return AlertTriangle;
      case 'medium': return TrendingUp;
      default: return Lightbulb;
    }
  };

  return (
    <div className={cn('card-terminal p-4 flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain className="w-5 h-5 text-primary" />
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <h3 className="font-semibold text-foreground">AI Strategy Monitor</h3>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[9px]">
          {isRunning ? 'ACTIVE' : 'IDLE'}
        </Badge>
      </div>

      {/* Hit Rate Gauge */}
      {metrics && (
        <HitRateGauge
          currentHitRate={metrics.currentHitRate}
          targetHitRate={metrics.targetHitRate}
          requiredHitRate={metrics.requiredHitRate}
          tradesCount={metrics.tradesExecuted}
          className="mb-4"
        />
      )}

      {/* Strategy Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-secondary/50 p-2 rounded text-center">
            <p className="text-[9px] text-muted-foreground">Signal Threshold</p>
            <p className="text-sm font-bold font-mono text-primary">
              {(metrics.signalThreshold * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-secondary/50 p-2 rounded text-center">
            <p className="text-[9px] text-muted-foreground">Projected Daily</p>
            <p className={cn(
              'text-sm font-bold font-mono',
              metrics.projectedDailyPnL >= metrics.dailyTarget ? 'text-primary' : 'text-warning'
            )}>
              ${metrics.projectedDailyPnL.toFixed(2)}
            </p>
          </div>
          <div className="bg-secondary/50 p-2 rounded text-center">
            <p className="text-[9px] text-muted-foreground">Progress</p>
            <p className="text-sm font-bold font-mono text-foreground">
              ${metrics.currentPnL.toFixed(2)} / ${metrics.dailyTarget}
            </p>
          </div>
          <div className="bg-secondary/50 p-2 rounded text-center">
            <p className="text-[9px] text-muted-foreground">Status</p>
            <Badge
              variant="outline"
              className={cn(
                'text-[9px]',
                metrics.isOnTrack ? 'border-primary text-primary' : 'border-warning text-warning'
              )}
            >
              {metrics.isOnTrack ? 'ON TRACK' : 'ADJUSTING'}
            </Badge>
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            AI Recommendations
          </span>
          {recommendations.length > 0 && (
            <Badge variant="outline" className="text-[9px]">
              {recommendations.length}
            </Badge>
          )}
        </div>

        {recommendations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <Zap className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              {isRunning ? 'AI is monitoring your strategy...' : 'Start the bot to get AI recommendations'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-2">
              {recommendations.map((rec) => {
                const PriorityIcon = getPriorityIcon(rec.priority);
                const isExpanded = expandedRec === rec.id;

                return (
                  <div
                    key={rec.id}
                    className={cn(
                      'border rounded-lg p-3 transition-all cursor-pointer hover:bg-muted/30',
                      getPriorityColor(rec.priority)
                    )}
                    onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  >
                    <div className="flex items-start gap-2">
                      <PriorityIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{rec.title}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                          {rec.description}
                        </p>

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center gap-4 text-[10px]">
                              <span>
                                Current: <strong className="text-foreground">{rec.currentValue}</strong>
                              </span>
                              <span>→</span>
                              <span>
                                Suggested: <strong className="text-primary">{rec.suggestedValue}</strong>
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">{rec.impact}</p>
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-6 text-[10px] gap-1 flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onApplyRecommendation(rec);
                                }}
                              >
                                <Check className="w-3 h-3" />
                                Apply
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDismissRecommendation(rec.id);
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[8px] capitalize flex-shrink-0">
                        {rec.priority}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
