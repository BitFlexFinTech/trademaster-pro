import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  Pause, 
  Play, 
  RefreshCw, 
  RotateCcw, 
  XCircle,
  CheckCircle,
  Timer,
  TrendingDown,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PairStatus {
  pair: string;
  status: 'active' | 'cooldown' | 'blocked' | 'ready';
  reason?: string;
  consecutiveLosses?: number;
  cooldownEndsAt?: Date;
  lastTradeAt?: Date;
  direction?: 'long' | 'short';
}

interface TradeExecutionStatusProps {
  isRunning?: boolean;
  className?: string;
}

const COOLDOWN_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const CONSECUTIVE_LOSS_THRESHOLD = 5;

export function TradeExecutionStatus({ isRunning = false, className }: TradeExecutionStatusProps) {
  const { user } = useAuth();
  const [pairStatuses, setPairStatuses] = useState<PairStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update time every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch pair statuses from trades table
  const fetchPairStatuses = useCallback(async () => {
    if (!user) return;

    try {
      // Get recent trades to analyze pair statuses
      const { data: trades, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const statuses: PairStatus[] = [];
      const pairMap: Map<string, { trades: typeof trades; lastTrade: any }> = new Map();

      // Group trades by pair
      trades?.forEach(trade => {
        const key = trade.pair;
        if (!pairMap.has(key)) {
          pairMap.set(key, { trades: [], lastTrade: trade });
        }
        pairMap.get(key)!.trades.push(trade);
        if (new Date(trade.closed_at!) > new Date(pairMap.get(key)!.lastTrade.closed_at!)) {
          pairMap.get(key)!.lastTrade = trade;
        }
      });

      // Analyze each pair
      pairMap.forEach((data, pair) => {
        const { trades: pairTrades, lastTrade } = data;
        
        // Count consecutive losses from most recent trades
        let consecutiveLosses = 0;
        for (const trade of pairTrades) {
          if ((trade.profit_loss ?? 0) < 0) {
            consecutiveLosses++;
          } else {
            break;
          }
        }

        // Check cooldown (10 minutes since last trade)
        const lastTradeTime = lastTrade?.closed_at ? new Date(lastTrade.closed_at) : null;
        const cooldownEndsAt = lastTradeTime ? new Date(lastTradeTime.getTime() + COOLDOWN_DURATION_MS) : null;
        const isOnCooldown = cooldownEndsAt && cooldownEndsAt.getTime() > now;
        const isBlocked = consecutiveLosses >= CONSECUTIVE_LOSS_THRESHOLD;

        let status: PairStatus['status'] = 'ready';
        let reason: string | undefined;

        if (isBlocked) {
          status = 'blocked';
          reason = `${consecutiveLosses} consecutive losses`;
        } else if (isOnCooldown) {
          status = 'cooldown';
          reason = 'Recent trade cooldown';
        } else if (isRunning) {
          status = 'active';
        }

        statuses.push({
          pair,
          status,
          reason,
          consecutiveLosses,
          cooldownEndsAt: cooldownEndsAt || undefined,
          lastTradeAt: lastTradeTime || undefined,
          direction: lastTrade?.direction as 'long' | 'short' | undefined,
        });
      });

      // Sort: blocked first, then cooldown, then ready
      statuses.sort((a, b) => {
        const order = { blocked: 0, cooldown: 1, active: 2, ready: 3 };
        return order[a.status] - order[b.status];
      });

      setPairStatuses(statuses);
    } catch (error) {
      console.error('Error fetching pair statuses:', error);
    } finally {
      setLoading(false);
    }
  }, [user, now, isRunning]);

  useEffect(() => {
    fetchPairStatuses();
    const interval = setInterval(fetchPairStatuses, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchPairStatuses]);

  // Clear consecutive losses by inserting a small winning trade marker
  const handleClearConsecutiveLosses = async () => {
    if (!user) return;

    setClearing(true);
    try {
      const blockedPairs = pairStatuses.filter(p => p.status === 'blocked');
      
      if (blockedPairs.length === 0) {
        toast.info('No blocked pairs to clear');
        setClearing(false);
        return;
      }

      // Insert a "reset" trade for each blocked pair with $0.01 profit to break the streak
      const resetTrades = blockedPairs.map(pair => ({
        user_id: user.id,
        pair: pair.pair,
        direction: 'long',
        entry_price: 1,
        exit_price: 1.001,
        amount: 1,
        profit_loss: 0.01,
        profit_percentage: 0.1,
        status: 'closed',
        closed_at: new Date().toISOString(),
        is_sandbox: true, // Mark as sandbox to not affect real metrics
        exchange_name: 'System',
      }));

      const { error } = await supabase
        .from('trades')
        .insert(resetTrades);

      if (error) throw error;

      toast.success(`Cleared ${blockedPairs.length} blocked pair(s)`, {
        description: `${blockedPairs.map(p => p.pair).join(', ')} can now trade again`,
      });

      // Refresh statuses
      await fetchPairStatuses();
    } catch (error) {
      console.error('Error clearing consecutive losses:', error);
      toast.error('Failed to clear consecutive losses');
    } finally {
      setClearing(false);
    }
  };

  const getStatusColor = (status: PairStatus['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'cooldown': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'blocked': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'ready': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    }
  };

  const getStatusIcon = (status: PairStatus['status']) => {
    switch (status) {
      case 'active': return <Play className="w-3 h-3" />;
      case 'cooldown': return <Clock className="w-3 h-3" />;
      case 'blocked': return <XCircle className="w-3 h-3" />;
      case 'ready': return <CheckCircle className="w-3 h-3" />;
    }
  };

  const formatCountdown = (endsAt: Date) => {
    const remaining = Math.max(0, endsAt.getTime() - now);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const blockedCount = pairStatuses.filter(p => p.status === 'blocked').length;
  const cooldownCount = pairStatuses.filter(p => p.status === 'cooldown').length;
  const readyCount = pairStatuses.filter(p => p.status === 'ready' || p.status === 'active').length;

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Trade Execution Status
          </CardTitle>
          <div className="flex items-center gap-2">
            {blockedCount > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs gap-1"
                onClick={handleClearConsecutiveLosses}
                disabled={clearing}
              >
                {clearing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
                Clear {blockedCount} Blocked
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={fetchPairStatuses}
              disabled={loading}
            >
              <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-red-500/10 rounded p-2 text-center border border-red-500/20">
            <div className="text-lg font-bold text-red-400">{blockedCount}</div>
            <div className="text-[9px] text-muted-foreground">Blocked</div>
          </div>
          <div className="bg-yellow-500/10 rounded p-2 text-center border border-yellow-500/20">
            <div className="text-lg font-bold text-yellow-400">{cooldownCount}</div>
            <div className="text-[9px] text-muted-foreground">Cooldown</div>
          </div>
          <div className="bg-green-500/10 rounded p-2 text-center border border-green-500/20">
            <div className="text-lg font-bold text-green-400">{readyCount}</div>
            <div className="text-[9px] text-muted-foreground">Ready</div>
          </div>
        </div>

        {/* Pair List */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : pairStatuses.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No trading pairs with recent activity
          </div>
        ) : (
          <ScrollArea className="h-[180px]">
            <div className="space-y-1.5">
              {pairStatuses.map((pair) => (
                <div
                  key={pair.pair}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border transition-all",
                    pair.status === 'blocked' && "bg-red-500/5 border-red-500/30",
                    pair.status === 'cooldown' && "bg-yellow-500/5 border-yellow-500/30",
                    pair.status === 'active' && "bg-green-500/5 border-green-500/30",
                    pair.status === 'ready' && "bg-secondary/30 border-border/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[9px] h-5 gap-1", getStatusColor(pair.status))}>
                      {getStatusIcon(pair.status)}
                      {pair.status.toUpperCase()}
                    </Badge>
                    <span className="text-sm font-medium">{pair.pair}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {pair.status === 'blocked' && pair.consecutiveLosses && (
                      <div className="flex items-center gap-1 text-red-400">
                        <TrendingDown className="w-3 h-3" />
                        <span>{pair.consecutiveLosses} losses</span>
                      </div>
                    )}
                    
                    {pair.status === 'cooldown' && pair.cooldownEndsAt && (
                      <div className="flex items-center gap-1 text-yellow-400 font-mono">
                        <Timer className="w-3 h-3" />
                        <span>{formatCountdown(pair.cooldownEndsAt)}</span>
                      </div>
                    )}
                    
                    {pair.lastTradeAt && pair.status !== 'cooldown' && (
                      <span className="text-[10px]">
                        Last: {new Date(pair.lastTradeAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Info Footer */}
        <div className="mt-2 pt-2 border-t border-border/50 text-[9px] text-muted-foreground flex items-center justify-between">
          <span>Pairs blocked after {CONSECUTIVE_LOSS_THRESHOLD}+ consecutive losses</span>
          <span>Cooldown: 10 min between trades</span>
        </div>
      </CardContent>
    </Card>
  );
}
