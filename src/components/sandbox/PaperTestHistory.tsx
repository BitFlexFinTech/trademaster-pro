import { TrendingUp, TrendingDown, Minus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePaperTestHistory } from '@/hooks/usePaperTestHistory';
import { format } from 'date-fns';

interface PaperTestHistoryProps {
  className?: string;
}

export function PaperTestHistory({ className }: PaperTestHistoryProps) {
  const { history, loading, getImprovementTrend, getBestRun } = usePaperTestHistory();

  const trend = getImprovementTrend();
  const bestRun = getBestRun();

  const TrendIcon = trend === 'improving' ? TrendingUp : 
                    trend === 'declining' ? TrendingDown : Minus;
  
  const trendColor = trend === 'improving' ? 'text-primary' : 
                     trend === 'declining' ? 'text-destructive' : 'text-muted-foreground';

  if (loading) {
    return (
      <div className={cn("card-terminal p-4", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">Loading history...</span>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={cn("card-terminal p-4", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Paper Test History</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No test runs yet. Run a paper test to see history.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("card-terminal p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Paper Test History</h3>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon className={cn("w-4 h-4", trendColor)} />
          <span className={cn("text-xs font-medium capitalize", trendColor)}>
            {trend}
          </span>
        </div>
      </div>

      {/* Best run highlight */}
      {bestRun && (
        <div className="mb-3 p-2 rounded bg-primary/10 border border-primary/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Best Run</span>
            <span className="text-sm font-bold text-primary font-mono">
              {bestRun.hit_rate.toFixed(1)}% hit rate
            </span>
          </div>
        </div>
      )}

      <ScrollArea className="h-[200px]">
        <div className="space-y-2">
          {history.map((run) => (
            <div 
              key={run.id} 
              className="flex items-center justify-between p-2 rounded bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                {run.passed ? (
                  <CheckCircle className="w-4 h-4 text-primary" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {run.total_trades} trades
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(run.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className={cn(
                  "text-sm font-bold font-mono",
                  run.passed ? 'text-primary' : 'text-destructive'
                )}>
                  {run.hit_rate.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {run.wins}W / {run.losses}L
                </p>
              </div>
              
              <Badge 
                variant={run.passed ? "default" : "destructive"} 
                className="text-[10px] px-1.5"
              >
                {run.passed ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
