/**
 * Auto-Deploy Settings
 * Configure automatic deployment of idle capital to qualified opportunities
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, DollarSign, Target, Layers, ShieldCheck } from 'lucide-react';
import { useBotStore } from '@/stores/botStore';
import { cn } from '@/lib/utils';

export function AutoDeploySettings() {
  const autoDeployConfig = useBotStore(state => state.autoDeployConfig);
  const setAutoDeployConfig = useBotStore(state => state.setAutoDeployConfig);
  const capitalMetrics = useBotStore(state => state.capitalMetrics);
  const opportunities = useBotStore(state => state.opportunities);
  const positions = useBotStore(state => state.positions);
  
  // Check if ready to auto-deploy
  const isReadyToDeploy = 
    autoDeployConfig?.enabled &&
    capitalMetrics.idleFunds >= (autoDeployConfig?.minIdleFunds || 50) &&
    positions.length < (autoDeployConfig?.maxPositions || 5) &&
    opportunities.some(o => o.confidence >= (autoDeployConfig?.minConfidence || 0.75));

  // Use default values if not set
  const config = autoDeployConfig || {
    enabled: false,
    minIdleFunds: 50,
    maxPositions: 5,
    minConfidence: 0.75,
    preferredExchanges: ['Binance'],
    excludePairs: [],
  };

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Auto-Deploy Rules
          </CardTitle>
          <div className="flex items-center gap-2">
            {isReadyToDeploy && (
              <Badge variant="default" className="text-[10px] animate-pulse">
                Ready
              </Badge>
            )}
            <Switch 
              checked={config.enabled}
              onCheckedChange={(enabled) => setAutoDeployConfig?.({ enabled })}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Summary */}
        {config.enabled && (
          <div className="p-3 bg-muted/30 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Idle Capital:</span>
              <span className={cn(
                "font-mono font-medium",
                capitalMetrics.idleFunds >= config.minIdleFunds ? "text-green-500" : "text-amber-500"
              )}>
                ${capitalMetrics.idleFunds.toFixed(2)} / ${config.minIdleFunds}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Positions:</span>
              <span className={cn(
                "font-mono font-medium",
                positions.length < config.maxPositions ? "text-green-500" : "text-amber-500"
              )}>
                {positions.length} / {config.maxPositions}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Qualified Opps:</span>
              <span className="font-mono font-medium text-primary">
                {opportunities.filter(o => o.confidence >= config.minConfidence).length}
              </span>
            </div>
          </div>
        )}

        {/* Minimum Idle Funds */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Min Idle to Deploy ($)
          </Label>
          <div className="flex items-center gap-2">
            <Slider
              value={[config.minIdleFunds]}
              min={10}
              max={500}
              step={10}
              onValueChange={([v]) => setAutoDeployConfig?.({ minIdleFunds: v })}
              className="flex-1"
              disabled={!config.enabled}
            />
            <span className="w-16 text-right font-mono text-xs">${config.minIdleFunds}</span>
          </div>
        </div>

        {/* Max Positions */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Layers className="w-3 h-3" />
            Max Open Positions
          </Label>
          <div className="flex items-center gap-2">
            <Slider
              value={[config.maxPositions]}
              min={1}
              max={10}
              step={1}
              onValueChange={([v]) => setAutoDeployConfig?.({ maxPositions: v })}
              className="flex-1"
              disabled={!config.enabled}
            />
            <span className="w-8 text-right font-mono text-xs">{config.maxPositions}</span>
          </div>
        </div>

        {/* Min Confidence */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Target className="w-3 h-3" />
            Min Signal Confidence
          </Label>
          <div className="flex items-center gap-2">
            <Slider
              value={[config.minConfidence * 100]}
              min={50}
              max={95}
              step={5}
              onValueChange={([v]) => setAutoDeployConfig?.({ minConfidence: v / 100 })}
              className="flex-1"
              disabled={!config.enabled}
            />
            <span className="w-12 text-right font-mono text-xs">{(config.minConfidence * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Preferred Exchange */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Preferred Exchange
          </Label>
          <Select 
            value={config.preferredExchanges?.[0] || 'Binance'}
            onValueChange={(v) => setAutoDeployConfig?.({ preferredExchanges: [v] })}
            disabled={!config.enabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Binance">Binance</SelectItem>
              <SelectItem value="OKX">OKX</SelectItem>
              <SelectItem value="Bybit">Bybit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rules Summary */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground">
            {config.enabled ? (
              <>
                Auto-deploys when: idle ≥ ${config.minIdleFunds}, 
                positions &lt; {config.maxPositions}, 
                signal confidence ≥ {(config.minConfidence * 100).toFixed(0)}%
              </>
            ) : (
              'Enable to automatically deploy idle capital when qualified opportunities arise'
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
