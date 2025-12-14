import { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Brain, History } from 'lucide-react';
import { useTradingMode } from '@/contexts/TradingModeContext';

interface BotRun {
  id: string;
  botName: string;
  mode: 'spot' | 'leverage';
  dailyTarget: number;
  profitPerTrade: number;
  status: 'running' | 'stopped' | 'paused';
  currentPnl: number;
  tradesExecuted: number;
  hitRate: number;
  maxDrawdown: number;
  startedAt: string | null;
}

interface BotHistoryProps {
  bots: BotRun[];
  onViewAnalysis?: (botId: string, botName: string) => void;
}

export function BotHistory({ bots, onViewAnalysis }: BotHistoryProps) {
  const { resetTrigger } = useTradingMode();
  const [stoppedBots, setStoppedBots] = useState<BotRun[]>([]);

  useEffect(() => {
    setStoppedBots(bots.filter(b => b.status === 'stopped'));
  }, [bots]);

  // Listen to reset trigger - clear history
  useEffect(() => {
    if (resetTrigger > 0) {
      setStoppedBots([]);
    }
  }, [resetTrigger]);

  if (stoppedBots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <History className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">
          No bot history yet. Start and stop a bot to see history here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-secondary/95 backdrop-blur-sm">
          <tr>
            <th className="text-left py-2 px-2 text-muted-foreground font-medium">Bot</th>
            <th className="text-left py-2 px-2 text-muted-foreground font-medium">Mode</th>
            <th className="text-right py-2 px-2 text-muted-foreground font-medium">P&L</th>
            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Trades</th>
            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Hit Rate</th>
            <th className="text-right py-2 px-2 text-muted-foreground font-medium">Target</th>
            <th className="text-center py-2 px-2 text-muted-foreground font-medium">Started</th>
            <th className="text-center py-2 px-2 text-muted-foreground font-medium">Analysis</th>
          </tr>
        </thead>
        <tbody>
          {stoppedBots.map((bot) => (
            <tr key={bot.id} className="border-t border-border/50 hover:bg-secondary/30">
              <td className="py-2 px-2">
                <span className="font-medium text-foreground">{bot.botName}</span>
              </td>
              <td className="py-2 px-2">
                <Badge variant="outline" className="text-[9px]">
                  {bot.mode.toUpperCase()}
                </Badge>
              </td>
              <td className="py-2 px-2 text-right">
                <span className={cn(
                  'font-mono font-medium',
                  bot.currentPnl >= 0 ? 'text-primary' : 'text-destructive'
                )}>
                  {bot.currentPnl >= 0 ? '+' : ''}${bot.currentPnl.toFixed(2)}
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono text-foreground">
                {bot.tradesExecuted}
              </td>
              <td className="py-2 px-2 text-right font-mono text-primary">
                {bot.hitRate.toFixed(1)}%
              </td>
              <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                ${bot.dailyTarget}
              </td>
              <td className="py-2 px-2 text-center text-muted-foreground">
                {bot.startedAt ? new Date(bot.startedAt).toLocaleDateString() : '-'}
              </td>
              <td className="py-2 px-2 text-center">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => onViewAnalysis?.(bot.id, bot.botName)}
                >
                  <Brain className="w-3 h-3" />
                  View
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
