import { useMemo } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, Zap, Brain, Package, Send, ThumbsUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTradeExecutionTimeline, ExecutionStep, TradeExecution } from '@/hooks/useTradeExecutionTimeline';
import { formatDistanceToNow } from 'date-fns';

const STEP_ICONS: Record<string, React.ReactNode> = {
  'Pair Selection': <Zap className="w-3 h-3" />,
  'AI Analysis': <Brain className="w-3 h-3" />,
  'Order Preparation': <Package className="w-3 h-3" />,
  'Order Placement': <Send className="w-3 h-3" />,
  'Confirmation': <ThumbsUp className="w-3 h-3" />,
};

function StepIndicator({ step }: { step: ExecutionStep }) {
  const icon = STEP_ICONS[step.name] || <Clock className="w-3 h-3" />;
  
  const statusColor = {
    completed: 'bg-emerald-500 text-white',
    'in-progress': 'bg-amber-500 text-white animate-pulse',
    pending: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive text-white',
  }[step.status];

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0', statusColor)}>
        {step.status === 'in-progress' ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : step.status === 'completed' ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : step.status === 'failed' ? (
          <XCircle className="w-3 h-3" />
        ) : (
          icon
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium truncate">{step.name}</span>
          {step.duration && (
            <span className="text-[9px] text-muted-foreground font-mono flex-shrink-0">
              {step.duration.toFixed(0)}ms
            </span>
          )}
        </div>
        {step.details && (
          <p className="text-[9px] text-muted-foreground truncate">{step.details}</p>
        )}
      </div>
    </div>
  );
}

function ExecutionCard({ execution }: { execution: TradeExecution }) {
  const statusBadge = {
    completed: { variant: 'default' as const, label: 'Completed', className: 'bg-emerald-500' },
    'in-progress': { variant: 'secondary' as const, label: 'In Progress', className: 'bg-amber-500' },
    failed: { variant: 'destructive' as const, label: 'Failed', className: '' },
  }[execution.status];

  return (
    <div className="p-2 border rounded-lg bg-card/50 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
            {execution.pair}
          </Badge>
          <Badge 
            variant="outline" 
            className={cn(
              'text-[9px] px-1.5 py-0',
              execution.direction === 'long' ? 'text-emerald-400 border-emerald-500/30' : 'text-red-400 border-red-500/30'
            )}
          >
            {execution.direction.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge className={cn('text-[9px] px-1.5 py-0', statusBadge.className)}>
            {statusBadge.label}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            {formatDistanceToNow(execution.timestamp, { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-1">
        {execution.steps.map((step, i) => (
          <div key={step.name} className="flex items-center">
            <div 
              className={cn(
                'w-2 h-2 rounded-full',
                step.status === 'completed' ? 'bg-emerald-500' :
                step.status === 'in-progress' ? 'bg-amber-500 animate-pulse' :
                step.status === 'failed' ? 'bg-destructive' :
                'bg-muted'
              )}
            />
            {i < execution.steps.length - 1 && (
              <div className={cn(
                'w-4 h-0.5 mx-0.5',
                step.status === 'completed' ? 'bg-emerald-500' : 'bg-muted'
              )} />
            )}
          </div>
        ))}
        <span className="ml-2 text-[10px] font-mono text-muted-foreground">
          {execution.totalDuration.toFixed(0)}ms total
        </span>
      </div>

      {/* Step details (collapsed by default, could expand) */}
      <div className="grid grid-cols-5 gap-1">
        {execution.steps.map(step => (
          <div key={step.name} className="text-center">
            <span className="text-[8px] text-muted-foreground block truncate">{step.name.split(' ')[0]}</span>
            <span className={cn(
              'text-[9px] font-mono',
              step.status === 'completed' ? 'text-emerald-400' : 'text-muted-foreground'
            )}>
              {step.duration ? `${step.duration.toFixed(0)}ms` : '--'}
            </span>
          </div>
        ))}
      </div>

      {/* Profit if available */}
      {execution.profit !== undefined && (
        <div className="flex items-center justify-between text-[10px] pt-1 border-t">
          <span className="text-muted-foreground">Result</span>
          <span className={cn(
            'font-medium',
            execution.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {execution.profit >= 0 ? '+' : ''}{execution.profit.toFixed(2)} USDT
          </span>
        </div>
      )}
    </div>
  );
}

export function TradeExecutionTimeline({ className }: { className?: string }) {
  const { executions, currentExecution, metrics } = useTradeExecutionTimeline();

  const allExecutions = useMemo(() => {
    if (currentExecution) {
      return [currentExecution, ...executions.filter(e => e.id !== currentExecution.id)];
    }
    return executions;
  }, [executions, currentExecution]);

  return (
    <Card className={cn('card-terminal', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Trade Execution Timeline
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {metrics.totalExecutions} trades
          </Badge>
        </div>
        
        {/* Metrics summary */}
        <div className="grid grid-cols-4 gap-2 mt-2">
          <div className="text-center p-1.5 bg-muted/30 rounded">
            <span className="text-[9px] text-muted-foreground block">Avg Total</span>
            <span className="text-xs font-mono text-foreground">{metrics.avgTotalDuration.toFixed(0)}ms</span>
          </div>
          <div className="text-center p-1.5 bg-muted/30 rounded">
            <span className="text-[9px] text-muted-foreground block">Analysis</span>
            <span className="text-xs font-mono text-foreground">{metrics.avgAnalysis.toFixed(0)}ms</span>
          </div>
          <div className="text-center p-1.5 bg-muted/30 rounded">
            <span className="text-[9px] text-muted-foreground block">Order</span>
            <span className="text-xs font-mono text-foreground">{metrics.avgOrderPlacement.toFixed(0)}ms</span>
          </div>
          <div className="text-center p-1.5 bg-muted/30 rounded">
            <span className="text-[9px] text-muted-foreground block">Success</span>
            <span className="text-xs font-mono text-emerald-400">{metrics.successRate.toFixed(0)}%</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {allExecutions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            <div className="text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No trade executions yet</p>
              <p className="text-xs mt-1">Start the bot to see execution timelines</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2 pr-2">
              {allExecutions.map(execution => (
                <ExecutionCard key={execution.id} execution={execution} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
