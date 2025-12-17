import { useState, useEffect } from 'react';
import { Brain, Lightbulb, Check, X, Zap, TrendingUp, AlertTriangle, Loader2, Undo2, Clock } from 'lucide-react';
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

interface AppliedRecommendation {
  id: string;
  type: string;
  title: string;
  previousValue: number | string;
  newValue: number | string;
  appliedAt: Date;
  expiresAt: Date;
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
  onApplyRecommendation: (rec: AIRecommendation) => Promise<void>;
  onDismissRecommendation: (id: string) => void;
  onUndoRecommendation?: (rec: AppliedRecommendation) => void;
  recentlyApplied?: AppliedRecommendation[];
  isRunning: boolean;
  className?: string;
}

export function AIStrategyPanel({
  metrics,
  recommendations,
  onApplyRecommendation,
  onDismissRecommendation,
  onUndoRecommendation,
  recentlyApplied = [],
  isRunning,
  className,
}: AIStrategyPanelProps) {
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});

  // Update countdowns every second
  useEffect(() => {
    if (recentlyApplied.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const newCountdowns: Record<string, number> = {};
      recentlyApplied.forEach(rec => {
        const remaining = Math.max(0, rec.expiresAt.getTime() - now);
        if (remaining > 0) {
          newCountdowns[rec.id] = Math.ceil(remaining / 1000);
        }
      });
      setCountdowns(newCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, [recentlyApplied]);

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

  const handleApply = async (rec: AIRecommendation, e: React.MouseEvent) => {
    e.stopPropagation();
    setApplyingId(rec.id);
    
    try {
      await onApplyRecommendation(rec);
      setAppliedId(rec.id);
      
      // Reset applied animation after showing checkmark
      setTimeout(() => {
        setAppliedId(null);
        setExpandedRec(null);
      }, 500);
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className={cn('card-terminal p-3 flex flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain className="w-4 h-4 text-primary" />
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <h3 className="font-semibold text-foreground text-sm">AI Strategy Monitor</h3>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[8px] h-4">
          {isRunning ? 'ACTIVE' : 'IDLE'}
        </Badge>
      </div>

      {/* Hit Rate Gauge - Compact */}
      <HitRateGauge
        currentHitRate={metrics?.currentHitRate || 0}
        targetHitRate={metrics?.targetHitRate || 95}
        requiredHitRate={metrics?.requiredHitRate || 95}
        tradesCount={metrics?.tradesExecuted || 0}
        className="mb-3 flex-shrink-0"
      />

      {/* Strategy Metrics Grid - Compact */}
      <div className="grid grid-cols-2 gap-1.5 mb-3 flex-shrink-0">
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <p className="text-[8px] text-muted-foreground">Signal Threshold</p>
          <p className="text-xs font-bold font-mono text-primary">
            {metrics ? `${(metrics.signalThreshold * 100).toFixed(0)}%` : '90%'}
          </p>
        </div>
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <p className="text-[8px] text-muted-foreground">Projected Daily</p>
          <p className={cn(
            'text-xs font-bold font-mono',
            metrics && metrics.projectedDailyPnL >= metrics.dailyTarget ? 'text-primary' : 'text-warning'
          )}>
            ${metrics?.projectedDailyPnL?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <p className="text-[8px] text-muted-foreground">Progress</p>
          <p className="text-xs font-bold font-mono text-foreground">
            ${metrics?.currentPnL?.toFixed(2) || '0.00'} / ${metrics?.dailyTarget || 40}
          </p>
        </div>
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <p className="text-[8px] text-muted-foreground">Status</p>
          <Badge
            variant="outline"
            className={cn(
              'text-[8px] h-4',
              !metrics ? 'border-muted-foreground text-muted-foreground' :
              metrics.isOnTrack ? 'border-primary text-primary' : 'border-warning text-warning'
            )}
          >
            {!metrics ? 'IDLE' : metrics.isOnTrack ? 'ON TRACK' : 'ADJUSTING'}
          </Badge>
        </div>
      </div>

      {/* Recently Applied - Undo Section */}
      {recentlyApplied.length > 0 && onUndoRecommendation && (
        <div className="mb-2 flex-shrink-0">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-2.5 h-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">Recently Applied</span>
          </div>
          <div className="space-y-1">
            {recentlyApplied.slice(0, 2).map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded px-2 py-1"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-foreground">{rec.title}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {String(rec.previousValue)} → {String(rec.newValue)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {countdowns[rec.id] || 0}s
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0"
                    onClick={() => onUndoRecommendation(rec)}
                  >
                    <Undo2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
          <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            <Lightbulb className="w-2.5 h-2.5" />
            AI Recommendations
          </span>
          {recommendations.length > 0 && (
            <Badge variant="outline" className="text-[8px] h-4">
              {recommendations.length}
            </Badge>
          )}
        </div>

        {recommendations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-2">
            <Zap className="w-6 h-6 text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground">
              {isRunning ? 'AI monitoring...' : 'Start bot for recommendations'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-1.5 pr-2">
              {recommendations.map((rec, index) => {
                const PriorityIcon = getPriorityIcon(rec.priority);
                const isExpanded = expandedRec === rec.id;
                const isApplying = applyingId === rec.id;
                const isApplied = appliedId === rec.id;
                // Use stable unique key combining type, index, and a slice of creation time
                const stableKey = `${rec.type}-${index}-${rec.id.slice(-8)}`;

                return (
                  <div
                    key={stableKey}
                    className={cn(
                      'border rounded-lg p-2 transition-all cursor-pointer hover:bg-muted/30',
                      getPriorityColor(rec.priority),
                      isApplied && 'animate-slide-out-right'
                    )}
                    onClick={() => setExpandedRec(isExpanded ? null : rec.id)}
                  >
                    <div className="flex items-start gap-1.5">
                      <PriorityIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-foreground">{rec.title}</p>
                        <p className="text-[9px] text-muted-foreground line-clamp-2">
                          {rec.description}
                        </p>

                        {isExpanded && (
                          <div className="mt-1.5 space-y-1.5">
                            <div className="flex items-center gap-3 text-[9px]">
                              <span>
                                Current: <strong className="text-foreground">{rec.currentValue}</strong>
                              </span>
                              <span>→</span>
                              <span>
                                Suggested: <strong className="text-primary">{rec.suggestedValue}</strong>
                              </span>
                            </div>
                            <p className="text-[9px] text-muted-foreground italic">{rec.impact}</p>
                            <div className="flex gap-1.5 pt-0.5">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-5 text-[9px] gap-1 flex-1"
                                disabled={isApplying}
                                onClick={(e) => handleApply(rec, e)}
                              >
                                {isApplying ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : isApplied ? (
                                  <Check className="w-2.5 h-2.5 animate-checkmark-scale" />
                                ) : (
                                  <Check className="w-2.5 h-2.5" />
                                )}
                                Apply
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-5 text-[9px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDismissRecommendation(rec.id);
                                }}
                              >
                                <X className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[7px] capitalize flex-shrink-0 h-4">
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
