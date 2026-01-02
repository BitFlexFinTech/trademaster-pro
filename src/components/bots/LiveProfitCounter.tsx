import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DollarSign, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { useEventBus } from '@/hooks/useEventBus';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'greenback-session-profit';
const SESSION_DATE_KEY = 'greenback-session-date';

export const LiveProfitCounter = () => {
  const { user } = useAuth();
  const [sessionProfit, setSessionProfit] = useState(0);
  const [lastProfit, setLastProfit] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const displayRef = useRef<HTMLSpanElement>(null);
  const initializedRef = useRef(false);

  // Load initial session profit from database and localStorage
  const loadInitialProfit = useCallback(async () => {
    if (!user?.id || initializedRef.current) return;
    initializedRef.current = true;

    const today = new Date().toISOString().split('T')[0];
    const storedDate = localStorage.getItem(SESSION_DATE_KEY);

    // Reset if new day
    if (storedDate !== today) {
      localStorage.setItem(SESSION_DATE_KEY, today);
      localStorage.setItem(STORAGE_KEY, '0');
    }

    try {
      // Fetch today's closed trades from database
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: closedTrades, error } = await supabase
        .from('trades')
        .select('profit_loss')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', startOfDay.toISOString());

      if (!error && closedTrades) {
        const dbTotal = closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0);
        const localProfit = parseFloat(localStorage.getItem(STORAGE_KEY) || '0');
        
        // Use the higher value (DB is source of truth, but local might have more recent trades)
        const totalProfit = Math.max(dbTotal, localProfit);
        setSessionProfit(totalProfit);
        setTradeCount(closedTrades.length);
        localStorage.setItem(STORAGE_KEY, totalProfit.toString());
        
        console.log(`[LiveProfitCounter] Loaded: DB=$${dbTotal.toFixed(2)}, Local=$${localProfit.toFixed(2)}, Using=$${totalProfit.toFixed(2)}`);
      }
    } catch (e) {
      console.error('[LiveProfitCounter] Failed to load initial profit:', e);
      // Fallback to localStorage
      const localProfit = parseFloat(localStorage.getItem(STORAGE_KEY) || '0');
      setSessionProfit(localProfit);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load on mount
  useEffect(() => {
    loadInitialProfit();
  }, [loadInitialProfit]);

  // Listen for trade closed events from eventBus
  useEventBus('trade:closed', (data) => {
    if (data.netPnl && data.netPnl > 0) {
      setSessionProfit(prev => {
        const newTotal = prev + data.netPnl;
        localStorage.setItem(STORAGE_KEY, newTotal.toString());
        return newTotal;
      });
      setLastProfit(data.netPnl);
      setTradeCount(prev => prev + 1);
      
      // Flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 600);
    }
  }, []);

  // Subscribe to Supabase realtime for trade updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('profit-counter-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        const oldTrade = payload.old as any;
        
        // Trade just closed
        if (trade.status === 'closed' && oldTrade.status === 'open' && trade.profit_loss > 0) {
          console.log(`[LiveProfitCounter] Realtime: Trade closed with profit $${trade.profit_loss}`);
          setSessionProfit(prev => {
            const newTotal = prev + trade.profit_loss;
            localStorage.setItem(STORAGE_KEY, newTotal.toString());
            return newTotal;
          });
          setLastProfit(trade.profit_loss);
          setTradeCount(prev => prev + 1);
          
          setIsFlashing(true);
          setTimeout(() => setIsFlashing(false), 600);
        }
      })
      .on('broadcast', { event: 'trade_closed' }, (payload) => {
        const data = payload.payload as any;
        if (data?.netPnl && data.netPnl > 0) {
          console.log(`[LiveProfitCounter] Broadcast: Trade closed with profit $${data.netPnl}`);
          setSessionProfit(prev => {
            const newTotal = prev + data.netPnl;
            localStorage.setItem(STORAGE_KEY, newTotal.toString());
            return newTotal;
          });
          setLastProfit(data.netPnl);
          setTradeCount(prev => prev + 1);
          
          setIsFlashing(true);
          setTimeout(() => setIsFlashing(false), 600);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Animate the counter
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    if (displayValue === sessionProfit) return;
    
    const diff = sessionProfit - displayValue;
    const step = diff / 20;
    let current = displayValue;
    
    const animate = () => {
      current += step;
      if ((step > 0 && current >= sessionProfit) || (step < 0 && current <= sessionProfit)) {
        setDisplayValue(sessionProfit);
      } else {
        setDisplayValue(current);
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [sessionProfit]);

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300",
      isFlashing && "ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20"
    )}>
      {/* Flash overlay */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 transition-opacity duration-300",
        isFlashing ? "opacity-100" : "opacity-0"
      )} />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Zap className="h-4 w-4 text-yellow-500" />
            <span>Session Profit</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>{tradeCount} trades</span>
          </div>
        </div>
        
        <div className="flex items-baseline gap-1">
          <DollarSign className={cn(
            "h-6 w-6 transition-colors",
            sessionProfit > 0 ? "text-emerald-500" : "text-muted-foreground"
          )} />
          {isLoading ? (
            <span className="text-3xl font-bold tabular-nums text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </span>
          ) : (
            <span 
              ref={displayRef}
              className={cn(
                "text-3xl font-bold tabular-nums transition-colors",
                sessionProfit > 0 ? "text-emerald-500" : "text-foreground"
              )}
            >
              {displayValue.toFixed(2)}
            </span>
          )}
        </div>
        
        {/* Last profit indicator */}
        {lastProfit !== null && (
          <div className={cn(
            "mt-2 flex items-center gap-1 text-sm transition-all duration-500",
            isFlashing ? "text-emerald-400 scale-105" : "text-muted-foreground scale-100"
          )}>
            <span>Last: +${lastProfit.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
