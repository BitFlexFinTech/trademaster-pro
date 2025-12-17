import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Users, Bot, DollarSign, Activity, BarChart3, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformStats {
  totalUsers: number;
  activeTraders: number;
  totalBots: number;
  runningBots: number;
  platformPnL: number;
  totalTrades: number;
  avgHitRate: number;
  totalVolume: number;
}

interface TopBot {
  botId: string;
  botName: string;
  pnl: number;
  trades: number;
  hitRate: number;
  status: string;
}

interface ExchangeDistribution {
  exchange: string;
  tradeCount: number;
  percentage: number;
}

interface DailyVolume {
  date: string;
  tradeCount: number;
  totalPnL: number;
}

interface PlatformAnalyticsProps {
  stats: PlatformStats;
  topBots: TopBot[];
  exchangeDistribution: ExchangeDistribution[];
  dailyVolume: DailyVolume[];
}

export function PlatformAnalytics({ stats, topBots, exchangeDistribution, dailyVolume }: PlatformAnalyticsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Users className="w-3.5 h-3.5" />
              Total Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatNumber(stats.totalUsers)}</p>
            <p className="text-xs text-muted-foreground">{stats.activeTraders} active this week</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Bot className="w-3.5 h-3.5" />
              Bots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatNumber(stats.totalBots)}</p>
            <p className="text-xs text-primary">{stats.runningBots} running</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <DollarSign className="w-3.5 h-3.5" />
              Platform P&L
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={cn(
              "text-2xl font-bold",
              stats.platformPnL >= 0 ? "text-primary" : "text-destructive"
            )}>
              {formatCurrency(stats.platformPnL)}
            </p>
            <div className="flex items-center gap-1 text-xs">
              {stats.platformPnL >= 0 ? (
                <TrendingUp className="w-3 h-3 text-primary" />
              ) : (
                <TrendingDown className="w-3 h-3 text-destructive" />
              )}
              <span className="text-muted-foreground">cumulative</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-xs">
              <Activity className="w-3.5 h-3.5" />
              Total Trades
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatNumber(stats.totalTrades)}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(stats.totalVolume)} volume</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Performing Bots */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Top Performing Bots
            </CardTitle>
            <CardDescription>By cumulative P&L</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topBots.slice(0, 5).map((bot, idx) => (
                <div key={bot.botId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-4">#{idx + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{bot.botName}</p>
                      <p className="text-xs text-muted-foreground">{bot.trades} trades • {bot.hitRate.toFixed(1)}% hit</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-sm font-bold font-mono",
                      bot.pnl >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {bot.pnl >= 0 ? '+' : ''}{formatCurrency(bot.pnl)}
                    </p>
                    <Badge variant={bot.status === 'running' ? 'default' : 'secondary'} className="text-[9px]">
                      {bot.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {topBots.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No bot data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exchange Distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Exchange Distribution
            </CardTitle>
            <CardDescription>Trade volume by exchange</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {exchangeDistribution.slice(0, 5).map((ex) => (
                <div key={ex.exchange} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{ex.exchange}</span>
                    <span className="text-muted-foreground font-mono">
                      {formatNumber(ex.tradeCount)} ({ex.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <Progress value={ex.percentage} className="h-1.5" />
                </div>
              ))}
              {exchangeDistribution.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No exchange data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Volume Chart Placeholder */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm">Daily Trade Volume (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-end gap-1">
            {dailyVolume.slice(-30).map((day, idx) => {
              const maxCount = Math.max(...dailyVolume.map(d => d.tradeCount), 1);
              const height = (day.tradeCount / maxCount) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 bg-primary/60 hover:bg-primary transition-colors rounded-t"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${day.date}: ${day.tradeCount} trades, ${formatCurrency(day.totalPnL)} P&L`}
                />
              );
            })}
            {dailyVolume.length === 0 && (
              <p className="text-sm text-muted-foreground text-center w-full py-8">No volume data</p>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>{dailyVolume[0]?.date || '-'}</span>
            <span>{dailyVolume[dailyVolume.length - 1]?.date || '-'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
