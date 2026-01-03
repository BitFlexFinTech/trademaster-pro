import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Wifi, 
  WifiOff, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw,
  XCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

interface OpenPosition {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  amount: number;
  leverage: number;
  createdAt: string;
  targetProfit: number;
}

interface PositionWithPnL extends OpenPosition {
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  progressToTarget: number;
  holdTime: string;
}

export function EnhancedPositionMonitor() {
  const { user } = useAuth();
  const { tickersMap, isConnected, latencyMetrics } = useBinanceWebSocket();
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch open positions from database
  const fetchPositions = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedPositions: OpenPosition[] = (data || []).map(t => ({
        id: t.id,
        pair: t.pair,
        direction: t.direction as 'long' | 'short',
        entryPrice: t.entry_price,
        amount: t.amount,
        leverage: t.leverage || 1,
        createdAt: t.created_at,
        targetProfit: t.target_profit_usd || 1.00,
      }));

      setPositions(mappedPositions);
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPositions();
    
    // Subscribe to real-time position updates
    if (!user?.id) return;
    
    const channel = supabase
      .channel('positions-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchPositions]);

  // Calculate real-time P&L for each position using WebSocket prices
  const positionsWithPnL: PositionWithPnL[] = useMemo(() => {
    return positions.map(pos => {
      // Extract symbol from pair (e.g., "BTC/USDT" -> "BTCUSDT")
      const symbol = pos.pair.replace('/', '').toUpperCase();
      const ticker = tickersMap.get(symbol);
      const currentPrice = ticker?.price || pos.entryPrice;
      
      // Calculate unrealized P&L
      const priceChange = pos.direction === 'long' 
        ? currentPrice - pos.entryPrice 
        : pos.entryPrice - currentPrice;
      const pnlPercent = (priceChange / pos.entryPrice) * 100 * pos.leverage;
      const pnlDollars = (priceChange / pos.entryPrice) * pos.amount * pos.leverage;
      
      // Calculate progress to target
      const progress = Math.min(100, Math.max(0, (pnlDollars / pos.targetProfit) * 100));
      
      return {
        ...pos,
        currentPrice,
        unrealizedPnL: pnlDollars,
        unrealizedPnLPercent: pnlPercent,
        progressToTarget: progress,
        holdTime: formatDistanceToNow(new Date(pos.createdAt), { addSuffix: false }),
      };
    });
  }, [positions, tickersMap]);

  // Calculate total unrealized P&L
  const totalUnrealizedPnL = useMemo(() => {
    return positionsWithPnL.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  }, [positionsWithPnL]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPositions();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <Card className="card-glass">
        <CardContent className="p-4 flex items-center justify-center min-h-[200px]">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-glass">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Live Position Monitor</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection Status */}
          <Badge 
            variant={isConnected ? 'outline' : 'destructive'} 
            className="text-[10px] px-1.5 py-0.5 flex items-center gap-1"
          >
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 text-primary" />
                <span>{Math.round(latencyMetrics.wsAvgLatencyMs)}ms</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </>
            )}
          </Badge>
          
          {/* Total P&L */}
          <Badge 
            variant={totalUnrealizedPnL >= 0 ? 'default' : 'destructive'}
            className="text-xs font-mono"
          >
            {totalUnrealizedPnL >= 0 ? '+' : ''}
            <AnimatedCounter value={totalUnrealizedPnL} decimals={2} prefix="$" />
          </Badge>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-3">
        {positionsWithPnL.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No open positions</p>
            <p className="text-xs mt-1">Positions will appear here when trades are opened</p>
          </div>
        ) : (
          <div className="space-y-2">
            {positionsWithPnL.map(pos => (
              <div 
                key={pos.id}
                className={cn(
                  "p-2.5 rounded-lg border transition-all",
                  pos.unrealizedPnL >= 0 
                    ? "bg-primary/5 border-primary/20" 
                    : "bg-destructive/5 border-destructive/20"
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  {/* Pair and Direction */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{pos.pair}</span>
                    <Badge 
                      variant={pos.direction === 'long' ? 'default' : 'secondary'}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {pos.direction === 'long' ? (
                        <><TrendingUp className="w-2.5 h-2.5 mr-0.5" />LONG</>
                      ) : (
                        <><TrendingDown className="w-2.5 h-2.5 mr-0.5" />SHORT</>
                      )}
                    </Badge>
                    {pos.leverage > 1 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {pos.leverage}x
                      </Badge>
                    )}
                  </div>
                  
                  {/* P&L Display */}
                  <div className={cn(
                    "text-right font-mono text-sm font-semibold",
                    pos.unrealizedPnL >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    <div>
                      {pos.unrealizedPnL >= 0 ? '+' : ''}
                      <AnimatedCounter value={pos.unrealizedPnL} decimals={2} prefix="$" />
                    </div>
                    <div className="text-[10px] font-normal text-muted-foreground">
                      ({pos.unrealizedPnLPercent >= 0 ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
                
                {/* Price Info */}
                <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground mb-2">
                  <div>
                    <span className="block text-foreground/50">Entry</span>
                    <span className="font-mono">${pos.entryPrice.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-foreground/50">Current</span>
                    <span className={cn(
                      "font-mono",
                      pos.unrealizedPnL >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      ${pos.currentPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-foreground/50">Hold Time</span>
                    <span className="flex items-center justify-end gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {pos.holdTime}
                    </span>
                  </div>
                </div>
                
                {/* Progress to Target */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">Target: ${pos.targetProfit.toFixed(2)}</span>
                    <span className={cn(
                      "font-medium",
                      pos.progressToTarget >= 100 ? "text-primary" : "text-foreground"
                    )}>
                      {pos.progressToTarget.toFixed(0)}%
                    </span>
                  </div>
                  <Progress 
                    value={pos.progressToTarget} 
                    className={cn(
                      "h-1.5",
                      pos.progressToTarget >= 80 && "bg-primary/20"
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
