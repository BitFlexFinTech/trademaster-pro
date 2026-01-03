import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Banknote, RefreshCw, Check, X, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ExtractionLog {
  id: string;
  created_at: string;
  action: string;
  symbol: string;
  exchange: string;
  net_pnl: number | null;
  success: boolean | null;
  error_message: string | null;
}

export function ProfitExtractionHistoryLog({ className }: { className?: string }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ExtractionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!user?.id) return;
    
    const { data, error } = await supabase
      .from('profit_audit_log')
      .select('id, created_at, action, symbol, exchange, net_pnl, success, error_message')
      .eq('user_id', user.id)
      .eq('action', 'PROFIT_EXTRACTION')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const totalExtracted = logs
    .filter(l => l.success)
    .reduce((sum, l) => sum + (l.net_pnl || 0), 0);

  const successCount = logs.filter(l => l.success).length;

  if (loading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" />
            Profit Extraction History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono text-emerald-500">
              ${totalExtracted.toFixed(2)} locked
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {logs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Banknote className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No profit extractions yet</p>
            <p className="text-xs mt-1">Enable "Lock Profits" to auto-transfer profits to funding wallet</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
              <span>{logs.length} extractions</span>
              <span>{successCount} successful</span>
            </div>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border text-xs",
                      log.success
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : "bg-destructive/5 border-destructive/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {log.success ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <X className="h-3 w-3 text-destructive" />
                      )}
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-medium capitalize">{log.exchange}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Funding</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "font-mono font-bold",
                        log.success ? "text-emerald-500" : "text-destructive"
                      )}>
                        {log.success ? '+' : ''}${(log.net_pnl || 0).toFixed(2)}
                      </div>
                      {log.error_message && (
                        <div className="text-[10px] text-destructive truncate max-w-[120px]">
                          {log.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
