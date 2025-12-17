import { useState, useMemo, useEffect } from 'react';
import { useBotAnalytics, PairDirectionPerformance } from '@/hooks/useBotAnalytics';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target, TrendingUp, Shield, AlertTriangle, CheckCircle, XCircle, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'];
const DIRECTIONS: ('long' | 'short')[] = ['long', 'short'];

type TimeframeFilter = '7d' | '30d' | '90d' | 'all';
type DirectionFilter = 'all' | 'long' | 'short';
type StatusFilter = 'all' | 'active' | 'cooldown';

export default function PairPerformance() {
  const [timeframe, setTimeframe] = useState<TimeframeFilter>('30d');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { mode } = useTradingMode();
  const { analytics, loading } = useBotAnalytics(timeframe, 'all', 'all');

  useEffect(() => {
    document.title = 'Pair Performance Analytics | CryptoArb';
  }, []);

  const filteredData = useMemo(() => {
    if (!analytics.pairDirectionPerformance) return [];
    
    return analytics.pairDirectionPerformance.filter(p => {
      if (directionFilter !== 'all' && p.direction !== directionFilter) return false;
      if (statusFilter === 'active' && p.isOnCooldown) return false;
      if (statusFilter === 'cooldown' && !p.isOnCooldown) return false;
      return true;
    });
  }, [analytics.pairDirectionPerformance, directionFilter, statusFilter]);

  const heatmapData = useMemo(() => {
    const data: Record<string, Record<string, number>> = {};
    PAIRS.forEach(pair => {
      data[pair] = { long: 0, short: 0 };
    });
    
    analytics.pairDirectionPerformance?.forEach(p => {
      if (data[p.pair]) {
        data[p.pair][p.direction] = p.winRate;
      }
    });
    
    return data;
  }, [analytics.pairDirectionPerformance]);

  const recommendations = useMemo(() => {
    const sorted = [...(analytics.pairDirectionPerformance || [])].sort((a, b) => b.winRate - a.winRate);
    const withTrades = sorted.filter(p => p.trades >= 5);
    
    return {
      top5: withTrades.slice(0, 5),
      avoid: withTrades.filter(p => p.winRate < 45 && p.trades >= 5).slice(0, 5),
      optimalHours: analytics.optimalTradingHours?.slice(0, 5) || []
    };
  }, [analytics.pairDirectionPerformance, analytics.optimalTradingHours]);

  const getWinRateColor = (rate: number) => {
    if (rate >= 70) return 'bg-green-500/80 text-white';
    if (rate >= 60) return 'bg-green-500/50 text-white';
    if (rate >= 50) return 'bg-yellow-500/50 text-foreground';
    if (rate >= 40) return 'bg-orange-500/50 text-foreground';
    return 'bg-red-500/60 text-white';
  };

  const getStatusBadge = (item: PairDirectionPerformance) => {
    if (item.isOnCooldown) {
      return <Badge variant="destructive" className="text-[9px]"><Shield className="w-3 h-3 mr-1" />COOLDOWN</Badge>;
    }
    if (item.winRate >= 60 && item.trades >= 5) {
      return <Badge variant="default" className="text-[9px] bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />ACTIVE</Badge>;
    }
    if (item.winRate < 45 && item.trades >= 5) {
      return <Badge variant="secondary" className="text-[9px]"><AlertTriangle className="w-3 h-3 mr-1" />CAUTION</Badge>;
    }
    return <Badge variant="outline" className="text-[9px]">ACTIVE</Badge>;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Pair Performance Analytics</h1>
            <p className="text-xs text-muted-foreground">Win rates by pair × direction with heatmap visualization</p>
          </div>
        </div>
        <Badge variant={mode === 'demo' ? 'secondary' : 'default'}>{mode.toUpperCase()}</Badge>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <Select value={timeframe} onValueChange={(v) => setTimeframe(v as TimeframeFilter)}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="30d">30 Days</SelectItem>
            <SelectItem value="90d">90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as DirectionFilter)}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="long">LONG Only</SelectItem>
            <SelectItem value="short">SHORT Only</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cooldown">Cooldown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="table" className="flex-1 min-h-0">
        <TabsList className="mb-2">
          <TabsTrigger value="table" className="text-xs">Performance Table</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs">Heatmap</TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">AI Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="h-[calc(100%-40px)] m-0">
          <Card className="h-full">
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Pair</TableHead>
                    <TableHead className="text-[10px]">Direction</TableHead>
                    <TableHead className="text-[10px] text-right">Win Rate</TableHead>
                    <TableHead className="text-[10px] text-right">Trades</TableHead>
                    <TableHead className="text-[10px] text-right">P&L</TableHead>
                    <TableHead className="text-[10px] text-right">Consec. Losses</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading analytics...
                      </TableCell>
                    </TableRow>
                  ) : filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No trade data available for this timeframe
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((item, idx) => (
                      <TableRow key={idx} className={item.isOnCooldown ? 'bg-destructive/5' : ''}>
                        <TableCell className="text-xs font-medium">{item.pair}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={item.direction === 'long' ? 'default' : 'destructive'}
                            className="text-[9px]"
                          >
                            {item.direction === 'long' ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                            {item.direction.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium",
                            getWinRateColor(item.winRate)
                          )}>
                            {item.winRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right">{item.trades}</TableCell>
                        <TableCell className={cn(
                          "text-xs text-right font-medium",
                          item.profit >= 0 ? 'text-green-400' : 'text-red-400'
                        )}>
                          {item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          {item.consecutiveLosses >= 3 ? (
                            <span className="text-destructive font-medium">{item.consecutiveLosses}</span>
                          ) : (
                            item.consecutiveLosses
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(item)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="heatmap" className="h-[calc(100%-40px)] m-0">
          <Card className="h-full p-4">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="text-sm">Win Rate Heatmap (Pair × Direction)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-[10px] text-left p-2 border-b border-border">Pair</th>
                      <th className="text-[10px] text-center p-2 border-b border-border w-24">
                        <div className="flex items-center justify-center gap-1">
                          <ArrowUp className="w-3 h-3 text-green-400" /> LONG
                        </div>
                      </th>
                      <th className="text-[10px] text-center p-2 border-b border-border w-24">
                        <div className="flex items-center justify-center gap-1">
                          <ArrowDown className="w-3 h-3 text-red-400" /> SHORT
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAIRS.map(pair => (
                      <tr key={pair} className="border-b border-border/50">
                        <td className="text-xs font-medium p-2">{pair}</td>
                        {DIRECTIONS.map(dir => {
                          const rate = heatmapData[pair]?.[dir] || 0;
                          return (
                            <td key={dir} className="p-1">
                              <div className={cn(
                                "text-center py-2 rounded text-xs font-bold",
                                rate > 0 ? getWinRateColor(rate) : 'bg-muted/30 text-muted-foreground'
                              )}>
                                {rate > 0 ? `${rate.toFixed(0)}%` : '-'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="flex items-center justify-center gap-3 mt-4 text-[9px]">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/60" /> &lt;40%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500/50" /> 40-50%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500/50" /> 50-60%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500/50" /> 60-70%</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500/80" /> &gt;70%</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="h-[calc(100%-40px)] m-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                  <TrendingUp className="w-4 h-4" /> Top 5 to Trade
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <ScrollArea className="h-[200px]">
                  {recommendations.top5.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      Need more trade data (min 5 trades per combo)
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recommendations.top5.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-green-400 font-bold text-xs">#{i + 1}</span>
                            <span className="text-xs">{p.pair}</span>
                            <Badge variant={p.direction === 'long' ? 'default' : 'destructive'} className="text-[8px]">
                              {p.direction.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="text-xs text-green-400 font-medium">{p.winRate.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                  <XCircle className="w-4 h-4" /> Avoid These
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <ScrollArea className="h-[200px]">
                  {recommendations.avoid.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No underperforming combos detected
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recommendations.avoid.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span className="text-xs">{p.pair}</span>
                            <Badge variant={p.direction === 'long' ? 'default' : 'destructive'} className="text-[8px]">
                              {p.direction.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="text-xs text-red-400 font-medium">{p.winRate.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                  <Clock className="w-4 h-4" /> Optimal Hours (UTC)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <ScrollArea className="h-[200px]">
                  {recommendations.optimalHours.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      Need more trade data
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recommendations.optimalHours.map((h, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-bold text-xs">#{i + 1}</span>
                            <span className="text-xs">{h.hour.toString().padStart(2, '0')}:00 UTC</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{h.trades} trades</span>
                            <span className={h.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                              ${h.profit.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
