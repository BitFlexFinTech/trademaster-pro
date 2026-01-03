import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle, XCircle, Clock, RotateCcw, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ErrorRecoveryEntry {
  id: string;
  error_type: string;
  error_message: string;
  exchange: string;
  symbol: string;
  attempt_number: number;
  max_attempts: number;
  backoff_ms: number;
  status: string;
  resolution: string | null;
  created_at: string;
  original_request: any;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  retrying: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  success: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
  abandoned: { icon: AlertTriangle, color: 'text-muted-foreground', bg: 'bg-muted' },
};

export function ErrorRecoveryLog({ className }: { className?: string }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ErrorRecoveryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchEntries = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trade_error_recovery')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Failed to fetch error recovery logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();

    // Subscribe to realtime updates
    if (!user) return;

    const channel = supabase
      .channel('error-recovery-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_error_recovery',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleManualRetry = async (entry: ErrorRecoveryEntry) => {
    setRetryingId(entry.id);
    
    try {
      // Update status to retrying
      await supabase
        .from('trade_error_recovery')
        .update({ 
          status: 'retrying',
          attempt_number: entry.attempt_number + 1 
        })
        .eq('id', entry.id);

      // Trigger the trade execution again via edge function
      const { error } = await supabase.functions.invoke('execute-bot-trade', {
        body: { 
          ...entry.original_request,
          retryFromRecovery: true,
          recoveryId: entry.id 
        }
      });

      if (error) throw error;
      
      toast.success('Retry initiated', { description: `Retrying ${entry.symbol} on ${entry.exchange}` });
      fetchEntries();
    } catch (err) {
      console.error('Manual retry failed:', err);
      toast.error('Retry failed', { description: 'Could not initiate retry' });
      
      // Mark as failed
      await supabase
        .from('trade_error_recovery')
        .update({ status: 'failed', resolution: 'manual_retry_failed' })
        .eq('id', entry.id);
    } finally {
      setRetryingId(null);
    }
  };

  const pendingCount = entries.filter(e => e.status === 'pending' || e.status === 'retrying').length;
  const failedCount = entries.filter(e => e.status === 'failed').length;
  const successCount = entries.filter(e => e.status === 'success').length;

  return (
    <Card className={cn('card-terminal', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" />
            Error Recovery Log
          </CardTitle>
          <div className="flex gap-1">
            {pendingCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                {pendingCount} pending
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                {failedCount} failed
              </Badge>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="text-center p-1.5 bg-muted/30 rounded">
            <span className="text-[10px] text-muted-foreground block">Total</span>
            <span className="text-sm font-mono">{entries.length}</span>
          </div>
          <div className="text-center p-1.5 bg-emerald-500/10 rounded">
            <span className="text-[10px] text-muted-foreground block">Recovered</span>
            <span className="text-sm font-mono text-emerald-400">{successCount}</span>
          </div>
          <div className="text-center p-1.5 bg-amber-500/10 rounded">
            <span className="text-[10px] text-muted-foreground block">Retrying</span>
            <span className="text-sm font-mono text-amber-400">{pendingCount}</span>
          </div>
          <div className="text-center p-1.5 bg-red-500/10 rounded">
            <span className="text-[10px] text-muted-foreground block">Failed</span>
            <span className="text-sm font-mono text-red-400">{failedCount}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
            <div className="text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No errors to recover</p>
              <p className="text-[10px] mt-1">All trades executing normally</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[250px]">
            <div className="space-y-1.5 pr-2">
              {entries.map((entry) => {
                const config = STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                const StatusIcon = config.icon;
                
                return (
                  <Collapsible
                    key={entry.id}
                    open={expandedId === entry.id}
                    onOpenChange={(open) => setExpandedId(open ? entry.id : null)}
                  >
                    <div className={cn(
                      'rounded-lg border overflow-hidden',
                      entry.status === 'failed' && 'border-red-500/30'
                    )}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full p-2 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors">
                          <div className={cn('p-1 rounded', config.bg)}>
                            <StatusIcon className={cn('w-3 h-3', config.color)} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono truncate">{entry.symbol}</span>
                              <Badge variant="outline" className="text-[9px] h-4">
                                {entry.exchange}
                              </Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {entry.error_type} • Attempt {entry.attempt_number}/{entry.max_attempts}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(entry.created_at).toLocaleTimeString()}
                            </span>
                            <ChevronDown className={cn(
                              'w-4 h-4 transition-transform',
                              expandedId === entry.id && 'rotate-180'
                            )} />
                          </div>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="px-2 pb-2 pt-1 border-t bg-muted/10 space-y-2">
                          <div className="text-[10px]">
                            <span className="text-muted-foreground">Error: </span>
                            <span className="text-red-400">{entry.error_message}</span>
                          </div>
                          
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">
                              Backoff: {entry.backoff_ms}ms
                            </span>
                            {entry.resolution && (
                              <span className="text-muted-foreground">
                                Resolution: {entry.resolution}
                              </span>
                            )}
                          </div>

                          {entry.status === 'failed' && entry.attempt_number < entry.max_attempts && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-[10px]"
                              onClick={() => handleManualRetry(entry)}
                              disabled={retryingId === entry.id}
                            >
                              {retryingId === entry.id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  Retrying...
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Manual Retry
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
