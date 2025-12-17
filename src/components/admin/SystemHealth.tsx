import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, XCircle, Activity, Database, Wifi, Clock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStat {
  level: string;
  count: number;
  lastOccurred: string;
}

interface RecentError {
  id: string;
  level: string;
  message: string;
  created_at: string;
  context?: Record<string, unknown>;
}

interface SystemHealthProps {
  errorStats: ErrorStat[];
  recentErrors: RecentError[];
  onClearErrors?: () => void;
}

export function SystemHealth({ errorStats, recentErrors, onClearErrors }: SystemHealthProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getErrorIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-primary" />;
    }
  };

  const totalErrors = errorStats.reduce((sum, e) => sum + e.count, 0);
  const criticalErrors = errorStats.find(e => e.level === 'error')?.count || 0;

  // Calculate system health score (simple heuristic)
  const healthScore = Math.max(0, 100 - (criticalErrors * 10) - (totalErrors * 2));
  const healthStatus = healthScore >= 90 ? 'healthy' : healthScore >= 70 ? 'degraded' : 'critical';

  return (
    <div className="space-y-6">
      {/* Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Activity className="w-3.5 h-3.5" />
              System Health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className={cn(
                "text-2xl font-bold",
                healthStatus === 'healthy' ? 'text-primary' :
                healthStatus === 'degraded' ? 'text-yellow-500' : 'text-destructive'
              )}>
                {healthScore}%
              </p>
              <Badge variant={
                healthStatus === 'healthy' ? 'default' :
                healthStatus === 'degraded' ? 'secondary' : 'destructive'
              }>
                {healthStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Database className="w-3.5 h-3.5" />
              Database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="text-foreground font-medium">Connected</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Supabase Cloud</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Wifi className="w-3.5 h-3.5" />
              Realtime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="text-foreground font-medium">Active</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">WebSocket enabled</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5" />
              Edge Functions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="text-foreground font-medium">Deployed</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">17 functions</p>
          </CardContent>
        </Card>
      </div>

      {/* Error Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Error Summary</CardTitle>
            <CardDescription>By severity level</CardDescription>
          </div>
          {totalErrors > 0 && onClearErrors && (
            <Button variant="destructive" size="sm" onClick={onClearErrors} className="gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {['error', 'warning', 'info'].map(level => {
              const stat = errorStats.find(e => e.level === level);
              return (
                <div key={level} className="text-center p-4 bg-secondary/50 rounded-lg">
                  {getErrorIcon(level)}
                  <p className="text-2xl font-bold text-foreground mt-2">{stat?.count || 0}</p>
                  <p className="text-xs text-muted-foreground capitalize">{level}s</p>
                  {stat?.lastOccurred && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Last: {formatDate(stat.lastOccurred)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Errors */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">Recent Errors</CardTitle>
          <CardDescription>Last 20 logged errors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {recentErrors.map((error) => (
              <div key={error.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getErrorIcon(error.level)}
                    <Badge variant={error.level === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                      {error.level}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{formatDate(error.created_at)}</span>
                </div>
                <p className="text-sm text-foreground line-clamp-2">{error.message}</p>
                {error.context && Object.keys(error.context).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer">View context</summary>
                    <pre className="text-[10px] text-muted-foreground bg-background p-2 rounded mt-1 overflow-x-auto">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
            {recentErrors.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-2 opacity-50" />
                <p className="text-muted-foreground">No errors logged</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
