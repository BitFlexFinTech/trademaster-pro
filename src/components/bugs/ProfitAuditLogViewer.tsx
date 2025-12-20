import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, CheckCircle, XCircle, DollarSign, TrendingUp, TrendingDown, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  created_at: string;
  action: string;
  symbol: string;
  exchange: string;
  entry_price: number | null;
  current_price: number | null;
  quantity: number | null;
  gross_pnl: number | null;
  fees: number | null;
  net_pnl: number | null;
  success: boolean | null;
  error_message: string | null;
  trade_id: string | null;
}

interface AuditStats {
  totalLogs: number;
  successCount: number;
  failedCount: number;
  totalNetPnL: number;
  successRate: number;
  actionBreakdown: Record<string, number>;
}

export function ProfitAuditLogViewer() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [stats, setStats] = useState<AuditStats>({
    totalLogs: 0,
    successCount: 0,
    failedCount: 0,
    totalNetPnL: 0,
    successRate: 0,
    actionBreakdown: {},
  });

  const fetchAuditLogs = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profit_audit_log')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      if (data) {
        setLogs(data);

        // Calculate stats
        const successCount = data.filter(l => l.success === true).length;
        const failedCount = data.filter(l => l.success === false).length;
        const totalNetPnL = data.reduce((sum, l) => sum + (l.net_pnl || 0), 0);
        
        const actionBreakdown: Record<string, number> = {};
        data.forEach(log => {
          actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
        });

        setStats({
          totalLogs: data.length,
          successCount,
          failedCount,
          totalNetPnL,
          successRate: data.length > 0 ? (successCount / data.length) * 100 : 0,
          actionBreakdown,
        });
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [user]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'success' && log.success !== true) return false;
    if (filter === 'failed' && log.success !== false) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    return true;
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'profit_take_success':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'profit_take':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'reconciliation_close':
      case 'daily_reconciliation_close':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'dust_close':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'auto_close_zero_balance':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  return (
    <Card className="border-purple-500/30 bg-purple-500/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-400" />
            Profit Audit Log
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchAuditLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card rounded-lg p-3 border">
            <div className="text-sm text-muted-foreground">Total Logs</div>
            <div className="text-xl font-bold">{stats.totalLogs}</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/30">
            <div className="text-sm text-green-400">Successful</div>
            <div className="text-xl font-bold text-green-400">{stats.successCount}</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
            <div className="text-sm text-red-400">Failed</div>
            <div className="text-xl font-bold text-red-400">{stats.failedCount}</div>
          </div>
          <div className="bg-card rounded-lg p-3 border">
            <div className="text-sm text-muted-foreground">Success Rate</div>
            <div className="text-xl font-bold">{stats.successRate.toFixed(1)}%</div>
          </div>
          <div className={`rounded-lg p-3 border ${stats.totalNetPnL >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="text-sm text-muted-foreground">Total Net P&L</div>
            <div className={`text-xl font-bold ${stats.totalNetPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${stats.totalNetPnL.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Action Breakdown */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.actionBreakdown).map(([action, count]) => (
            <Badge key={action} variant="outline" className={getActionColor(action)}>
              {action}: {count}
            </Badge>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map(action => (
                <SelectItem key={action} value={action}>{action}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            Showing {filteredLogs.length} of {logs.length} logs
          </span>
        </div>

        {/* Log Entries */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Loading audit logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No audit logs match the current filter
              </div>
            ) : (
              filteredLogs.map(log => (
                <div
                  key={log.id}
                  className={`rounded-lg p-3 border text-sm ${
                    log.success === true
                      ? 'bg-green-500/5 border-green-500/20'
                      : log.success === false
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {log.success === true ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : log.success === false ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : null}
                      <Badge variant="outline" className={getActionColor(log.action)}>
                        {log.action}
                      </Badge>
                      <span className="font-medium">{log.symbol}</span>
                      <span className="text-muted-foreground">on {log.exchange}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {log.entry_price && (
                      <div>
                        <span className="text-muted-foreground">Entry:</span> ${log.entry_price.toFixed(4)}
                      </div>
                    )}
                    {log.current_price && (
                      <div>
                        <span className="text-muted-foreground">Current:</span> ${log.current_price.toFixed(4)}
                      </div>
                    )}
                    {log.quantity && (
                      <div>
                        <span className="text-muted-foreground">Qty:</span> {log.quantity.toFixed(6)}
                      </div>
                    )}
                    {log.net_pnl !== null && (
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Net P&L:</span>
                        <span className={log.net_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {log.net_pnl >= 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                          ${log.net_pnl.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>

                  {log.error_message && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                      <span className="text-muted-foreground">Message:</span> {log.error_message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
