import { useState } from 'react';
import { Bot, Play, Square, ChevronRight, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MobileBotCardProps {
  bot: {
    id: string;
    bot_name: string;
    status: string;
    current_pnl: number;
    trades_executed: number;
    hit_rate: number;
    mode: string;
    exchange?: string;
  };
  onStart: () => Promise<any>;
  onStop: () => Promise<void>;
}

export function MobileBotCard({ bot, onStart, onStop }: MobileBotCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const isRunning = bot.status === 'running';
  const pnl = bot.current_pnl || 0;
  const isProfitable = pnl >= 0;

  const handleAction = async () => {
    setIsLoading(true);
    try {
      if (isRunning) {
        await onStop();
      } else {
        await onStart();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn(
      "card-terminal overflow-hidden transition-all",
      isRunning && "border-primary/30 bg-primary/5"
    )}>
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Main Content */}
          <div className="flex-1 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Bot className={cn(
                "w-4 h-4",
                isRunning ? "text-primary" : "text-muted-foreground"
              )} />
              <span className="text-sm font-medium truncate">{bot.bot_name}</span>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[9px] h-4",
                  isRunning 
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                    : "bg-muted"
                )}
              >
                {isRunning ? 'Running' : 'Stopped'}
              </Badge>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 bg-muted/30 rounded">
                <span className="text-[10px] text-muted-foreground block">P/L</span>
                <div className="flex items-center justify-center gap-1">
                  {isProfitable ? (
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                  <span className={cn(
                    "text-xs font-mono font-bold",
                    isProfitable ? "text-emerald-400" : "text-red-400"
                  )}>
                    {isProfitable ? '+' : ''}{pnl.toFixed(2)}
                  </span>
                </div>
              </div>
              
              <div className="p-1.5 bg-muted/30 rounded">
                <span className="text-[10px] text-muted-foreground block">Trades</span>
                <span className="text-xs font-mono">{bot.trades_executed || 0}</span>
              </div>
              
              <div className="p-1.5 bg-muted/30 rounded">
                <span className="text-[10px] text-muted-foreground block">Win Rate</span>
                <span className={cn(
                  "text-xs font-mono",
                  (bot.hit_rate || 0) >= 60 ? "text-emerald-400" : 
                  (bot.hit_rate || 0) >= 50 ? "text-amber-400" : "text-red-400"
                )}>
                  {(bot.hit_rate || 0).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Action Button - Large Touch Target */}
          <Button
            onClick={handleAction}
            disabled={isLoading}
            className={cn(
              "h-auto w-16 rounded-none flex flex-col items-center justify-center gap-1",
              isRunning 
                ? "bg-red-500 hover:bg-red-600 text-white" 
                : "bg-emerald-500 hover:bg-emerald-600 text-white"
            )}
            style={{ minWidth: '64px', minHeight: '80px' }} // Large touch target
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRunning ? (
              <>
                <Square className="w-5 h-5" />
                <span className="text-[10px]">Stop</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span className="text-[10px]">Start</span>
              </>
            )}
          </Button>
        </div>

        {/* Mode Badge */}
        <div className="px-3 pb-2 flex items-center gap-2">
          <Badge variant="outline" className="text-[9px]">
            {bot.mode || 'spot'}
          </Badge>
          {bot.exchange && (
            <Badge variant="outline" className="text-[9px]">
              {bot.exchange}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
