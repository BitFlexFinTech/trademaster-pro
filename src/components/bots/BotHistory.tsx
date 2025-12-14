import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Clock, TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

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
}

export function BotHistory({ bots }: BotHistoryProps) {
  const stoppedBots = bots.filter(b => b.status === 'stopped');

  if (stoppedBots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No bot history yet. Start and stop a bot to see history here.
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
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}
