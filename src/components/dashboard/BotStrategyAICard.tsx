import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Bot, RefreshCw, Zap, Target } from 'lucide-react';
import { useBotStrategyAI } from '@/hooks/useBotStrategyAI';
import { cn } from '@/lib/utils';
import { LineChart, Line, ResponsiveContainer, ReferenceLine, YAxis, XAxis, Tooltip } from 'recharts';

// Custom tooltip for chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-md">
        <p className="text-xs font-medium text-foreground">{payload[0].value?.toFixed(1)}%</p>
        <p className="text-[10px] text-muted-foreground">{payload[0].payload.trades} trades</p>
        <p className="text-[10px] text-muted-foreground">{payload[0].payload.hourLabel}</p>
      </div>
    );
  }
  return null;
};

export function BotStrategyAICard() {
  const {
    recommendation,
    loading,
    applying,
    minutesAgo,
    fetchRecommendation,
    applyRecommendation
  } = useBotStrategyAI();

  const getHitRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-500';
    if (rate >= 90) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 95) return 'bg-green-500';
    if (rate >= 90) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading && !recommendation) {
    return (
      <Card className="h-full bg-card border-border">
        <CardContent className="p-3 h-full">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-8 w-20" />
        </CardContent>
      </Card>
    );
  }

  const hitRate = recommendation?.currentHitRate ?? 0;
  const targetRate = recommendation?.targetHitRate ?? 95;
  const tradeSpeed = recommendation?.recommendedTradeSpeed ?? 0;
  const exchangeLimit = recommendation?.exchangeLimit ?? 10;
  const limitingExchange = recommendation?.limitingExchange ?? 'N/A';
  const hitRateHistory = recommendation?.hitRateHistory ?? [];

  // Progress toward 95% target (capped at 100%)
  const progressPercent = Math.min(100, (hitRate / targetRate) * 100);

  // Format chart data - show all 24 hours with hourly labels
  const chartData = hitRateHistory.map((point, index) => {
    const hour = new Date(point.hour).getHours();
    const hourLabel = `${hour}:00`;
    return {
      index,
      hitRate: point.hitRate,
      trades: point.totalTrades,
      hourLabel,
      displayLabel: index % 4 === 0 ? hourLabel : '' // Show label every 4 hours
    };
  });

  // Calculate gradient stops based on hit rate distribution
  const gradientId = 'hitRateGradient';

  return (
    <Card className="h-full bg-card border-border overflow-hidden">
      <CardContent className="p-3 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Strategy AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={fetchRecommendation}
              className="p-1 hover:bg-muted rounded transition-colors"
              disabled={loading}
            >
              <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
            </button>
            <span className="text-[10px] text-muted-foreground">
              {minutesAgo !== null ? `${minutesAgo}m ago` : 'Loading...'}
            </span>
          </div>
        </div>

        {/* Progress Bar Section */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className={cn("text-sm font-bold", getHitRateColor(hitRate))}>
              {hitRate.toFixed(1)}%
            </span>
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{targetRate}%</span>
            </div>
          </div>
          <div className="relative">
            <Progress 
              value={progressPercent} 
              className="h-2 bg-muted"
            />
            <div 
              className={cn(
                "absolute inset-0 h-2 rounded-full transition-all",
                getProgressColor(hitRate)
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-end mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {progressPercent.toFixed(0)}% of target
            </span>
          </div>
        </div>

        {/* 24h Trend Chart with Gradient */}
        {chartData.length > 0 && (
          <div className="mb-2">
            <span className="text-[10px] text-muted-foreground">24h Trend</span>
            <div className="h-14 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 12, left: 4 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={1} />
                      <stop offset="50%" stopColor="hsl(48, 96%, 53%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <XAxis 
                    dataKey="displayLabel" 
                    tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine 
                    y={95} 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeDasharray="2 2" 
                    strokeOpacity={0.5}
                    label={{ 
                      value: '95%', 
                      position: 'right', 
                      fontSize: 8, 
                      fill: 'hsl(var(--muted-foreground))' 
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="hitRate" 
                    stroke={`url(#${gradientId})`}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Trade Speed */}
        <div className="flex items-center justify-between text-xs mb-1">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span className="text-muted-foreground">Speed:</span>
          </div>
          <span className="text-foreground font-medium">
            {tradeSpeed}/sec <span className="text-muted-foreground text-[10px]">({limitingExchange}: {exchangeLimit}/sec)</span>
          </span>
        </div>

        {/* Recommendation Summary */}
        {recommendation?.summary && (
          <p className="text-[10px] text-muted-foreground line-clamp-1 mb-2 flex-1">
            ⚡ {recommendation.summary}
          </p>
        )}

        {/* Apply Button */}
        <Button 
          size="sm" 
          className="w-full h-7 text-xs"
          onClick={applyRecommendation}
          disabled={applying || !recommendation}
        >
          {applying ? 'Applying...' : 'Apply Strategy'}
        </Button>
      </CardContent>
    </Card>
  );
}
