import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line
} from 'recharts';
import { 
  BarChart3, TrendingUp, TrendingDown, Plus, X, 
  Calendar, ArrowUpRight, ArrowDownRight, Minus, Lightbulb
} from 'lucide-react';
import { usePerformanceComparison, ComparisonPeriod } from '@/hooks/usePerformanceComparison';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function PerformanceComparisonDashboard() {
  const {
    periods,
    dimension,
    setDimension,
    addPeriod,
    removePeriod,
    loading,
    deltaAnalysis,
  } = usePerformanceComparison();

  const MetricCard = ({ 
    label, 
    values, 
    format: formatFn = (v: number) => v.toFixed(2),
    colorize = false,
  }: { 
    label: string; 
    values: number[];
    format?: (v: number) => string;
    colorize?: boolean;
  }) => (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-xs text-muted-foreground mb-2">{label}</div>
      <div className="flex gap-4">
        {values.map((value, idx) => (
          <div key={idx} className="flex-1">
            <div className={cn(
              "text-lg font-bold",
              colorize && value > 0 ? "text-emerald-400" :
              colorize && value < 0 ? "text-red-400" : "text-foreground"
            )}>
              {formatFn(value)}
            </div>
            {periods[idx] && (
              <div className="text-[10px] text-muted-foreground">
                {periods[idx].label}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Prepare chart data
  const chartData = periods.map(p => ({
    name: p.label,
    pnl: p.metrics.totalPnL,
    winRate: p.metrics.winRate,
    trades: p.metrics.totalTrades,
    profitFactor: p.metrics.profitFactor,
  }));

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Performance Comparison
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={dimension} onValueChange={(v: any) => setDimension(v)}>
              <SelectTrigger className="w-[130px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time">Time Period</SelectItem>
                <SelectItem value="regime">Regime</SelectItem>
                <SelectItem value="strategy">Strategy</SelectItem>
                <SelectItem value="pair">Pair</SelectItem>
              </SelectContent>
            </Select>
            {periods.length < 4 && (
              <Select onValueChange={(v) => addPeriod(v)}>
                <SelectTrigger className="w-[140px] h-8">
                  <Plus className="h-3 w-3 mr-1" />
                  Add Period
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Period badges */}
        <div className="flex gap-2 flex-wrap mt-2">
          {periods.map((period) => (
            <Badge key={period.id} variant="secondary" className="gap-1">
              <Calendar className="h-3 w-3" />
              {period.label}
              <span className="text-[10px] text-muted-foreground">
                ({format(period.startDate, 'MMM d')} - {format(period.endDate, 'MMM d')})
              </span>
              <X 
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive" 
                onClick={() => removePeriod(period.id)}
              />
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {periods.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Add periods to compare your trading performance
          </div>
        ) : (
          <>
            {/* Metrics Comparison */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard 
                label="Total P&L" 
                values={periods.map(p => p.metrics.totalPnL)}
                format={(v) => `$${v.toFixed(2)}`}
                colorize
              />
              <MetricCard 
                label="Win Rate" 
                values={periods.map(p => p.metrics.winRate)}
                format={(v) => `${v.toFixed(1)}%`}
              />
              <MetricCard 
                label="Total Trades" 
                values={periods.map(p => p.metrics.totalTrades)}
                format={(v) => v.toString()}
              />
              <MetricCard 
                label="Profit Factor" 
                values={periods.map(p => p.metrics.profitFactor)}
                format={(v) => v.toFixed(2)}
              />
            </div>

            {/* Delta Analysis */}
            {deltaAnalysis && (
              <div className="bg-muted/30 rounded-lg p-4 border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Delta Analysis</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">P&L Change</div>
                    <div className={cn(
                      "flex items-center gap-1 font-bold",
                      deltaAnalysis.pnlChange >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {deltaAnalysis.pnlChange >= 0 ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                      ${Math.abs(deltaAnalysis.pnlChange).toFixed(2)}
                      <span className="text-xs">
                        ({deltaAnalysis.pnlChangePercent >= 0 ? '+' : ''}{deltaAnalysis.pnlChangePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Win Rate</div>
                    <div className={cn(
                      "flex items-center gap-1 font-bold",
                      deltaAnalysis.winRateChange >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {deltaAnalysis.winRateChange >= 0 ? '+' : ''}
                      {deltaAnalysis.winRateChange.toFixed(1)}%
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Trade Count</div>
                    <div className="flex items-center gap-1 font-bold text-foreground">
                      {deltaAnalysis.tradeCountChange >= 0 ? '+' : ''}
                      {deltaAnalysis.tradeCountChange}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Risk Adjusted</div>
                    <div className={cn(
                      "flex items-center gap-1 font-bold",
                      deltaAnalysis.riskAdjustedChange >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {deltaAnalysis.riskAdjustedChange >= 0 ? '+' : ''}
                      {deltaAnalysis.riskAdjustedChange.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Insights */}
                {deltaAnalysis.insights.length > 0 && (
                  <div className="bg-background/50 rounded p-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                      <Lightbulb className="h-3 w-3" />
                      Key Insights
                    </div>
                    <ul className="text-xs space-y-1">
                      {deltaAnalysis.insights.map((insight, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Bar Chart Comparison */}
            {chartData.length > 0 && (
              <div className="h-[250px] bg-muted/20 rounded-lg p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="pnl" name="P&L ($)" fill="hsl(var(--primary))" />
                    <Bar dataKey="trades" name="Trades" fill="hsl(var(--chart-2))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}