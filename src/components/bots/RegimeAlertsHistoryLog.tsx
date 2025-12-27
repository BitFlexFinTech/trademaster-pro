import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, TrendingUp, TrendingDown, Minus, Filter, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface RegimeAlert {
  id: string;
  title: string;
  message: string | null;
  alert_type: string;
  data: {
    regime?: string;
    previousRegime?: string;
    deviation?: number;
    confidence?: number;
    price?: number;
    ema200?: number;
  } | null;
  created_at: string;
  is_read: boolean | null;
}

type RegimeFilter = 'all' | 'BULL' | 'BEAR' | 'CHOP';

export function RegimeAlertsHistoryLog() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<RegimeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RegimeFilter>('all');

  const fetchAlerts = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let query = supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('alert_type', 'regime_transition')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await query;

      if (error) throw error;
      setAlerts((data as RegimeAlert[]) || []);
    } catch (err) {
      console.error('Failed to fetch regime alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [user]);

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'all') return true;
    const regime = alert.data?.regime;
    return regime === filter;
  });

  const getRegimeIcon = (regime?: string) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'BEAR': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-amber-500" />;
    }
  };

  const getRegimeBadge = (regime?: string) => {
    const colors = {
      BULL: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
      BEAR: 'bg-red-500/20 text-red-400 border-red-500/50',
      CHOP: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
    };
    return colors[regime as keyof typeof colors] || colors.CHOP;
  };

  // Calculate regime stats
  const stats = {
    total: alerts.length,
    bull: alerts.filter(a => a.data?.regime === 'BULL').length,
    bear: alerts.filter(a => a.data?.regime === 'BEAR').length,
    chop: alerts.filter(a => a.data?.regime === 'CHOP').length,
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Regime Transition History</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as RegimeFilter)}>
              <SelectTrigger className="w-[120px] h-8">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="BULL">🐂 BULL</SelectItem>
                <SelectItem value="BEAR">🐻 BEAR</SelectItem>
                <SelectItem value="CHOP">🌊 CHOP</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={fetchAlerts} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="text-xs">
            Total: {stats.total}
          </Badge>
          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/50">
            🐂 {stats.bull}
          </Badge>
          <Badge variant="outline" className="text-xs text-red-400 border-red-500/50">
            🐻 {stats.bear}
          </Badge>
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/50">
            🌊 {stats.chop}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading alerts...
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No regime transitions recorded yet.
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {filteredAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    alert.is_read 
                      ? "bg-muted/30 border-border/50" 
                      : "bg-muted/50 border-primary/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getRegimeIcon(alert.data?.regime)}
                      <div>
                        <div className="flex items-center gap-2">
                          {alert.data?.previousRegime && (
                            <>
                              <Badge variant="outline" className={cn("text-[10px]", getRegimeBadge(alert.data.previousRegime))}>
                                {alert.data.previousRegime}
                              </Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge variant="outline" className={cn("text-[10px]", getRegimeBadge(alert.data?.regime))}>
                            {alert.data?.regime || 'UNKNOWN'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.message || alert.title}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </span>
                      {alert.data?.confidence && (
                        <div className="text-[10px] text-primary mt-0.5">
                          {alert.data.confidence.toFixed(0)}% confidence
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {(alert.data?.price || alert.data?.deviation) && (
                    <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                      {alert.data.price && (
                        <span>Price: ${alert.data.price.toFixed(2)}</span>
                      )}
                      {alert.data.ema200 && (
                        <span>EMA200: ${alert.data.ema200.toFixed(2)}</span>
                      )}
                      {alert.data.deviation !== undefined && (
                        <span>Deviation: {(alert.data.deviation * 100).toFixed(2)}%</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}