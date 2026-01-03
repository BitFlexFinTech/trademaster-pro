import { useState } from 'react';
import { Filter, TrendingDown, BarChart3, PieChart, Clock, AlertTriangle, RefreshCw, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRejectionAnalytics, TimeRange } from '@/hooks/useRejectionAnalytics';
import { formatDistanceToNow } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { cn } from '@/lib/utils';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
];

const REASON_COLORS: Record<string, string> = {
  volume: 'hsl(var(--chart-1))',
  volatility: 'hsl(var(--chart-2))',
  momentum: 'hsl(var(--chart-3))',
  spread: 'hsl(var(--chart-4))',
  timeOfDay: 'hsl(var(--chart-5))',
  duration: 'hsl(var(--primary))',
  other: 'hsl(var(--muted-foreground))',
};

export default function RejectionAnalytics() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  
  const { data, loading, error, availableSymbols, availableReasons } = useRejectionAnalytics(timeRange, {
    symbol: symbolFilter || undefined,
    reason: reasonFilter || undefined,
  });

  const handleRefresh = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={handleRefresh} className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pieData = data?.topReasons.slice(0, 6).map(r => ({
    name: r.reason.length > 20 ? r.reason.substring(0, 20) + '...' : r.reason,
    value: r.count,
    fullName: r.reason,
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Rejection Analytics</h1>
          <Badge variant="secondary" className="text-xs">
            {data?.totalRejections.toLocaleString() || 0} total
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(tr => (
                <SelectItem key={tr.value} value={tr.value}>{tr.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={symbolFilter} onValueChange={setSymbolFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Symbols" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Symbols</SelectItem>
            {availableSymbols.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All Reasons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Reasons</SelectItem>
            {availableReasons.map(r => (
              <SelectItem key={r} value={r}>{r.length > 30 ? r.substring(0, 30) + '...' : r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(symbolFilter || reasonFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSymbolFilter(''); setReasonFilter(''); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Total Rejections</span>
            </div>
            <p className="text-3xl font-bold">{data?.totalRejections.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Top Reason</span>
            </div>
            <p className="text-lg font-semibold truncate">
              {data?.topReasons[0]?.reason || 'N/A'}
            </p>
            <p className="text-sm text-muted-foreground">
              {data?.topReasons[0]?.percentage.toFixed(1) || 0}% of rejections
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <PieChart className="w-4 h-4 text-chart-2" />
              <span className="text-sm text-muted-foreground">Qualification Rate</span>
            </div>
            <p className="text-3xl font-bold text-primary">{data?.qualificationRate.toFixed(1) || 0}%</p>
            <p className="text-xs text-muted-foreground">of scanned opportunities</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rejections Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Rejections Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.timeSeries && data.timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="volume" stackId="1" stroke={REASON_COLORS.volume} fill={REASON_COLORS.volume} fillOpacity={0.6} name="Volume" />
                  <Area type="monotone" dataKey="volatility" stackId="1" stroke={REASON_COLORS.volatility} fill={REASON_COLORS.volatility} fillOpacity={0.6} name="Volatility" />
                  <Area type="monotone" dataKey="momentum" stackId="1" stroke={REASON_COLORS.momentum} fill={REASON_COLORS.momentum} fillOpacity={0.6} name="Momentum" />
                  <Area type="monotone" dataKey="spread" stackId="1" stroke={REASON_COLORS.spread} fill={REASON_COLORS.spread} fillOpacity={0.6} name="Spread" />
                  <Area type="monotone" dataKey="duration" stackId="1" stroke={REASON_COLORS.duration} fill={REASON_COLORS.duration} fillOpacity={0.6} name="Duration" />
                  <Area type="monotone" dataKey="other" stackId="1" stroke={REASON_COLORS.other} fill={REASON_COLORS.other} fillOpacity={0.6} name="Other" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No data for selected time range
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reason Breakdown Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Rejection Reasons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={Object.values(REASON_COLORS)[index % Object.values(REASON_COLORS).length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name, props) => [value, props.payload.fullName]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No rejection data
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Rejected Symbols */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Most Rejected Symbols
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topSymbols && data.topSymbols.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.topSymbols.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="symbol" type="category" width={80} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No symbol data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Rejections Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Rejections</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Symbol</TableHead>
                  <TableHead className="w-20">Exchange</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-20 text-right">Momentum</TableHead>
                  <TableHead className="w-20 text-right">Volatility</TableHead>
                  <TableHead className="w-24 text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.recentRejections.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.symbol}</TableCell>
                    <TableCell className="text-sm">{r.exchange}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={r.rejection_reason}>
                      {r.rejection_reason}
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono text-sm",
                      (r.momentum || 0) > 0 ? "text-primary" : "text-destructive"
                    )}>
                      {r.momentum != null ? `${(r.momentum * 100).toFixed(2)}%` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.volatility != null ? `${(r.volatility * 100).toFixed(2)}%` : '-'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
                {(!data?.recentRejections || data.recentRejections.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No rejections found for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
