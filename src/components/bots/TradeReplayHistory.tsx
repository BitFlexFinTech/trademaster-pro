import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  History, TrendingUp, TrendingDown, Clock, Zap, 
  ChevronRight, Timer, Target, CheckCircle2, XCircle 
} from 'lucide-react';
import { useTradingData } from '@/contexts/TradingDataContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceStrict } from 'date-fns';

interface TradeReplayHistoryProps {
  className?: string;
}

export function TradeReplayHistory({ className }: TradeReplayHistoryProps) {
  const { recentTrades, metrics } = useTradingData();
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  
  const selectedTrade = recentTrades.find(t => t.id === selectedTradeId);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  if (recentTrades.length === 0) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardContent className="py-6 text-center">
          <History className="h-6 w-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">No trade history today</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("card-terminal overflow-hidden", className)}>
      <CardHeader className="py-2 px-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-primary" />
            Trade Replay History
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] h-4 gap-1">
              {recentTrades.length} trades
            </Badge>
            <Badge 
              variant="secondary" 
              className={cn(
                "text-[9px] h-4",
                metrics.winRate >= 60 ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
              )}
            >
              {metrics.winRate.toFixed(0)}% win
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Trade Timeline - Horizontal Scroll */}
        <div className="px-3 py-2">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-2 pb-2">
              {recentTrades.map((trade, index) => {
                const isSelected = selectedTradeId === trade.id;
                const isWin = trade.profitLoss >= 0;
                
                return (
                  <button
                    key={trade.id}
                    onClick={() => setSelectedTradeId(isSelected ? null : trade.id)}
                    className={cn(
                      "flex-shrink-0 w-[90px] p-2 rounded-lg border transition-all text-left",
                      isWin 
                        ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40" 
                        : "bg-red-500/5 border-red-500/20 hover:border-red-500/40",
                      isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                    )}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {isWin ? (
                        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                      ) : (
                        <XCircle className="h-2.5 w-2.5 text-red-500" />
                      )}
                      <span className="font-mono text-[8px] font-medium truncate">{trade.pair}</span>
                    </div>
                    
                    <div className={cn(
                      "font-mono text-[10px] font-bold",
                      isWin ? "text-profit" : "text-loss"
                    )}>
                      {isWin ? '+' : ''}${trade.profitLoss.toFixed(2)}
                    </div>
                    
                    <div className="flex items-center gap-1 text-[7px] text-muted-foreground mt-1">
                      <Clock className="h-2 w-2" />
                      {format(trade.closedAt, 'HH:mm:ss')}
                    </div>
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        
        {/* Selected Trade Detail Panel */}
        {selectedTrade && (
          <div className="px-3 py-2 border-t border-border/30 bg-muted/20 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-2">
              {selectedTrade.direction === 'long' ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="font-mono text-sm font-bold">{selectedTrade.pair}</span>
              <Badge variant="outline" className="text-[9px] h-4">
                {selectedTrade.exchange}
              </Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className={cn(
                "font-mono text-sm font-bold",
                selectedTrade.profitLoss >= 0 ? "text-profit" : "text-loss"
              )}>
                {selectedTrade.profitLoss >= 0 ? '+' : ''}${selectedTrade.profitLoss.toFixed(2)}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Entry */}
              <div className="p-2 rounded bg-background/50 border border-border/30">
                <div className="text-[9px] text-muted-foreground uppercase mb-1">Entry</div>
                <div className="font-mono text-[10px]">
                  ${selectedTrade.entryPrice.toFixed(selectedTrade.entryPrice > 100 ? 2 : 4)}
                </div>
                {selectedTrade.openedAt && (
                  <div className="text-[8px] text-muted-foreground">
                    {format(selectedTrade.openedAt, 'HH:mm:ss')}
                  </div>
                )}
              </div>
              
              {/* Exit */}
              <div className="p-2 rounded bg-background/50 border border-border/30">
                <div className="text-[9px] text-muted-foreground uppercase mb-1">Exit</div>
                <div className="font-mono text-[10px]">
                  ${selectedTrade.exitPrice.toFixed(selectedTrade.exitPrice > 100 ? 2 : 4)}
                </div>
                <div className="text-[8px] text-muted-foreground">
                  {format(selectedTrade.closedAt, 'HH:mm:ss')}
                </div>
              </div>
              
              {/* Hold Duration */}
              <div className="p-2 rounded bg-background/50 border border-border/30">
                <div className="text-[9px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                  <Timer className="h-2.5 w-2.5" />
                  Hold Time
                </div>
                <div className="font-mono text-[10px] font-medium">
                  {selectedTrade.holdDurationMs 
                    ? formatDuration(selectedTrade.holdDurationMs)
                    : '—'
                  }
                </div>
              </div>
              
              {/* Execution Speed */}
              <div className="p-2 rounded bg-background/50 border border-border/30">
                <div className="text-[9px] text-muted-foreground uppercase mb-1 flex items-center gap-1">
                  <Zap className="h-2.5 w-2.5" />
                  Speed
                </div>
                <div className="font-mono text-[10px] font-medium text-yellow-500">
                  {selectedTrade.executionSpeedMs 
                    ? `${selectedTrade.executionSpeedMs}ms`
                    : '< 1s'
                  }
                </div>
              </div>
            </div>
            
            {/* Price Movement Visualization */}
            <div className="mt-2 p-2 rounded bg-background/50 border border-border/30">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground">Price Movement</span>
                <span className={cn(
                  "font-mono",
                  selectedTrade.profitLoss >= 0 ? "text-profit" : "text-loss"
                )}>
                  {((selectedTrade.exitPrice - selectedTrade.entryPrice) / selectedTrade.entryPrice * 100).toFixed(3)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    selectedTrade.profitLoss >= 0 ? "bg-green-500" : "bg-red-500"
                  )}
                  style={{ 
                    width: `${Math.min(100, Math.abs((selectedTrade.exitPrice - selectedTrade.entryPrice) / selectedTrade.entryPrice * 1000))}%` 
                  }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Summary Footer */}
        <div className="px-3 py-1.5 border-t border-border/30 bg-muted/20">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-muted-foreground">
              Avg Hold: {formatDuration(metrics.avgHoldTime)}
            </span>
            <span className="text-muted-foreground">
              Today: <span className={cn(
                "font-mono font-medium",
                metrics.totalRealizedPnL >= 0 ? "text-profit" : "text-loss"
              )}>
                {metrics.totalRealizedPnL >= 0 ? '+' : ''}${metrics.totalRealizedPnL.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
