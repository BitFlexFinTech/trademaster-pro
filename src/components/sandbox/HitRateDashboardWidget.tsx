import { useEffect, useState } from 'react';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';

interface HitRateDashboardWidgetProps {
  className?: string;
  targetHitRate?: number;
}

export function HitRateDashboardWidget({ 
  className,
  targetHitRate = 80 
}: HitRateDashboardWidgetProps) {
  const { user } = useAuth();
  const { mode } = useTradingMode();
  const [currentHitRate, setCurrentHitRate] = useState(0);
  const [tradesCount, setTradesCount] = useState(0);
  const [wins, setWins] = useState(0);
  const [isLive, setIsLive] = useState(false);

  const fetchHitRate = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trades')
        .select('profit_loss')
        .eq('user_id', user.id)
        .eq('is_sandbox', mode === 'demo')
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const trades = data || [];
      const winCount = trades.filter(t => (t.profit_loss || 0) > 0).length;
      const hitRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

      setTradesCount(trades.length);
      setWins(winCount);
      setCurrentHitRate(hitRate);
    } catch (err) {
      console.error('Failed to fetch hit rate:', err);
    }
  };

  useEffect(() => {
    fetchHitRate();

    // Subscribe to trade updates
    const channel = supabase
      .channel('hitrate-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades' },
        () => {
          setIsLive(true);
          fetchHitRate();
          setTimeout(() => setIsLive(false), 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, mode]);

  const getStatus = () => {
    if (currentHitRate >= 90) return { label: 'EXCELLENT', color: 'text-primary border-primary bg-primary/10' };
    if (currentHitRate >= 80) return { label: 'ON TARGET', color: 'text-yellow-500 border-yellow-500 bg-yellow-500/10' };
    return { label: 'BELOW TARGET', color: 'text-destructive border-destructive bg-destructive/10' };
  };

  const status = getStatus();
  const gap = currentHitRate - targetHitRate;

  const TrendIcon = gap > 0 ? TrendingUp : gap < -5 ? TrendingDown : Minus;

  return (
    <div className={cn("card-terminal p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground">Hit Rate Monitor</span>
          {isLive && (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <Badge variant="outline" className={cn(status.color)}>
          {status.label}
        </Badge>
      </div>

      {/* Large percentage display */}
      <div className="text-center py-4">
        <span className={cn(
          "text-5xl font-bold font-mono",
          currentHitRate >= 90 ? 'text-primary' :
          currentHitRate >= 80 ? 'text-yellow-500' :
          'text-destructive'
        )}>
          {currentHitRate.toFixed(1)}%
        </span>
        <p className="text-sm text-muted-foreground mt-1">
          Current Hit Rate ({tradesCount} trades)
        </p>
      </div>

      {/* Progress bar with zones */}
      <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
        {/* Zone backgrounds */}
        <div className="absolute inset-0 flex">
          <div className="w-[80%] bg-destructive/20" />
          <div className="w-[10%] bg-yellow-500/20" />
          <div className="w-[10%] bg-primary/20" />
        </div>
        
        {/* Progress fill */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
            currentHitRate >= 90 ? 'bg-primary' :
            currentHitRate >= 80 ? 'bg-yellow-500' :
            'bg-destructive'
          )}
          style={{ width: `${Math.min(currentHitRate, 100)}%` }}
        />
        
        {/* Target marker at 80% */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-foreground/50" 
          style={{ left: '80%' }} 
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Target</p>
          <p className="text-sm font-bold font-mono text-primary">{targetHitRate}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Wins/Total</p>
          <p className="text-sm font-bold font-mono text-foreground">{wins}/{tradesCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Gap</p>
          <div className="flex items-center justify-center gap-1">
            <TrendIcon className={cn(
              "w-3 h-3",
              gap >= 0 ? 'text-primary' : 'text-destructive'
            )} />
            <p className={cn(
              "text-sm font-bold font-mono",
              gap >= 0 ? 'text-primary' : 'text-destructive'
            )}>
              {gap >= 0 ? '+' : ''}{gap.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
