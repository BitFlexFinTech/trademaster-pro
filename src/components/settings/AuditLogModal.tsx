import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ArrowUpDown, Bot, Bell, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AuditLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TradeLog {
  id: string;
  pair: string;
  direction: string;
  profit_loss: number;
  exchange_name: string;
  created_at: string;
  is_sandbox: boolean;
}

interface BotLog {
  id: string;
  bot_name: string;
  status: string;
  current_pnl: number;
  trades_executed: number;
  created_at: string;
  started_at: string | null;
  stopped_at: string | null;
}

interface AlertLog {
  id: string;
  title: string;
  message: string | null;
  alert_type: string;
  created_at: string;
  is_read: boolean;
}

export function AuditLogModal({ open, onOpenChange }: AuditLogModalProps) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [bots, setBots] = useState<BotLog[]>([]);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;

    async function fetchLogs() {
      setLoading(true);
      try {
        const [tradesRes, botsRes, alertsRes] = await Promise.all([
          supabase
            .from('trades')
            .select('id, pair, direction, profit_loss, exchange_name, created_at, is_sandbox')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('bot_runs')
            .select('id, bot_name, status, current_pnl, trades_executed, created_at, started_at, stopped_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('alerts')
            .select('id, title, message, alert_type, created_at, is_read')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(30),
        ]);

        setTrades(tradesRes.data || []);
        setBots(botsRes.data || []);
        setAlerts(alertsRes.data || []);
      } catch (err) {
        console.error('Failed to fetch audit logs:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [open, user]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Audit Log
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="trades" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trades" className="gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Trades ({trades.length})
              </TabsTrigger>
              <TabsTrigger value="bots" className="gap-1">
                <Bot className="w-3 h-3" />
                Bots ({bots.length})
              </TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1">
                <Bell className="w-3 h-3" />
                Alerts ({alerts.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trades">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {trades.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No trades yet</p>
                  ) : (
                    trades.map((trade) => (
                      <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div className="flex items-center gap-3">
                          <Badge variant={trade.direction === 'long' ? 'default' : 'destructive'} className="text-xs">
                            {trade.direction.toUpperCase()}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{trade.pair}</p>
                            <p className="text-xs text-muted-foreground">
                              {trade.exchange_name} • {formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-mono ${trade.profit_loss >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {trade.profit_loss >= 0 ? '+' : ''}${trade.profit_loss?.toFixed(2)}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {trade.is_sandbox ? 'DEMO' : 'LIVE'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="bots">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {bots.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No bot runs yet</p>
                  ) : (
                    bots.map((bot) => (
                      <div key={bot.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                        <div>
                          <p className="text-sm font-medium">{bot.bot_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {bot.trades_executed} trades • {formatDistanceToNow(new Date(bot.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={bot.status === 'running' ? 'default' : 'secondary'} className="text-xs mb-1">
                            {bot.status}
                          </Badge>
                          <p className={`text-sm font-mono ${(bot.current_pnl || 0) >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {(bot.current_pnl || 0) >= 0 ? '+' : ''}${(bot.current_pnl || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="alerts">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2 pr-4">
                  {alerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No alerts yet</p>
                  ) : (
                    alerts.map((alert) => (
                      <div key={alert.id} className={`p-3 rounded-lg ${alert.is_read ? 'bg-secondary/20' : 'bg-secondary/40'}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium">{alert.title}</p>
                            {alert.message && (
                              <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-[10px]">{alert.alert_type}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
