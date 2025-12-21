import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  History, 
  Download, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight, 
  Bot, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Filter,
  Loader2,
} from 'lucide-react';
import { useTradesHistory } from '@/hooks/useTradesHistory';
import { cn } from '@/lib/utils';

export default function TradesHistory() {
  const { sessions, loading, filters, setFilters, fetchHistory, exportToCSV, totalTrades, totalPnL } = useTradesHistory();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const toggleSession = (id: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <History className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Trades History</h1>
            <p className="text-muted-foreground">Complete audit trail of all trading activity</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV} disabled={totalTrades === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={fetchHistory} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-bold">{sessions.length}</p>
              </div>
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-2xl font-bold">{totalTrades}</p>
              </div>
              <History className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total P&L</p>
                <p className={cn('text-2xl font-bold', totalPnL >= 0 ? 'text-green-500' : 'text-destructive')}>
                  ${totalPnL.toFixed(2)}
                </p>
              </div>
              {totalPnL >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-500" />
              ) : (
                <TrendingDown className="w-8 h-8 text-destructive" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Per Session</p>
                <p className={cn('text-2xl font-bold', totalPnL >= 0 ? 'text-green-500' : 'text-destructive')}>
                  ${sessions.length > 0 ? (totalPnL / sessions.length).toFixed(2) : '0.00'}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">From</label>
              <Input 
                type="date" 
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">To</label>
              <Input 
                type="date" 
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Mode</label>
              <Select value={filters.mode} onValueChange={(v: any) => setFilters({ ...filters, mode: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modes</SelectItem>
                  <SelectItem value="demo">Demo Only</SelectItem>
                  <SelectItem value="live">Live Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={filters.status} onValueChange={(v: any) => setFilters({ ...filters, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="stopped">Stopped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Exchange</label>
              <Input 
                placeholder="e.g. Binance"
                value={filters.exchange}
                onChange={(e) => setFilters({ ...filters, exchange: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pair</label>
              <Input 
                placeholder="e.g. BTC"
                value={filters.pair}
                onChange={(e) => setFilters({ ...filters, pair: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <ScrollArea className="h-[600px]">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="text-center py-12">
            <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No trading history found for the selected filters.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <Collapsible
                key={session.id}
                open={expandedSessions.has(session.id)}
                onOpenChange={() => toggleSession(session.id)}
              >
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedSessions.has(session.id) ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          )}
                          <Bot className="w-5 h-5 text-primary" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{session.bot_name}</span>
                              <Badge variant={session.is_sandbox ? 'secondary' : 'default'}>
                                {session.is_sandbox ? 'Demo' : 'Live'}
                              </Badge>
                              <Badge variant={session.status === 'running' ? 'default' : 'outline'}>
                                {session.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {session.started_at ? new Date(session.started_at).toLocaleString() : 'Manual trades'}
                              {session.stopped_at && ` → ${new Date(session.stopped_at).toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-right">
                          <div>
                            <p className="text-xs text-muted-foreground">Trades</p>
                            <p className="font-semibold">{session.trades.length}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Hit Rate</p>
                            <p className={cn('font-semibold', session.hit_rate >= 60 ? 'text-green-500' : 'text-orange-500')}>
                              {session.hit_rate.toFixed(1)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">P&L</p>
                            <p className={cn('font-semibold', session.current_pnl >= 0 ? 'text-green-500' : 'text-destructive')}>
                              ${session.current_pnl.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {session.trades.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No trades in this session</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2">Pair</th>
                                <th className="text-left p-2">Direction</th>
                                <th className="text-right p-2">Entry</th>
                                <th className="text-right p-2">Exit</th>
                                <th className="text-right p-2">Amount</th>
                                <th className="text-right p-2">P&L</th>
                                <th className="text-left p-2">Status</th>
                                <th className="text-left p-2">Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.trades.slice(0, 20).map((trade) => (
                                <tr key={trade.id} className="border-t border-border/50 hover:bg-muted/30">
                                  <td className="p-2 font-medium">{trade.pair}</td>
                                  <td className="p-2">
                                    <Badge variant={trade.direction === 'long' ? 'default' : 'secondary'} className="text-xs">
                                      {trade.direction}
                                    </Badge>
                                  </td>
                                  <td className="p-2 text-right font-mono">${trade.entry_price.toFixed(4)}</td>
                                  <td className="p-2 text-right font-mono">{trade.exit_price ? `$${trade.exit_price.toFixed(4)}` : '-'}</td>
                                  <td className="p-2 text-right">{trade.amount.toFixed(4)}</td>
                                  <td className={cn('p-2 text-right font-medium', (trade.profit_loss || 0) >= 0 ? 'text-green-500' : 'text-destructive')}>
                                    {trade.profit_loss !== null ? `$${trade.profit_loss.toFixed(2)}` : '-'}
                                  </td>
                                  <td className="p-2">
                                    <Badge variant={trade.status === 'closed' ? 'outline' : 'default'} className="text-xs">
                                      {trade.status}
                                    </Badge>
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {new Date(trade.created_at).toLocaleTimeString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {session.trades.length > 20 && (
                            <p className="text-center text-xs text-muted-foreground py-2 bg-muted/30">
                              Showing 20 of {session.trades.length} trades
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
