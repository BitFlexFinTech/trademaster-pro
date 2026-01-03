import { useExecutionTimeAlerts, ExecutionTimeThresholds } from '@/hooks/useExecutionTimeAlerts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, BellOff, Trash2, AlertTriangle, Clock, X, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function ExecutionTimeAlertSettings() {
  const { 
    thresholds, 
    updateThresholds, 
    alerts, 
    recentAlertCount,
    dismissAlert,
    clearAlerts,
    DEFAULT_THRESHOLDS,
  } = useExecutionTimeAlerts();

  const handleThresholdChange = (key: keyof ExecutionTimeThresholds, value: number) => {
    updateThresholds({ [key]: value });
  };

  const resetToDefaults = () => {
    updateThresholds(DEFAULT_THRESHOLDS);
  };

  return (
    <Card className="card-terminal">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-warning" />
            Execution Time Alerts
            {recentAlertCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {recentAlertCount} new
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              checked={thresholds.enableAlerts}
              onCheckedChange={(checked) => updateThresholds({ enableAlerts: checked })}
            />
            <span className="text-xs text-muted-foreground">
              {thresholds.enableAlerts ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Threshold Settings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium flex items-center gap-1">
              <Settings className="w-3 h-3" />
              Thresholds (ms)
            </h4>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={resetToDefaults}>
              Reset
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Total Execution</Label>
              <Input
                type="number"
                value={thresholds.totalMs}
                onChange={(e) => handleThresholdChange('totalMs', Number(e.target.value))}
                className="h-8 text-xs"
                disabled={!thresholds.enableAlerts}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pair Selection</Label>
              <Input
                type="number"
                value={thresholds.pairSelectionMs}
                onChange={(e) => handleThresholdChange('pairSelectionMs', Number(e.target.value))}
                className="h-8 text-xs"
                disabled={!thresholds.enableAlerts}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">AI Analysis</Label>
              <Input
                type="number"
                value={thresholds.aiAnalysisMs}
                onChange={(e) => handleThresholdChange('aiAnalysisMs', Number(e.target.value))}
                className="h-8 text-xs"
                disabled={!thresholds.enableAlerts}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Order Placement</Label>
              <Input
                type="number"
                value={thresholds.orderPlacementMs}
                onChange={(e) => handleThresholdChange('orderPlacementMs', Number(e.target.value))}
                className="h-8 text-xs"
                disabled={!thresholds.enableAlerts}
              />
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-warning" />
              Recent Alerts ({alerts.length})
            </h4>
            {alerts.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAlerts}>
                <Trash2 className="w-3 h-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          <ScrollArea className="h-[200px]">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <BellOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-xs">No alerts yet</span>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex items-start justify-between p-2 rounded-lg border",
                      alert.type === 'slow_total' 
                        ? "bg-destructive/10 border-destructive/20" 
                        : "bg-warning/10 border-warning/20"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">{alert.pair}</span>
                        <Badge variant="outline" className="text-xs h-4 px-1">
                          {alert.exchange}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {alert.type === 'slow_total' ? (
                          <span>Total: <span className="text-loss font-mono">{alert.durationMs}ms</span> (limit: {alert.thresholdMs}ms)</span>
                        ) : (
                          <span>{alert.phase}: <span className="text-warning font-mono">{alert.durationMs}ms</span> (limit: {alert.thresholdMs}ms)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(alert.timestamp, { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
