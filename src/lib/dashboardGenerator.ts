/**
 * Dashboard Generator
 * 
 * Generates JSON schema-based visual dashboards every 20 trades:
 * - Line chart (profit growth)
 * - Bar chart (trade distribution)
 * - Gauge chart (hit rate vs thresholds)
 * - Timeline chart (trade speed mode changes)
 */

import { tradeSpeedController, SpeedModeChange } from './tradeSpeedController';
import { AuditReport } from './selfAuditReporter';

// Chart data point types
export interface LineDataPoint {
  x: number;  // timestamp
  y: number;  // value
  label?: string;
}

export interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface GaugeThreshold {
  label: string;
  value: number;
  color: string;
}

export interface TimelineEvent {
  timestamp: number;
  mode: string;
  reason: string;
}

// Chart schema types
export interface LineChartSchema {
  type: 'line';
  title: string;
  data: LineDataPoint[];
  xAxisLabel: string;
  yAxisLabel: string;
  annotations?: Array<{
    x: number;
    label: string;
  }>;
}

export interface BarChartSchema {
  type: 'bar';
  title: string;
  data: BarDataPoint[];
  xAxisLabel: string;
  yAxisLabel: string;
}

export interface GaugeChartSchema {
  type: 'gauge';
  title: string;
  value: number;
  min: number;
  max: number;
  thresholds: GaugeThreshold[];
  unit: string;
}

export interface TimelineChartSchema {
  type: 'timeline';
  title: string;
  events: TimelineEvent[];
}

export interface DashboardCharts {
  profitGrowth: LineChartSchema;
  tradeDistribution: BarChartSchema;
  hitRateGauge: GaugeChartSchema;
  speedModeTimeline: TimelineChartSchema;
  generatedAt: string;
  reportId: string;
}

// Track profit history for line chart
let profitHistory: Array<{ timestamp: number; cumulativeProfit: number; tradeNumber: number }> = [];

/**
 * Record profit for history tracking
 */
export function recordProfitForDashboard(profit: number, tradeNumber: number): void {
  const lastCumulative = profitHistory.length > 0 
    ? profitHistory[profitHistory.length - 1].cumulativeProfit 
    : 0;
  
  profitHistory.push({
    timestamp: Date.now(),
    cumulativeProfit: lastCumulative + profit,
    tradeNumber,
  });
  
  // Keep last 100 data points
  if (profitHistory.length > 100) {
    profitHistory = profitHistory.slice(-100);
  }
}

/**
 * Generate all dashboard charts
 */
export function generateDashboards(auditReport: AuditReport): DashboardCharts {
  return {
    profitGrowth: generateProfitGrowthChart(),
    tradeDistribution: generateTradeDistributionChart(auditReport),
    hitRateGauge: generateHitRateGauge(auditReport.rollingHitRate),
    speedModeTimeline: generateSpeedModeTimeline(),
    generatedAt: new Date().toISOString(),
    reportId: auditReport.reportId,
  };
}

/**
 * Generate profit growth line chart
 */
function generateProfitGrowthChart(): LineChartSchema {
  const data: LineDataPoint[] = profitHistory.map(p => ({
    x: p.timestamp,
    y: p.cumulativeProfit,
    label: `Trade #${p.tradeNumber}: $${p.cumulativeProfit.toFixed(2)}`,
  }));
  
  // Add annotations for milestones (every $10)
  const annotations: Array<{ x: number; label: string }> = [];
  let lastMilestone = 0;
  
  for (const point of profitHistory) {
    const currentMilestone = Math.floor(point.cumulativeProfit / 10) * 10;
    if (currentMilestone > lastMilestone && currentMilestone > 0) {
      annotations.push({
        x: point.timestamp,
        label: `$${currentMilestone} milestone`,
      });
      lastMilestone = currentMilestone;
    }
  }
  
  return {
    type: 'line',
    title: 'Profit Growth Over Time',
    data,
    xAxisLabel: 'Time',
    yAxisLabel: 'Cumulative Profit ($)',
    annotations,
  };
}

/**
 * Generate trade distribution bar chart
 */
function generateTradeDistributionChart(auditReport: AuditReport): BarChartSchema {
  const data: BarDataPoint[] = [
    {
      label: 'Long Wins',
      value: auditReport.longWins,
      color: 'hsl(var(--primary))',
    },
    {
      label: 'Long Losses',
      value: auditReport.longTrades - auditReport.longWins,
      color: 'hsl(var(--destructive))',
    },
    {
      label: 'Short Wins',
      value: auditReport.shortWins,
      color: 'hsl(var(--chart-2))',
    },
    {
      label: 'Short Losses',
      value: auditReport.shortTrades - auditReport.shortWins,
      color: 'hsl(var(--chart-5))',
    },
  ];
  
  return {
    type: 'bar',
    title: 'Trade Distribution (Long vs Short)',
    data,
    xAxisLabel: 'Trade Type',
    yAxisLabel: 'Count',
  };
}

/**
 * Generate hit rate gauge chart
 */
function generateHitRateGauge(hitRate: number): GaugeChartSchema {
  return {
    type: 'gauge',
    title: 'Hit Rate vs Thresholds',
    value: hitRate,
    min: 0,
    max: 100,
    thresholds: [
      {
        label: 'Critical (<90%)',
        value: 90,
        color: 'hsl(var(--destructive))',
      },
      {
        label: 'Slow (90-95%)',
        value: 95,
        color: 'hsl(var(--warning))',
      },
      {
        label: 'Normal (95-98%)',
        value: 98,
        color: 'hsl(var(--chart-2))',
      },
      {
        label: 'Fast (>98%)',
        value: 100,
        color: 'hsl(var(--primary))',
      },
    ],
    unit: '%',
  };
}

/**
 * Generate speed mode timeline chart
 */
function generateSpeedModeTimeline(): TimelineChartSchema {
  const speedModeHistory = tradeSpeedController.getSpeedModeHistory();
  
  const events: TimelineEvent[] = speedModeHistory.map(change => ({
    timestamp: change.timestamp,
    mode: change.toMode,
    reason: change.reason,
  }));
  
  // Add current mode if no history
  if (events.length === 0) {
    events.push({
      timestamp: Date.now(),
      mode: tradeSpeedController.getSpeedMode(),
      reason: 'Initial mode',
    });
  }
  
  return {
    type: 'timeline',
    title: 'Trade Speed Mode Changes',
    events,
  };
}

/**
 * Convert dashboard to JSON string
 */
export function dashboardToJSON(dashboard: DashboardCharts): string {
  return JSON.stringify(dashboard, null, 2);
}

/**
 * Generate summary statistics for dashboard
 */
export function generateDashboardSummary(dashboard: DashboardCharts): string {
  const profitData = dashboard.profitGrowth.data;
  const latestProfit = profitData.length > 0 ? profitData[profitData.length - 1].y : 0;
  
  const totalTrades = dashboard.tradeDistribution.data.reduce((sum, d) => sum + d.value, 0);
  
  const speedEvents = dashboard.speedModeTimeline.events;
  const currentMode = speedEvents.length > 0 ? speedEvents[speedEvents.length - 1].mode : 'normal';
  
  return `Dashboard Summary: Cumulative profit $${latestProfit.toFixed(2)} across ${totalTrades} trades. ` +
    `Current hit rate: ${dashboard.hitRateGauge.value.toFixed(1)}%. ` +
    `Speed mode: ${currentMode}. ` +
    `Generated: ${dashboard.generatedAt}`;
}

/**
 * Reset dashboard state
 */
export function resetDashboardState(): void {
  profitHistory = [];
}

/**
 * Get current profit history for visualization
 */
export function getProfitHistory(): typeof profitHistory {
  return [...profitHistory];
}
