import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Activity, TrendingUp, TrendingDown, Target, Clock, X, Loader2, 
  Wifi, WifiOff, Radio, CheckCircle2, XCircle, Zap 
} from 'lucide-react';
import { useTradingData } from '@/contexts/TradingDataContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UnifiedTradingDashboardProps {
  className?: string;
}

export function UnifiedTradingDashboard({ className }: UnifiedTradingDashboardProps) {
  const { 
    openPositions, 
    recentTrades, 
    metrics, 
    isConnected,
    monitoringMode,
    setMonitoringMode,
    wsLatency,
    pollingLatency,
    isLoading,
  } = useTradingData();
  
  
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null);

  const handleManualClose = async (tradeId: string, pair: string) => {
    setClosingTradeId(tradeId);
    try {
      const { error } = await supabase.functions.invoke('check-trade-status', {
        body: { forceCloseTradeId: tradeId }
      });
      if (error) throw error;
      toast.success(`Closed ${pair} position`);
    } catch (e) {
      toast.error('Failed to close position');
    } finally {
      setClosingTradeId(null);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardContent className="py-8 text-center">
          <Activity className="h-6 w-6 mx-auto mb-2 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading trading data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("card-terminal overflow-hidden", className)}>
      <CardHeader className="py-2 px-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Trading Dashboard
            <Badge variant="outline" className="text-[9px] h-4 gap-1">
              {openPositions.length} open
            </Badge>
          </CardTitle>
          
          <div className="flex items-center gap-3">
            {/* WS/Polling Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground">
                {monitoringMode === 'websocket' ? 'WS' : 'Poll'}
              </span>
              <Switch
                checked={monitoringMode === 'websocket'}
                onCheckedChange={(checked) => setMonitoringMode(checked ? 'websocket' : 'polling')}
                className="h-4 w-7"
              />
              <Badge variant="secondary" className="text-[8px] h-4 px-1 font-mono">
                {monitoringMode === 'websocket' ? `${wsLatency}ms` : `${pollingLatency}ms`}
              </Badge>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              )} />
              <span className={cn(
                "text-xs font-mono font-bold",
                metrics.totalUnrealizedPnL >= 0 ? "text-profit" : "text-loss"
              )}>
                {metrics.totalUnrealizedPnL >= 0 ? '+' : ''}${metrics.totalUnrealizedPnL.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Open Positions Section */}
        <div className="px-3 py-2 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Open Positions
            </span>
            <Badge variant="outline" className="text-[8px] h-3.5 px-1">
              {openPositions.length}
            </Badge>
          </div>
          
          {openPositions.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Target className="h-5 w-5 mx-auto mb-1 opacity-40" />
              <p className="text-[10px]">No open positions</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {openPositions.map(pos => {
                const progress = pos.progressPercent || 0;
                const isClose = progress >= 80;
                const distanceToTarget = Math.max(0, pos.targetProfit - (pos.unrealizedPnL || 0));
                
                return (
                  <div 
                    key={pos.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md border transition-all",
                      isClose && "border-green-500/50 bg-green-500/5 animate-pulse",
                      !isClose && (pos.unrealizedPnL || 0) >= 0 
                        ? "border-emerald-500/20 bg-emerald-500/5" 
                        : "border-amber-500/20 bg-amber-500/5"
                    )}
                  >
                    {/* Direction + Pair */}
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      {pos.direction === 'long' ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-mono text-[10px] font-medium truncate">{pos.pair}</span>
                    </div>
                    
                    {/* Exchange */}
                    <Badge variant="secondary" className="text-[8px] h-4 px-1 hidden sm:flex">
                      {pos.exchange}
                    </Badge>
                    
                    {/* Progress Bar */}
                    <div className="flex-1 min-w-[60px] max-w-[100px]">
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all", getProgressColor(progress))}
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground">
                        ${distanceToTarget.toFixed(2)} left
                      </span>
                    </div>
                    
                    {/* P&L */}
                    <span className={cn(
                      "font-mono text-[10px] font-bold min-w-[45px] text-right",
                      (pos.unrealizedPnL || 0) >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {(pos.unrealizedPnL || 0) >= 0 ? '+' : ''}${(pos.unrealizedPnL || 0).toFixed(2)}
                    </span>
                    
                    {/* Close Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleManualClose(pos.id, pos.pair)}
                      disabled={closingTradeId === pos.id}
                    >
                      {closingTradeId === pos.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Recent Trades Section - Horizontal Scroll */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Recent Trades
            </span>
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="text-profit">{recentTrades.filter(t => t.profitLoss > 0).length} wins</span>
              <span>•</span>
              <span className="text-loss">{recentTrades.filter(t => t.profitLoss <= 0).length} losses</span>
            </div>
          </div>
          
          {recentTrades.length === 0 ? (
            <div className="text-center py-3 text-muted-foreground">
              <Radio className="h-4 w-4 mx-auto mb-1 opacity-40" />
              <p className="text-[10px]">No trades today</p>
            </div>
          ) : (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-2 pb-2">
                {recentTrades.slice(0, 20).map((trade, index) => (
                  <div
                    key={trade.id}
                    className={cn(
                      "flex-shrink-0 w-[100px] p-2 rounded-lg border transition-all",
                      trade.profitLoss >= 0 
                        ? "bg-green-500/5 border-green-500/20" 
                        : "bg-red-500/5 border-red-500/20",
                      index === 0 && "animate-in slide-in-from-left-2"
                    )}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {trade.profitLoss >= 0 ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="font-mono text-[9px] font-medium truncate">{trade.pair}</span>
                    </div>
                    <div className={cn(
                      "font-mono text-xs font-bold",
                      trade.profitLoss >= 0 ? "text-profit" : "text-loss"
                    )}>
                      {trade.profitLoss >= 0 ? '+' : ''}${trade.profitLoss.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1 text-[8px] text-muted-foreground mt-1">
                      <Clock className="h-2.5 w-2.5" />
                      {format(trade.closedAt, 'HH:mm')}
                    </div>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </div>
        
        {/* Speed Comparison Footer */}
        <div className="px-3 py-1.5 border-t border-border/30 bg-muted/20">
          <div className="flex items-center justify-between text-[9px]">
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-muted-foreground">Detection Speed:</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn(
                "font-mono",
                monitoringMode === 'websocket' ? "text-green-500 font-medium" : "text-muted-foreground"
              )}>
                WS: {wsLatency}ms
              </span>
              <span className={cn(
                "font-mono",
                monitoringMode === 'polling' ? "text-yellow-500 font-medium" : "text-muted-foreground"
              )}>
                Poll: {pollingLatency}ms
              </span>
              {monitoringMode === 'websocket' && pollingLatency > 0 && (
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-green-500 border-green-500/30">
                  {Math.round(((pollingLatency - wsLatency) / pollingLatency) * 100)}% faster
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
