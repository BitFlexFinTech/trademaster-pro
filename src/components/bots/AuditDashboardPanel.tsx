import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, FileText, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfitGrowthChart } from './ProfitGrowthChart';
import { TradeDistributionChart } from './TradeDistributionChart';
import { SpeedModeTimeline } from './SpeedModeTimeline';
import { InvariantChecksGrid } from './InvariantChecksGrid';
import { HitRateGauge } from './HitRateGauge';
import { AuditReport } from '@/lib/selfAuditReporter';
import { DashboardCharts } from '@/lib/dashboardGenerator';

interface AuditDashboardPanelProps {
  auditReport: AuditReport | null;
  dashboards: DashboardCharts | null;
  totalVaultedProfits: number;
  sessionStartBalance: Record<string, number>;
  onRefresh?: () => void;
}

export function AuditDashboardPanel({
  auditReport,
  dashboards,
  totalVaultedProfits,
  sessionStartBalance,
  onRefresh,
}: AuditDashboardPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  if (!auditReport) {
    return (
      <Card className="p-4 bg-secondary/30 border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">Audit Dashboard</h3>
          </div>
        </div>
        <div className="text-center py-8 text-muted-foreground text-sm">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No audit report available</p>
          <p className="text-xs mt-1">Reports generate every 20 trades</p>
        </div>
      </Card>
    );
  }

  const passCount = Object.values(auditReport.invariants).filter(
    (check) => check.status === 'PASS'
  ).length;
  const totalChecks = Object.keys(auditReport.invariants).length;
  const allPassing = passCount === totalChecks;

  return (
    <Card className="p-4 bg-secondary/30 border-border/50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">
            Audit Report #{auditReport.reportNumber}
          </h3>
          <Badge variant={allPassing ? 'default' : 'destructive'} className="text-[9px]">
            {passCount}/{totalChecks} Checks
          </Badge>
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-7 px-2"
          >
            <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          </Button>
        )}
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4">
          {/* Summary Row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-background/50 p-2 rounded text-center">
              <p className="text-[9px] text-muted-foreground">Trades</p>
              <p className="text-sm font-bold font-mono text-foreground">
                {auditReport.tradeWindow.tradeCount}
              </p>
            </div>
            <div className="bg-background/50 p-2 rounded text-center">
              <p className="text-[9px] text-muted-foreground">Rolling Hit Rate</p>
              <p className={cn(
                'text-sm font-bold font-mono',
                auditReport.rollingHitRate >= 95 ? 'text-primary' : 
                auditReport.rollingHitRate >= 90 ? 'text-warning' : 'text-destructive'
              )}>
                {auditReport.rollingHitRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-background/50 p-2 rounded text-center">
              <p className="text-[9px] text-muted-foreground">Vaulted Profits</p>
              <p className="text-sm font-bold font-mono text-primary">
                ${totalVaultedProfits.toFixed(2)}
              </p>
            </div>
            <div className="bg-background/50 p-2 rounded text-center">
              <p className="text-[9px] text-muted-foreground">Speed Mode</p>
              <Badge variant="outline" className="text-[9px] mt-0.5">
                {auditReport.tradeSpeedMode}
              </Badge>
            </div>
          </div>

          {/* Hit Rate Gauge */}
          <div className="bg-background/50 p-3 rounded">
            <h4 className="text-[10px] text-muted-foreground mb-2">Hit Rate Performance</h4>
            <HitRateGauge
              currentHitRate={auditReport.rollingHitRate}
              targetHitRate={95}
              tradesCount={auditReport.tradeWindow.tradeCount}
            />
          </div>

          {/* Profit Growth Chart */}
          {dashboards?.profitGrowth && (
            <div className="bg-background/50 p-3 rounded">
              <h4 className="text-[10px] text-muted-foreground mb-2">Profit Growth</h4>
              <ProfitGrowthChart data={dashboards.profitGrowth} />
            </div>
          )}

          {/* Trade Distribution */}
          {dashboards?.tradeDistribution && (
            <div className="bg-background/50 p-3 rounded">
              <h4 className="text-[10px] text-muted-foreground mb-2">Trade Distribution</h4>
              <TradeDistributionChart data={dashboards.tradeDistribution} />
            </div>
          )}

          {/* Speed Mode Timeline */}
          {dashboards?.speedModeTimeline && (
            <div className="bg-background/50 p-3 rounded">
              <h4 className="text-[10px] text-muted-foreground mb-2">Speed Mode Timeline</h4>
              <SpeedModeTimeline data={dashboards.speedModeTimeline} />
            </div>
          )}

          {/* Invariant Checks */}
          <div className="bg-background/50 p-3 rounded">
            <h4 className="text-[10px] text-muted-foreground mb-2">Invariant Checks</h4>
            <InvariantChecksGrid invariants={auditReport.invariants} />
          </div>

          {/* AI Adjustments */}
          {auditReport.aiAdjustments.length > 0 && (
            <div className="bg-background/50 p-3 rounded">
              <h4 className="text-[10px] text-muted-foreground mb-2">
                AI Adjustments ({auditReport.aiAdjustments.length})
              </h4>
              <div className="space-y-1">
                {auditReport.aiAdjustments.slice(-5).map((adj, i) => (
                  <div key={i} className="text-[9px] text-muted-foreground flex items-start gap-1">
                    <span className="text-primary">•</span>
                    <span>{adj}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Text */}
          <div className="bg-primary/10 p-3 rounded border border-primary/20">
            <p className="text-[10px] text-foreground leading-relaxed">
              {auditReport.summary}
            </p>
          </div>
        </div>
      </ScrollArea>
    </Card>
  );
}
