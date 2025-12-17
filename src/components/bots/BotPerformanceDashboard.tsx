import { useState } from 'react';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useBotRuns } from '@/hooks/useBotRuns';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  Flame, 
  Clock, 
  Award, 
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { toast } from 'sonner';

export function BotPerformanceDashboard() {
  const { mode } = useTradingMode();
  const { analytics, loading } = useBotAnalytics('30d', mode, 'all');
  const { bots, analyzeBot, analysisLoading } = useBotRuns();
  const [refreshing, setRefreshing] = useState(false);

  // Find most recent bot to analyze - use startedAt for sorting since stoppedAt may not exist
  const handleRefreshAnalysis = async () => {
    // Prefer running bot, then most recent stopped bot
    const runningBot = bots.find(b => b.status === 'running');
    const stoppedBots = bots.filter(b => b.status === 'stopped').sort((a, b) => 
      new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
    );
    const targetBot = runningBot || stoppedBots[0];

    if (!targetBot) {
      toast.info('No bots available', {
        description: 'Start a bot first to generate performance analysis.',
      });
      return;
    }

    setRefreshing(true);
    try {
      await analyzeBot(targetBot.id, targetBot.botName);
      toast.success('Analysis refreshed', {
        description: `Generated new insights for ${targetBot.botName}`,
      });
    } catch (err) {
      toast.error('Analysis failed', {
        description: 'Could not generate performance analysis.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="card-terminal p-4 h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading performance data...</div>
      </div>
    );
  }

  const { streaks, bestPerformingPairs, worstPerformingPairs, optimalTradingHours } = analytics;

  // Format hour for display
  const formatHour = (hour: number) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}${ampm}`;
  };

  // Get top 5 optimal hours
  const topHours = optimalTradingHours.slice(0, 5);

  return (
    <div className="card-terminal p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <Award className="w-4 h-4 text-primary" />
        <span className="font-semibold text-foreground text-sm">Performance Insights</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={handleRefreshAnalysis}
            disabled={refreshing || analysisLoading}
          >
            {refreshing || analysisLoading ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Analyze
          </Button>
          <Badge variant="outline" className="text-[8px]">
            {mode === 'demo' ? 'DEMO' : 'LIVE'}
          </Badge>
        </div>
      </div>

      {analytics.totalTrades === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-4">
          <Award className="w-8 h-8 text-muted-foreground/50" />
          <p className="text-sm text-center">No trades found for {mode === 'demo' ? 'Demo' : 'Live'} mode.</p>
          <p className="text-xs text-center text-muted-foreground/70">
            Start a bot to see performance insights.
          </p>
          <Button size="sm" variant="outline" onClick={handleRefreshAnalysis} disabled={refreshing || analysisLoading}>
            {refreshing || analysisLoading ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Check Again
          </Button>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-4">
            {/* Win/Loss Streaks */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Flame className="w-3 h-3" />
                WIN/LOSS STREAKS
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {/* Current Streak */}
                <div className="bg-background/50 p-2 rounded">
                  <p className="text-[9px] text-muted-foreground mb-1">Current Streak</p>
                  <div className="flex items-center gap-2">
                    {streaks.currentStreakType === 'win' ? (
                      <TrendingUp className="w-4 h-4 text-primary" />
                    ) : streaks.currentStreakType === 'loss' ? (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    ) : (
                      <span className="w-4 h-4" />
                    )}
                    <span className={cn(
                      "text-lg font-bold font-mono",
                      streaks.currentStreakType === 'win' ? 'text-primary' : 
                      streaks.currentStreakType === 'loss' ? 'text-destructive' : 'text-muted-foreground'
                    )}>
                      {streaks.currentStreak}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {streaks.currentStreakType === 'none' ? 'No streak' : 
                       streaks.currentStreakType === 'win' ? 'wins' : 'losses'}
                    </span>
                  </div>
                </div>

                {/* Best Streaks */}
                <div className="bg-background/50 p-2 rounded">
                  <p className="text-[9px] text-muted-foreground mb-1">Record Streaks</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <ArrowUp className="w-3 h-3 text-primary" />
                      <span className="text-sm font-bold font-mono text-primary">{streaks.longestWinStreak}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ArrowDown className="w-3 h-3 text-destructive" />
                      <span className="text-sm font-bold font-mono text-destructive">{streaks.longestLossStreak}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Best Performing Pairs */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                BEST PERFORMING PAIRS
              </h4>
              {bestPerformingPairs.length > 0 ? (
                <div className="space-y-1.5">
                  {bestPerformingPairs.slice(0, 5).map((pair, i) => (
                    <div key={pair.pair} className="flex items-center justify-between bg-background/50 p-1.5 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-4">#{i + 1}</span>
                        <span className="text-xs font-medium text-foreground">{pair.pair}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{pair.trades} trades</span>
                        <span className={cn(
                          "text-xs font-mono font-bold",
                          pair.profit >= 0 ? 'text-primary' : 'text-destructive'
                        )}>
                          ${pair.profit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No pair data available</p>
              )}
            </div>

            {/* Worst Performing Pairs */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                AVOID THESE PAIRS
              </h4>
              {worstPerformingPairs.length > 0 ? (
                <div className="space-y-1.5">
                  {worstPerformingPairs.filter(p => p.profit < 0).slice(0, 3).map((pair) => (
                    <div key={pair.pair} className="flex items-center justify-between bg-background/50 p-1.5 rounded">
                      <span className="text-xs font-medium text-foreground">{pair.pair}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{pair.winRate.toFixed(0)}% win</span>
                        <span className="text-xs font-mono font-bold text-destructive">
                          ${pair.profit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-primary">All pairs profitable!</p>
              )}
            </div>

            {/* Optimal Trading Hours */}
            <div className="bg-secondary/30 p-3 rounded">
              <h4 className="text-[10px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                OPTIMAL TRADING HOURS (UTC)
              </h4>
              {topHours.length > 0 ? (
                <>
                  <div className="h-[100px] mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={optimalTradingHours.slice(0, 12)}>
                        <XAxis 
                          dataKey="hour" 
                          tick={{ fontSize: 8 }} 
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={formatHour}
                        />
                        <YAxis tick={{ fontSize: 8 }} stroke="hsl(var(--muted-foreground))" hide />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            fontSize: 10,
                          }}
                          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Profit']}
                          labelFormatter={(hour) => `${formatHour(hour as number)} UTC`}
                        />
                        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                          {optimalTradingHours.slice(0, 12).map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.profit >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {topHours.map((hour) => (
                      <Badge 
                        key={hour.hour} 
                        variant="outline" 
                        className={cn(
                          "text-[9px]",
                          hour.profit > 0 ? "border-primary text-primary" : "border-muted"
                        )}
                      >
                        {formatHour(hour.hour)}: ${hour.profit.toFixed(2)}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Not enough data</p>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
