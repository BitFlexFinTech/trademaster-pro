import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTelemetryHistory } from '@/hooks/useTelemetryHistory';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { Clock, Activity, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

type DateRange = '1d' | '7d' | '30d' | '90d';

const PHASE_COLORS = {
  pairSelection: 'hsl(var(--chart-1))',
  aiAnalysis: 'hsl(var(--chart-2))',
  orderPreparation: 'hsl(var(--chart-3))',
  orderPlacement: 'hsl(var(--chart-4))',
  confirmation: 'hsl(var(--chart-5))',
};

const PHASE_LABELS: Record<string, string> = {
  pairSelection: 'Pair Selection',
  aiAnalysis: 'AI Analysis',
  orderPreparation: 'Order Prep',
  orderPlacement: 'Order Place',
  confirmation: 'Confirm',
};

export function TelemetryHistoryDashboard({ className }: { className?: string }) {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const data = useTelemetryHistory(dateRange);

  if (data.isLoading) {
    return (
      <Card className={`card-terminal ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Execution History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data.timeSeries.length > 0;

  // Prepare chart data
  const chartData = data.timeSeries.map(point => ({
    time: format(point.timestamp, 'MMM d HH:mm'),
    total: Math.round(point.avgTotal),
    pairSelection: Math.round(point.phases.pairSelection),
    aiAnalysis: Math.round(point.phases.aiAnalysis),
    orderPreparation: Math.round(point.phases.orderPreparation),
    orderPlacement: Math.round(point.phases.orderPlacement),
    confirmation: Math.round(point.phases.confirmation),
    trades: point.tradeCount,
    successRate: Math.round(point.successRate),
  }));

  // Prepare pie chart data
  const pieData = Object.entries(PHASE_LABELS).map(([key, label]) => {
    const totalDuration = data.timeSeries.reduce(
      (sum, point) => sum + (point.phases[key as keyof typeof point.phases] || 0) * point.tradeCount,
      0
    );
    return { name: label, value: Math.round(totalDuration), key };
  }).filter(d => d.value > 0);

  // Prepare exchange bar data
  const exchangeBarData = Object.entries(data.exchangeComparison).map(([exchange, stats]) => ({
    name: exchange.charAt(0).toUpperCase() + exchange.slice(1),
    avgMs: Math.round(stats.avgTotal),
    count: stats.count,
    successRate: Math.round(stats.successRate),
  }));

  return (
    <Card className={`card-terminal ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Execution History
          </CardTitle>
          <div className="flex items-center gap-1">
            {(['1d', '7d', '30d', '90d'] as DateRange[]).map(range => (
              <Button
                key={range}
                variant={dateRange === range ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setDateRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No telemetry history</p>
            <p className="text-xs mt-1">Trade data will appear here as you execute trades</p>
          </div>
        ) : (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 rounded bg-muted/30 border border-border/50 text-center">
                <p className="text-lg font-bold font-mono">{data.overallStats.avgTotal.toFixed(0)}ms</p>
                <p className="text-[10px] text-muted-foreground">Avg Execution</p>
              </div>
              <div className="p-2 rounded bg-muted/30 border border-border/50 text-center">
                <p className="text-lg font-bold font-mono">{data.overallStats.p95Total.toFixed(0)}ms</p>
                <p className="text-[10px] text-muted-foreground">P95 Execution</p>
              </div>
              <div className="p-2 rounded bg-muted/30 border border-border/50 text-center">
                <p className="text-lg font-bold font-mono">{data.overallStats.tradesWithTelemetry}</p>
                <p className="text-[10px] text-muted-foreground">Trades w/ Data</p>
              </div>
              <div className="p-2 rounded bg-muted/30 border border-border/50 text-center">
                <p className="text-lg font-bold font-mono">{data.anomalies.length}</p>
                <p className="text-[10px] text-muted-foreground">Anomalies</p>
              </div>
            </div>

            {/* Execution Time Trend */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium flex items-center gap-2">
                <TrendingUp className="w-3 h-3" />
                Execution Time Trend
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => `${v}ms`}
                      tickLine={false}
                      axisLine={false}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                      formatter={(value: number) => [`${value}ms`, 'Total']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary))" 
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Phase Breakdown Stacked Area */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium flex items-center gap-2">
                <BarChart3 className="w-3 h-3" />
                Phase Breakdown Over Time
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(v) => `${v}ms`}
                      tickLine={false}
                      axisLine={false}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '11px',
                      }}
                    />
                    <Area type="monotone" dataKey="pairSelection" stackId="1" stroke={PHASE_COLORS.pairSelection} fill={PHASE_COLORS.pairSelection} fillOpacity={0.6} name="Pair Selection" />
                    <Area type="monotone" dataKey="aiAnalysis" stackId="1" stroke={PHASE_COLORS.aiAnalysis} fill={PHASE_COLORS.aiAnalysis} fillOpacity={0.6} name="AI Analysis" />
                    <Area type="monotone" dataKey="orderPreparation" stackId="1" stroke={PHASE_COLORS.orderPreparation} fill={PHASE_COLORS.orderPreparation} fillOpacity={0.6} name="Order Prep" />
                    <Area type="monotone" dataKey="orderPlacement" stackId="1" stroke={PHASE_COLORS.orderPlacement} fill={PHASE_COLORS.orderPlacement} fillOpacity={0.6} name="Order Place" />
                    <Area type="monotone" dataKey="confirmation" stackId="1" stroke={PHASE_COLORS.confirmation} fill={PHASE_COLORS.confirmation} fillOpacity={0.6} name="Confirm" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Phase Distribution Pie */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium">Time Distribution</h4>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={55}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry) => (
                          <Cell 
                            key={entry.key} 
                            fill={PHASE_COLORS[entry.key as keyof typeof PHASE_COLORS] || 'hsl(var(--muted))'} 
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          fontSize: '11px',
                        }}
                        formatter={(value: number) => [`${(value / 1000).toFixed(1)}s total`, '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {pieData.map(entry => (
                    <Badge 
                      key={entry.key} 
                      variant="outline" 
                      className="text-[9px]"
                      style={{ borderColor: PHASE_COLORS[entry.key as keyof typeof PHASE_COLORS] }}
                    >
                      {entry.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Exchange Comparison */}
              {exchangeBarData.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium">Exchange Speed</h4>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={exchangeBarData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(v) => `${v}ms`}
                          tickLine={false}
                          axisLine={false}
                          width={45}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            fontSize: '11px',
                          }}
                          formatter={(value: number, name: string) => {
                            if (name === 'avgMs') return [`${value}ms`, 'Avg Time'];
                            return [value, name];
                          }}
                        />
                        <Bar dataKey="avgMs" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Anomalies */}
            {data.anomalies.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Recent Anomalies
                </h4>
                <div className="space-y-1">
                  {data.anomalies.slice(0, 3).map((anomaly, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                      <span>{format(anomaly.timestamp, 'MMM d HH:mm')}</span>
                      <Badge variant="outline" className="text-[10px] text-amber-400">
                        {anomaly.durationMs.toFixed(0)}ms
                      </Badge>
                      <span className="text-muted-foreground">{anomaly.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
