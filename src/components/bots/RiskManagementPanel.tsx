import { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ShieldAlert, ShieldCheck, TrendingDown, Pause, ArrowDownToLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface RiskManagementPanelProps {
  currentDrawdown: number;
  maxDrawdown: number;
  currentRiskPercent: number;
  recommendedSize: number;
  baseSize: number;
  adjustedForDrawdown: boolean;
  reductionReasons: string[];
  alertLevel: 'safe' | 'warning' | 'high' | 'critical';
  availableBalance: number;
  isRunning: boolean;
  onPauseTrading?: () => void;
  onReduceRisk?: () => void;
  className?: string;
}

const ALERT_CONFIG = {
  safe: {
    color: 'text-profit',
    bg: 'bg-profit/10',
    border: 'border-profit/30',
    icon: ShieldCheck,
    label: 'Safe',
  },
  warning: {
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: AlertTriangle,
    label: 'Warning',
  },
  high: {
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: ShieldAlert,
    label: 'High Risk',
  },
  critical: {
    color: 'text-loss',
    bg: 'bg-loss/10',
    border: 'border-loss/30',
    icon: ShieldAlert,
    label: 'Critical',
  },
};

export function RiskManagementPanel({
  currentDrawdown,
  maxDrawdown,
  currentRiskPercent,
  recommendedSize,
  baseSize,
  adjustedForDrawdown,
  reductionReasons,
  alertLevel,
  availableBalance,
  isRunning,
  onPauseTrading,
  onReduceRisk,
  className,
}: RiskManagementPanelProps) {
  const prevDrawdownRef = useRef(0);
  
  // Trigger alerts when drawdown crosses thresholds
  useEffect(() => {
    if (prevDrawdownRef.current < 5 && currentDrawdown >= 5) {
      toast.warning('⚠️ Drawdown Warning (5%)', {
        description: 'Position size automatically reduced by 30%',
      });
    }
    if (prevDrawdownRef.current < 10 && currentDrawdown >= 10) {
      toast.error('🔶 High Drawdown (10%)', {
        description: 'Consider pausing trading until conditions improve',
      });
    }
    if (prevDrawdownRef.current < 15 && currentDrawdown >= 15) {
      toast.error('🛑 Max Drawdown Reached (15%)', {
        description: 'Trading automatically halted to protect capital',
      });
    }
    prevDrawdownRef.current = currentDrawdown;
  }, [currentDrawdown]);

  const config = ALERT_CONFIG[alertLevel];
  const AlertIcon = config.icon;
  
  const drawdownPercent = (currentDrawdown / maxDrawdown) * 100;
  const sizeReduction = baseSize > 0 ? ((baseSize - recommendedSize) / baseSize) * 100 : 0;
  
  // Color zones for progress bar
  const progressColor = useMemo(() => {
    if (currentDrawdown < 3) return 'bg-profit';
    if (currentDrawdown < 5) return 'bg-warning';
    if (currentDrawdown < 10) return 'bg-orange-500';
    return 'bg-loss';
  }, [currentDrawdown]);

  return (
    <Card className={cn('card-terminal', className)}>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
            Risk Management
          </span>
          <Badge 
            variant="outline" 
            className={cn('text-[9px] px-1.5 py-0', config.color, config.bg, config.border)}
          >
            <AlertIcon className="h-2.5 w-2.5 mr-1" />
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="px-3 pb-3 space-y-3">
        {/* Drawdown Gauge */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-muted-foreground">Current Drawdown</span>
            <span className={cn('font-mono font-semibold', config.color)}>
              {currentDrawdown.toFixed(2)}%
            </span>
          </div>
          <div className="relative h-2 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className={cn('h-full transition-all duration-300 rounded-full', progressColor)}
              style={{ width: `${Math.min(drawdownPercent, 100)}%` }}
            />
            {/* Threshold markers */}
            <div className="absolute top-0 left-[33.3%] w-px h-full bg-warning/50" />
            <div className="absolute top-0 left-[66.6%] w-px h-full bg-orange-500/50" />
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground">
            <span>0%</span>
            <span>5%</span>
            <span>10%</span>
            <span>15%</span>
          </div>
        </div>

        {/* Position Size Indicator */}
        <div className={cn(
          'rounded-md p-2 space-y-1.5',
          adjustedForDrawdown ? 'bg-warning/5 border border-warning/20' : 'bg-muted/10'
        )}>
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Position Size
            </span>
            {adjustedForDrawdown && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 text-warning border-warning/30">
                Reduced
              </Badge>
            )}
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono text-foreground">
              ${recommendedSize.toFixed(0)}
            </span>
            {sizeReduction > 0 && (
              <span className="text-[10px] text-loss">
                (−{sizeReduction.toFixed(0)}% from ${baseSize.toFixed(0)})
              </span>
            )}
          </div>
          
          {reductionReasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {reductionReasons.map((reason, idx) => (
                <span 
                  key={idx}
                  className="text-[8px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Risk Metrics Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/10 rounded p-2">
            <span className="text-[9px] text-muted-foreground block">Risk/Trade</span>
            <span className="text-sm font-mono font-semibold text-foreground">
              {currentRiskPercent.toFixed(2)}%
            </span>
          </div>
          <div className="bg-muted/10 rounded p-2">
            <span className="text-[9px] text-muted-foreground block">Available</span>
            <span className="text-sm font-mono font-semibold text-foreground">
              ${availableBalance.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-[10px]"
            onClick={onReduceRisk}
            disabled={!isRunning}
          >
            <ArrowDownToLine className="h-3 w-3 mr-1" />
            Reduce Risk
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 h-7 text-[10px]',
              alertLevel === 'critical' && 'border-loss text-loss hover:bg-loss/10'
            )}
            onClick={onPauseTrading}
            disabled={!isRunning}
          >
            <Pause className="h-3 w-3 mr-1" />
            Pause Trading
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
