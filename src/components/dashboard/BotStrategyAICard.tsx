import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, RefreshCw, Zap, Target, TrendingUp } from 'lucide-react';
import { useBotStrategyAI } from '@/hooks/useBotStrategyAI';
import { cn } from '@/lib/utils';

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

  const getHitRateBg = (rate: number) => {
    if (rate >= 95) return 'bg-green-500/10';
    if (rate >= 90) return 'bg-yellow-500/10';
    return 'bg-red-500/10';
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
          <Skeleton className="h-4 w-3/4 mb-2" />
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

        {/* Hit Rate Display */}
        <div className={cn("rounded-md p-2 mb-2", getHitRateBg(hitRate))}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Hit Rate</span>
            </div>
            <div className="flex items-center gap-1">
              <span className={cn("text-sm font-bold", getHitRateColor(hitRate))}>
                {hitRate.toFixed(1)}%
              </span>
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{targetRate}%</span>
            </div>
          </div>
        </div>

        {/* Trade Speed */}
        <div className="flex items-center justify-between text-xs mb-2">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span className="text-muted-foreground">Speed:</span>
          </div>
          <span className="text-foreground font-medium">
            {tradeSpeed}/sec <span className="text-muted-foreground">({limitingExchange}: {exchangeLimit}/sec)</span>
          </span>
        </div>

        {/* Recommendation Summary */}
        {recommendation?.summary && (
          <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2 flex-1">
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
