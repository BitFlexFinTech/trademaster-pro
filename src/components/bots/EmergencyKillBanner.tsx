import { useState, useEffect } from 'react';
import { AlertTriangle, OctagonX, Shield, Loader2, Volume2, VolumeX, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { KillStatus, EmergencyKillConfig } from '@/hooks/useEmergencyKillSwitch';

interface EmergencyKillBannerProps {
  currentPnL: number;
  killStatus: KillStatus;
  config: EmergencyKillConfig;
  onConfigChange: (updates: Partial<EmergencyKillConfig>) => void;
  onKillTriggered: () => void;
  isKilling: boolean;
  lastKillRecovery?: number;
  isAnyBotRunning: boolean;
}

export function EmergencyKillBanner({
  currentPnL,
  killStatus,
  config,
  onConfigChange,
  onKillTriggered,
  isKilling,
  lastKillRecovery,
  isAnyBotRunning,
}: EmergencyKillBannerProps) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Calculate progress toward auto-kill
  const progressToKill = config.autoKillEnabled && currentPnL < 0
    ? Math.min(100, (Math.abs(currentPnL) / Math.abs(config.autoKillThreshold)) * 100)
    : 0;

  // Auto-kill countdown when in critical state
  useEffect(() => {
    if (killStatus === 'critical' && config.autoKillEnabled && !isKilling) {
      setCountdown(5);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCountdown(null);
    }
  }, [killStatus, config.autoKillEnabled, isKilling]);

  // Only show banner when bot is running OR in critical/executing/complete state
  if (!isAnyBotRunning && killStatus !== 'critical' && killStatus !== 'executing' && killStatus !== 'complete') {
    return null;
  }

  const getStatusColor = () => {
    switch (killStatus) {
      case 'safe': return 'bg-success/10 border-success/30 text-success';
      case 'warning': return 'bg-warning/10 border-warning/30 text-warning animate-pulse';
      case 'critical': return 'bg-destructive/20 border-destructive/50 text-destructive animate-pulse';
      case 'executing': return 'bg-destructive/30 border-destructive text-destructive';
      case 'complete': return 'bg-muted border-border text-muted-foreground';
      default: return 'bg-card border-border text-foreground';
    }
  };

  const getStatusIcon = () => {
    switch (killStatus) {
      case 'safe': return <Shield className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'critical': return <OctagonX className="h-4 w-4" />;
      case 'executing': return <Loader2 className="h-4 w-4 animate-spin" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  return (
    <div className={cn(
      "sticky top-0 z-50 flex items-center justify-between gap-4 px-4 py-2 border-b transition-all",
      getStatusColor()
    )}>
      {/* Left: Status & P&L */}
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">
            {killStatus === 'executing' ? 'Killing...' : 'Live P&L'}
          </span>
          <span className={cn(
            "text-lg font-bold tabular-nums",
            currentPnL >= 0 ? "text-success" : "text-destructive"
          )}>
            {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)} USDT
          </span>
        </div>

        {/* Progress bar to auto-kill */}
        {config.autoKillEnabled && currentPnL < 0 && killStatus !== 'complete' && (
          <div className="hidden sm:flex flex-col gap-1 min-w-[120px]">
            <div className="flex justify-between text-[10px] opacity-70">
              <span>Auto-Kill</span>
              <span>{progressToKill.toFixed(0)}%</span>
            </div>
            <Progress 
              value={progressToKill} 
              className={cn(
                "h-1.5",
                progressToKill > 80 ? "[&>div]:bg-destructive" : progressToKill > 50 ? "[&>div]:bg-warning" : "[&>div]:bg-success"
              )}
            />
          </div>
        )}

        {/* Countdown */}
        {countdown !== null && (
          <Badge variant="destructive" className="animate-pulse">
            Auto-kill in {countdown}s
          </Badge>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* Sound toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>

        {/* Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Kill Switch Settings</h4>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-kill" className="text-xs">Auto-Kill Enabled</Label>
                <Switch
                  id="auto-kill"
                  checked={config.autoKillEnabled}
                  onCheckedChange={(checked) => onConfigChange({ autoKillEnabled: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Warning Threshold</Label>
                <Input
                  type="number"
                  value={config.warningThreshold}
                  onChange={(e) => onConfigChange({ warningThreshold: parseFloat(e.target.value) })}
                  className="h-8"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Critical Threshold</Label>
                <Input
                  type="number"
                  value={config.criticalThreshold}
                  onChange={(e) => onConfigChange({ criticalThreshold: parseFloat(e.target.value) })}
                  className="h-8"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Auto-Kill Threshold</Label>
                <Input
                  type="number"
                  value={config.autoKillThreshold}
                  onChange={(e) => onConfigChange({ autoKillThreshold: parseFloat(e.target.value) })}
                  className="h-8"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Kill Button */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={isKilling || !isAnyBotRunning}
              className={cn(
                "gap-2 font-bold",
                killStatus === 'critical' && "animate-pulse"
              )}
            >
              {isKilling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Killing...
                </>
              ) : (
                <>
                  <OctagonX className="h-4 w-4" />
                  EMERGENCY KILL
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <OctagonX className="h-5 w-5" />
                Confirm Emergency Kill
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>This will immediately:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Stop ALL running bots</li>
                  <li>Close ALL open positions</li>
                  <li>Convert ALL assets to USDT</li>
                  <li>Lock current loss at <span className="text-destructive font-bold">${Math.abs(currentPnL).toFixed(2)}</span></li>
                </ul>
                <p className="pt-2 font-medium">This action cannot be undone.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onKillTriggered}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Execute Kill
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Last recovery info */}
        {lastKillRecovery !== undefined && lastKillRecovery > 0 && (
          <Badge variant="outline" className="hidden md:flex gap-1">
            <span className="text-success">+${lastKillRecovery.toFixed(2)}</span>
            <span className="opacity-50">recovered</span>
          </Badge>
        )}
      </div>
    </div>
  );
}
