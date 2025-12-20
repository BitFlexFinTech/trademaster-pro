import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Activity, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  DollarSign,
  Zap,
  AlertTriangle,
  Play,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface AuditLog {
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
  lot_size_used: string | null;
  quantity_sent: string | null;
  success: boolean;
  error_message: string | null;
  credential_found: boolean | null;
  oco_status: string | null;
  balance_available: number | null;
}

interface ProfitEngineStatus {
  credentialFound: boolean;
  lastPricePoll: { time: string; price: number; symbol: string } | null;
  lastOCOStatus: { status: string; time: string } | null;
  lastSellAttempt: { time: string; success: boolean; error?: string; pnl?: number } | null;
}

export function ProfitEnginePanel() {
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<ProfitEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(30);
  const [triggering, setTriggering] = useState(false);

  const fetchAuditLogs = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profit_audit_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error('Failed to fetch audit logs:', error);
      return;
    }
    
    // Type assertion for the data
    const logs = (data || []) as AuditLog[];
    setAuditLogs(logs);
    
    // Derive status from most recent logs
    if (logs.length > 0) {
      const latestWithCredential = logs.find(l => l.credential_found !== null);
      const latestWithPrice = logs.find(l => l.current_price !== null);
      const latestWithOCO = logs.find(l => l.oco_status !== null);
      const latestSellAttempt = logs.find(l => l.action === 'profit_take' || l.action === 'stale_close' || l.action === 'manual_close');
      
      setStatus({
        credentialFound: latestWithCredential?.credential_found ?? false,
        lastPricePoll: latestWithPrice ? {
          time: latestWithPrice.created_at,
          price: latestWithPrice.current_price!,
          symbol: latestWithPrice.symbol
        } : null,
        lastOCOStatus: latestWithOCO ? {
          status: latestWithOCO.oco_status!,
          time: latestWithOCO.created_at
        } : null,
        lastSellAttempt: latestSellAttempt ? {
          time: latestSellAttempt.created_at,
          success: latestSellAttempt.success,
          error: latestSellAttempt.error_message || undefined,
          pnl: latestSellAttempt.net_pnl || undefined
        } : null
      });
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchAuditLogs();
    
    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      fetchAuditLogs();
      setRefreshCountdown(30);
    }, 30000);
    
    // Countdown timer
    const countdownInterval = setInterval(() => {
      setRefreshCountdown(prev => prev > 0 ? prev - 1 : 30);
    }, 1000);
    
    // Subscribe to realtime updates for immediate feedback
    const channel = supabase
      .channel('profit-audit-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profit_audit_log',
          filter: `user_id=eq.${user?.id}`,
        },
        () => {
          fetchAuditLogs();
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshCountdown(30);
    await fetchAuditLogs();
    setRefreshing(false);
  };

  const handleTriggerCheck = async () => {
    if (!user) return;
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: { userId: user.id }
      });
      if (error) {
        toast.error('Status check failed: ' + error.message);
      } else {
        const closedCount = data?.closedCount || 0;
        const profitsTaken = data?.profitsTaken || 0;
        toast.success(`Check complete: ${closedCount} closed, ${profitsTaken} profits taken`);
        await fetchAuditLogs();
        setRefreshCountdown(30);
      }
    } catch (e: any) {
      toast.error('Failed to trigger status check: ' + (e.message || 'Unknown error'));
    } finally {
      setTriggering(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'profit_take':
        return <Badge className="bg-primary/20 text-primary text-[8px]">Profit Take</Badge>;
      case 'stale_close':
        return <Badge className="bg-warning/20 text-warning text-[8px]">Stale Close</Badge>;
      case 'manual_close':
        return <Badge className="bg-secondary text-secondary-foreground text-[8px]">Manual</Badge>;
      case 'oco_check':
        return <Badge variant="outline" className="text-[8px]">OCO Check</Badge>;
      case 'diagnose':
        return <Badge variant="outline" className="text-[8px] border-primary text-primary">Diagnose</Badge>;
      default:
        return <Badge variant="outline" className="text-[8px]">{action}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Profit Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-secondary/30 transition-colors">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Profit Engine Status
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTriggerCheck();
                  }}
                  disabled={triggering}
                >
                  {triggering ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Play className="w-3 h-3 mr-1" />
                  )}
                  Check Now
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefresh();
                    }}
                  >
                    <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
                  </Button>
                  <Badge variant="outline" className="text-[9px] px-1 h-5">
                    {refreshCountdown}s
                  </Badge>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Status Indicators */}
            <div className="grid grid-cols-2 gap-2">
              {/* Credential Match */}
              <div className="bg-secondary/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  {status?.credentialFound ? (
                    <CheckCircle className="w-3 h-3 text-primary" />
                  ) : (
                    <XCircle className="w-3 h-3 text-destructive" />
                  )}
                  <span className="text-[10px] text-muted-foreground">Credentials</span>
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  status?.credentialFound ? "text-primary" : "text-destructive"
                )}>
                  {status?.credentialFound ? "Connected" : "Not Found"}
                </span>
              </div>
              
              {/* Last Price Poll */}
              <div className="bg-secondary/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground">Last Price</span>
                </div>
                {status?.lastPricePoll ? (
                  <div>
                    <span className="text-xs font-medium text-foreground">
                      ${status.lastPricePoll.price.toFixed(2)}
                    </span>
                    <span className="text-[8px] text-muted-foreground ml-1">
                      {status.lastPricePoll.symbol}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>
              
              {/* Last OCO Status */}
              <div className="bg-secondary/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground">OCO Status</span>
                </div>
                {status?.lastOCOStatus ? (
                  <Badge variant="outline" className="text-[9px]">
                    {status.lastOCOStatus.status}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>
              
              {/* Last Sell Attempt */}
              <div className="bg-secondary/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="w-3 h-3 text-primary" />
                  <span className="text-[10px] text-muted-foreground">Last Sell</span>
                </div>
                {status?.lastSellAttempt ? (
                  <div className="flex items-center gap-1">
                    {status.lastSellAttempt.success ? (
                      <CheckCircle className="w-3 h-3 text-primary" />
                    ) : (
                      <XCircle className="w-3 h-3 text-destructive" />
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      status.lastSellAttempt.success ? "text-primary" : "text-destructive"
                    )}>
                      {status.lastSellAttempt.success 
                        ? `+$${status.lastSellAttempt.pnl?.toFixed(2) || '0.00'}`
                        : "Failed"
                      }
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>
            </div>
            
            {/* Audit Log Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-foreground">Recent Audit Log</span>
                <Badge variant="secondary" className="text-[8px]">{auditLogs.length} entries</Badge>
              </div>
              
              {auditLogs.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No audit entries yet. Profit engine will log attempts here.
                </div>
              ) : (
                <ScrollArea className="h-48">
                  <div className="space-y-1.5">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className={cn(
                          "bg-secondary/20 rounded p-2 text-[10px] border",
                          log.success ? "border-primary/20" : "border-destructive/20"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {log.success ? (
                              <CheckCircle className="w-3 h-3 text-primary" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 text-destructive" />
                            )}
                            <span className="font-medium">{log.symbol}</span>
                            {getActionBadge(log.action)}
                          </div>
                          <span className="text-muted-foreground">
                            {format(new Date(log.created_at), 'HH:mm:ss')}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2 text-muted-foreground">
                          <div>
                            <span className="block text-[8px]">Entry</span>
                            <span className="text-foreground font-mono">
                              ${log.entry_price?.toFixed(2) || '--'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[8px]">Current</span>
                            <span className="text-foreground font-mono">
                              ${log.current_price?.toFixed(2) || '--'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[8px]">Qty Sent</span>
                            <span className="text-foreground font-mono">
                              {log.quantity_sent || '--'}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[8px]">Net P&L</span>
                            <span className={cn(
                              "font-mono font-medium",
                              (log.net_pnl || 0) >= 0 ? "text-primary" : "text-destructive"
                            )}>
                              {log.net_pnl !== null ? `$${log.net_pnl.toFixed(3)}` : '--'}
                            </span>
                          </div>
                        </div>
                        
                        {log.error_message && (
                          <div className="mt-1 text-destructive text-[9px]">
                            Error: {log.error_message}
                          </div>
                        )}
                        
                        {log.lot_size_used && (
                          <div className="mt-1 text-muted-foreground text-[8px]">
                            Lot size: {log.lot_size_used}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
