import { useState, useEffect } from 'react';
import { Zap, Play, Square, Target, Activity, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBotRuns } from '@/hooks/useBotRuns';
import { Link } from 'react-router-dom';

export function GreenBackWidget() {
  const { bots, startBot, stopBot, refetch } = useBotRuns();
  const existingBot = bots.find(b => b.botName === 'GreenBack' && b.status === 'running');
  const isRunning = !!existingBot;

  const [metrics, setMetrics] = useState({
    currentPnL: existingBot?.currentPnl || 0,
    tradesExecuted: existingBot?.tradesExecuted || 0,
    hitRate: existingBot?.hitRate || 0,
    dailyTarget: existingBot?.dailyTarget || 40,
  });

  useEffect(() => {
    if (existingBot) {
      setMetrics({
        currentPnL: existingBot.currentPnl,
        tradesExecuted: existingBot.tradesExecuted,
        hitRate: existingBot.hitRate,
        dailyTarget: existingBot.dailyTarget,
      });
    }
  }, [existingBot]);

  const handleStartStop = async () => {
    if (isRunning && existingBot) {
      await stopBot(existingBot.id);
    } else {
      await startBot('GreenBack', 'spot', 40, 1);
    }
    refetch();
  };

  const progressPercent = (metrics.currentPnL / metrics.dailyTarget) * 100;

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Zap className="w-4 h-4 text-primary" />
            {isRunning && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <span className="font-semibold text-sm text-foreground">GreenBack Bot</span>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'} className="text-[10px]">
          {isRunning ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Daily Progress</span>
          <span className="text-foreground font-mono">
            ${metrics.currentPnL.toFixed(2)} / ${metrics.dailyTarget}
          </span>
        </div>
        <Progress value={Math.min(progressPercent, 100)} className="h-1.5" />
      </div>

      <div className="grid grid-cols-3 gap-1 mb-2 text-[10px]">
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <DollarSign className="w-3 h-3 mx-auto text-primary mb-0.5" />
          <p className="font-mono font-bold text-foreground">${metrics.currentPnL.toFixed(2)}</p>
        </div>
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <Activity className="w-3 h-3 mx-auto text-muted-foreground mb-0.5" />
          <p className="font-mono font-bold text-foreground">{metrics.tradesExecuted}</p>
        </div>
        <div className="bg-secondary/50 p-1.5 rounded text-center">
          <Target className="w-3 h-3 mx-auto text-primary mb-0.5" />
          <p className="font-mono font-bold text-foreground">{metrics.hitRate.toFixed(0)}%</p>
        </div>
      </div>

      <div className="flex gap-2 mt-auto">
        <Button
          size="sm"
          className={cn('flex-1 h-7 text-xs gap-1', isRunning ? 'btn-outline-primary' : 'btn-primary')}
          onClick={handleStartStop}
        >
          {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isRunning ? 'Stop' : 'Start'}
        </Button>
        <Link to="/bots" className="flex-1">
          <Button size="sm" variant="outline" className="w-full h-7 text-xs">
            Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
