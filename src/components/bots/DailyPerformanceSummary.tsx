import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Activity, Clock, Zap, Award, BarChart3, Brain, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TradeData {
  id: string;
  profit_loss: number;
  created_at: string;
  pair: string;
  direction: string;
  closed_at?: string;
}

interface DailyPerformanceSummaryProps {
  isOpen?: boolean;
  onClose?: () => void;
  dailyTarget?: number;
  currentPnL?: number;
  tradesExecuted?: number;
  hitRate?: number;
}

export function DailyPerformanceSummary({
  isOpen = false,
  onClose,
  dailyTarget = 100,
  currentPnL = 0,
  tradesExecuted = 0,
  hitRate = 0,
}: DailyPerformanceSummaryProps) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);

  // Fetch today's trades for detailed analysis
  useEffect(() => {
    if (!user?.id || !isOpen) return;

    const fetchTrades = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString())
        .eq('status', 'closed')
        .eq('is_sandbox', false)
        .order('created_at', { ascending: true });

      if (data) {
        setTrades(data);
      }
    };

    fetchTrades();
  }, [user?.id, isOpen]);

  // Generate AI insight
  useEffect(() => {
    if (!isOpen || trades.length === 0) return;

    const generateInsight = async () => {
      setLoadingInsight(true);
      try {
        const { data } = await supabase.functions.invoke('analyze-bot-performance', {
          body: {
            trades: trades.slice(-20),
            dailyTarget,
            currentPnL,
            hitRate,
          },
        });

        if (data?.recommendation) {
          setAiInsight(data.recommendation);
        } else {
          // Generate local insight
          const progressPercent = (currentPnL / dailyTarget) * 100;
          if (progressPercent >= 100) {
            setAiInsight(`Excellent! Daily target achieved with ${hitRate.toFixed(1)}% win rate. Consider locking in profits.`);
          } else if (hitRate >= 70) {
            setAiInsight(`Strong performance with ${hitRate.toFixed(1)}% win rate. Keep the momentum going!`);
          } else if (hitRate >= 50) {
            setAiInsight(`Stable session. Consider tightening entry criteria to improve win rate.`);
          } else {
            setAiInsight(`Win rate below target. Review recent losing trades for patterns.`);
          }
        }
      } catch (err) {
        setAiInsight('Session complete. Review your trades for insights.');
      } finally {
        setLoadingInsight(false);
      }
    };

    generateInsight();
  }, [isOpen, trades, dailyTarget, currentPnL, hitRate]);

  if (!isOpen) return null;

  // Calculate metrics
  const profits = trades.map(t => t.profit_loss || 0);
  const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;
  const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;
  const avgProfit = trades.length > 0 ? currentPnL / trades.length : 0;
  const wins = trades.filter(t => (t.profit_loss || 0) > 0).length;
  const losses = trades.length - wins;

  // Calculate session duration
  const sessionStart = trades.length > 0 ? new Date(trades[0].created_at) : new Date();
  const sessionEnd = trades.length > 0 ? new Date(trades[trades.length - 1].created_at) : new Date();
  const sessionDurationMs = sessionEnd.getTime() - sessionStart.getTime();
  const sessionHours = Math.floor(sessionDurationMs / (1000 * 60 * 60));
  const sessionMinutes = Math.floor((sessionDurationMs % (1000 * 60 * 60)) / (1000 * 60));

  // Trades per hour
  const tradesPerHour = sessionDurationMs > 0 
    ? (trades.length / (sessionDurationMs / (1000 * 60 * 60))).toFixed(1)
    : '0';

  // Build cumulative P&L chart data
  let cumulative = 0;
  const chartData = trades.map((t, i) => {
    cumulative += t.profit_loss || 0;
    return {
      trade: i + 1,
      pnl: cumulative,
      time: new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  });

  const progressPercent = Math.min((currentPnL / dailyTarget) * 100, 100);
  const isTargetReached = currentPnL >= dailyTarget;
  const isProfit = currentPnL > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-2xl mx-4 border-border bg-card shadow-2xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Daily Performance Summary
              </CardTitle>
              <CardDescription>
                Session: {sessionHours > 0 ? `${sessionHours}h ` : ''}{sessionMinutes}m
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main P&L Display */}
          <div className="text-center py-4">
            <div className={cn(
              "text-4xl font-bold",
              isProfit ? "text-green-500" : "text-red-500"
            )}>
              {isProfit ? '+' : ''}${currentPnL.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {isTargetReached ? (
                <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/50">
                  <Award className="h-3 w-3 mr-1" />
                  Daily Target Achieved!
                </Badge>
              ) : (
                <span>{progressPercent.toFixed(0)}% of ${dailyTarget} target</span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-semibold">{tradesExecuted}</div>
              <div className="text-xs text-muted-foreground">Trades</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-semibold text-green-500">{wins}</div>
              <div className="text-xs text-muted-foreground">Wins</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-semibold text-red-500">{losses}</div>
              <div className="text-xs text-muted-foreground">Losses</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-semibold">{hitRate.toFixed(0)}%</div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
          </div>

          {/* P&L Chart */}
          {chartData.length > 1 && (
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isProfit ? "#22c55e" : "#ef4444"} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={isProfit ? "#22c55e" : "#ef4444"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="trade" hide />
                  <YAxis hide domain={['dataMin', 'dataMax']} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover p-2 rounded border border-border text-xs">
                            <div>Trade #{data.trade}</div>
                            <div className={data.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${data.pnl.toFixed(2)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke={isProfit ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    fill="url(#pnlGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detailed Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between p-2 rounded bg-muted/20">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                Best Trade
              </span>
              <span className="text-green-500 font-medium">+${bestTrade.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/20">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                Worst Trade
              </span>
              <span className="text-red-500 font-medium">${worstTrade.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/20">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Avg Trade
              </span>
              <span className={cn(avgProfit >= 0 ? 'text-green-500' : 'text-red-500', 'font-medium')}>
                ${avgProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-muted/20">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                Trades/Hour
              </span>
              <span className="font-medium">{tradesPerHour}</span>
            </div>
          </div>

          {/* AI Insight */}
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
            <div className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <div className="text-xs font-medium text-primary mb-1">AI Insight</div>
                <div className="text-sm text-foreground/80">
                  {loadingInsight ? 'Analyzing session...' : aiInsight}
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <Button 
            className="w-full" 
            onClick={onClose}
          >
            Close Summary
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
