import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plug, RefreshCw, Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { EXCHANGE_COLORS } from '@/lib/chartConfig';
import { formatDistanceToNow } from 'date-fns';

interface ExchangeStatus {
  name: string;
  isConnected: boolean;
  latency: number | null;
  status: 'excellent' | 'good' | 'slow' | 'unreachable' | 'offline';
  color: string;
}

const EXCHANGE_LIST = ['Binance', 'OKX', 'Bybit', 'KuCoin', 'Kraken', 'Nexo'];

export function ExchangeStatusWidget() {
  const { user } = useAuth();
  const [exchanges, setExchanges] = useState<ExchangeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const fetchConnectionStatus = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch connected exchanges from database
      const { data: connections } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected, last_verified_at')
        .eq('user_id', user.id);

      const connectedMap = new Map(
        connections?.map(c => [c.exchange_name, c]) || []
      );

      // Build status for all exchanges
      const statuses: ExchangeStatus[] = EXCHANGE_LIST.map(name => {
        const connection = connectedMap.get(name);
        const isConnected = connection?.is_connected || false;

        return {
          name,
          isConnected,
          latency: null,
          status: isConnected ? 'good' : 'offline',
          color: EXCHANGE_COLORS[name as keyof typeof EXCHANGE_COLORS] || '#666666',
        };
      });

      setExchanges(statuses);
      setLastCheck(new Date());
    } catch (err) {
      console.error('Failed to fetch exchange status:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const pingExchanges = useCallback(async () => {
    if (!user?.id) return;
    
    setRefreshing(true);
    
    try {
      // Call edge function to ping exchanges
      const { data, error } = await supabase.functions.invoke('ping-exchanges');
      
      if (error) throw error;
      
      if (data?.results) {
        setExchanges(prev => prev.map(exchange => {
          const pingResult = data.results[exchange.name];
          if (!pingResult) return exchange;
          
          const latency = pingResult.latency;
          let status: ExchangeStatus['status'] = 'offline';
          
          if (exchange.isConnected) {
            if (latency === null) {
              status = 'unreachable';
            } else if (latency < 50) {
              status = 'excellent';
            } else if (latency < 100) {
              status = 'good';
            } else {
              status = 'slow';
            }
          }
          
          return {
            ...exchange,
            latency: pingResult.latency,
            status,
          };
        }));
      }
      
      setLastCheck(new Date());
    } catch (err) {
      console.error('Failed to ping exchanges:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshing) {
        pingExchanges();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [pingExchanges, refreshing]);

  const connectedCount = exchanges.filter(e => e.isConnected).length;
  const avgLatency = exchanges
    .filter(e => e.latency !== null)
    .reduce((sum, e) => sum + (e.latency || 0), 0) / 
    Math.max(1, exchanges.filter(e => e.latency !== null).length);

  const getStatusIcon = (status: ExchangeStatus['status']) => {
    switch (status) {
      case 'excellent':
      case 'good':
        return <Wifi className="w-3 h-3" />;
      case 'slow':
        return <AlertTriangle className="w-3 h-3" />;
      case 'unreachable':
        return <WifiOff className="w-3 h-3" />;
      default:
        return <WifiOff className="w-3 h-3" />;
    }
  };

  const getStatusColor = (status: ExchangeStatus['status']) => {
    switch (status) {
      case 'excellent':
        return 'text-primary';
      case 'good':
        return 'text-primary/80';
      case 'slow':
        return 'text-warning';
      case 'unreachable':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getLatencyBarWidth = (latency: number | null) => {
    if (latency === null) return '0%';
    // Scale: 0-200ms maps to 0-100%
    return `${Math.min(100, (latency / 200) * 100)}%`;
  };

  const getLatencyBarColor = (status: ExchangeStatus['status'], exchangeColor: string) => {
    if (status === 'offline') return 'bg-muted';
    return ''; // Will use inline style with exchange color
  };

  if (loading) {
    return (
      <Card className="card-glass">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-medium">Exchange Status</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {connectedCount}/{EXCHANGE_LIST.length}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={pingExchanges}
              disabled={refreshing}
            >
              <RefreshCw className={cn('w-3 h-3', refreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {exchanges.map(exchange => (
          <div key={exchange.name} className="flex items-center gap-2">
            {/* Exchange name with color dot */}
            <div className="flex items-center gap-1.5 w-20">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: exchange.color }}
              />
              <span className="text-xs font-medium truncate">{exchange.name}</span>
            </div>

            {/* Latency bar */}
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: exchange.isConnected ? getLatencyBarWidth(exchange.latency) : '0%',
                  backgroundColor: exchange.isConnected ? exchange.color : undefined,
                }}
              />
            </div>

            {/* Latency value */}
            <div className="w-12 text-right">
              {exchange.isConnected && exchange.latency !== null ? (
                <span className="text-xs font-mono">{exchange.latency}ms</span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>

            {/* Status icon */}
            <div className={cn('w-4', getStatusColor(exchange.status))}>
              {getStatusIcon(exchange.status)}
            </div>
          </div>
        ))}

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
          <span>
            Avg: {avgLatency > 0 ? `${Math.round(avgLatency)}ms` : '-'}
          </span>
          <span>
            {lastCheck ? `${formatDistanceToNow(lastCheck, { addSuffix: true })}` : 'Never'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
