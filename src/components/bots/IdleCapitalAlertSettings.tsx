/**
 * Idle Capital Alert Settings
 * Configure alerts for when capital sits idle too long
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { AlertTriangle, DollarSign, Clock, Percent } from 'lucide-react';
import { useBotStore } from '@/stores/botStore';

export function IdleCapitalAlertSettings() {
  const alertConfig = useBotStore(state => state.idleCapitalAlert);
  const setConfig = useBotStore(state => state.setIdleAlertConfig);
  const idleStartTime = useBotStore(state => state.idleStartTime);
  const capitalMetrics = useBotStore(state => state.capitalMetrics);

  const idleDurationMs = idleStartTime ? Date.now() - idleStartTime : 0;
  const idleMinutes = Math.floor(idleDurationMs / 60000);

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Idle Capital Alerts
          </CardTitle>
          <Switch 
            checked={alertConfig.enabled}
            onCheckedChange={(enabled) => setConfig({ enabled })}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Status */}
        {alertConfig.enabled && (
          <div className="p-3 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Idle:</span>
              <span className="font-mono font-medium">
                ${capitalMetrics.idleFunds.toFixed(2)}
              </span>
            </div>
            {idleStartTime && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Idle Duration:</span>
                <span className="font-mono font-medium text-amber-500">
                  {idleMinutes} min
                </span>
              </div>
            )}
          </div>
        )}

        {/* Threshold Amount */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Alert Threshold ($)
          </Label>
          <Input
            type="number"
            value={alertConfig.thresholdAmount}
            onChange={(e) => setConfig({ thresholdAmount: Number(e.target.value) })}
            className="h-8 text-sm"
            disabled={!alertConfig.enabled}
          />
          <p className="text-[10px] text-muted-foreground">
            Alert when idle capital exceeds this amount
          </p>
        </div>

        {/* Threshold Percent */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Max Idle Percent (%)
          </Label>
          <Input
            type="number"
            value={alertConfig.thresholdPercent}
            onChange={(e) => setConfig({ thresholdPercent: Number(e.target.value) })}
            className="h-8 text-sm"
            disabled={!alertConfig.enabled}
          />
          <p className="text-[10px] text-muted-foreground">
            Alert when idle exceeds this % of total capital
          </p>
        </div>

        {/* Max Duration */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Max Idle Time (minutes)
          </Label>
          <Input
            type="number"
            value={alertConfig.maxIdleDurationMs / 60000}
            onChange={(e) => setConfig({ maxIdleDurationMs: Number(e.target.value) * 60000 })}
            className="h-8 text-sm"
            disabled={!alertConfig.enabled}
          />
          <p className="text-[10px] text-muted-foreground">
            Alert after capital is idle for this long
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
