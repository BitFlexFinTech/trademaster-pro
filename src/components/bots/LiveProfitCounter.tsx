import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, TrendingUp, Zap } from 'lucide-react';
import { useEventBus } from '@/hooks/useEventBus';
import { cn } from '@/lib/utils';

export const LiveProfitCounter = () => {
  const [sessionProfit, setSessionProfit] = useState(0);
  const [lastProfit, setLastProfit] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);
  const displayRef = useRef<HTMLSpanElement>(null);

  // Listen for trade closed events
  useEventBus('trade:closed', (data) => {
    if (data.netPnl && data.netPnl > 0) {
      setSessionProfit(prev => prev + data.netPnl);
      setLastProfit(data.netPnl);
      setTradeCount(prev => prev + 1);
      
      // Flash animation
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 600);
    }
  }, []);

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
          <span 
            ref={displayRef}
            className={cn(
              "text-3xl font-bold tabular-nums transition-colors",
              sessionProfit > 0 ? "text-emerald-500" : "text-foreground"
            )}
          >
            {displayValue.toFixed(2)}
          </span>
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
