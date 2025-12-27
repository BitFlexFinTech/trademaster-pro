import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, Brain, TrendingUp, TrendingDown, Minus, Zap, 
  Play, SkipForward, Clock, Target, AlertTriangle,
  RefreshCw, Radio, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { useAITradingCopilot, TradeSuggestion } from '@/hooks/useAITradingCopilot';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function AITradingCopilot() {
  const {
    currentSuggestion,
    previousSuggestions,
    marketContext,
    userEdge,
    isLoading,
    isLive,
    refreshSuggestion,
    executeSuggestion,
    skipSuggestion,
  } = useAITradingCopilot();

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LONG': return <TrendingUp className="h-5 w-5 text-emerald-500" />;
      case 'SHORT': return <TrendingDown className="h-5 w-5 text-red-500" />;
      default: return <Minus className="h-5 w-5 text-amber-500" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LONG': return 'border-emerald-500/50 bg-emerald-500/10';
      case 'SHORT': return 'border-red-500/50 bg-red-500/10';
      default: return 'border-amber-500/50 bg-amber-500/10';
    }
  };

  const SuggestionCard = ({ suggestion }: { suggestion: TradeSuggestion }) => (
    <div className={cn(
      "rounded-lg border-2 p-4 transition-all",
      getActionColor(suggestion.action),
      suggestion.status === 'pending' && "animate-pulse-subtle"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getActionIcon(suggestion.action)}
          <div>
            <span className={cn(
              "font-bold text-lg",
              suggestion.action === 'LONG' ? 'text-emerald-400' :
              suggestion.action === 'SHORT' ? 'text-red-400' : 'text-amber-400'
            )}>
              {suggestion.action}
            </span>
            <Badge variant="outline" className="ml-2 text-xs">
              {suggestion.pair}
            </Badge>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            "text-xs",
            suggestion.confidence >= 70 ? "text-emerald-400 border-emerald-500/50" :
            suggestion.confidence >= 50 ? "text-amber-400 border-amber-500/50" :
            "text-red-400 border-red-500/50"
          )}
        >
          {suggestion.confidence}% confidence
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <div className="bg-background/50 rounded p-2">
          <div className="text-[10px] text-muted-foreground">Entry</div>
          <div className="font-mono text-foreground">${suggestion.entry.toFixed(2)}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ThumbsUp className="h-2.5 w-2.5 text-emerald-500" /> TP
          </div>
          <div className="font-mono text-emerald-400">${suggestion.takeProfit.toFixed(2)}</div>
        </div>
        <div className="bg-background/50 rounded p-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ThumbsDown className="h-2.5 w-2.5 text-red-500" /> SL
          </div>
          <div className="font-mono text-red-400">${suggestion.stopLoss.toFixed(2)}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
        {suggestion.reasoning}
      </p>

      {suggestion.status === 'pending' && (
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={() => executeSuggestion(suggestion.id)}
          >
            <Play className="h-3 w-3 mr-1" />
            Execute Trade
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => skipSuggestion(suggestion.id)}
          >
            <SkipForward className="h-3 w-3 mr-1" />
            Skip
          </Button>
        </div>
      )}

      {suggestion.status !== 'pending' && (
        <Badge variant="secondary" className="text-xs">
          {suggestion.status === 'executed' ? '✓ Executed' : 
           suggestion.status === 'skipped' ? '⏭ Skipped' : '⏱ Expired'}
        </Badge>
      )}
    </div>
  );

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            AI Trading Copilot
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                isLive ? "text-emerald-400 border-emerald-500/50" : "text-muted-foreground"
              )}
            >
              <Radio className={cn("h-3 w-3 mr-1", isLive && "animate-pulse")} />
              {isLive ? 'LIVE' : 'OFFLINE'}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refreshSuggestion}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Suggestion */}
        {currentSuggestion ? (
          <SuggestionCard suggestion={currentSuggestion} />
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active suggestions</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={refreshSuggestion}
              disabled={isLoading}
            >
              <Zap className="h-3 w-3 mr-1" />
              Generate Suggestion
            </Button>
          </div>
        )}

        {/* Market Context */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="text-xs text-slate-500 mb-2">MARKET CONTEXT</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Volatility:</span>
              <span className={cn(
                marketContext.volatility === 'High' ? 'text-red-400' :
                marketContext.volatility === 'Medium' ? 'text-amber-400' : 'text-emerald-400'
              )}>
                {marketContext.volatility}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend:</span>
              <span className={cn(
                marketContext.trend === 'Bullish' ? 'text-emerald-400' :
                marketContext.trend === 'Bearish' ? 'text-red-400' : 'text-amber-400'
              )}>
                {marketContext.trend}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Volume:</span>
              <span className="text-slate-300">{marketContext.volumeStatus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confidence:</span>
              <span className="text-cyan-400">{marketContext.regimeConfidence.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {/* Your Edge */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="text-xs text-slate-500 mb-2">YOUR EDGE TODAY</div>
          <div className="space-y-1.5 text-xs">
            {userEdge.bestPair && (
              <div className="flex items-center gap-2">
                <ThumbsUp className="h-3 w-3 text-emerald-500" />
                <span className="text-muted-foreground">Best:</span>
                <span className="text-emerald-400">
                  {userEdge.bestPair.pair} (+${userEdge.bestPair.pnl.toFixed(2)})
                </span>
              </div>
            )}
            {userEdge.worstPair && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-muted-foreground">Avoid:</span>
                <span className="text-red-400">
                  {userEdge.worstPair.pair} ({userEdge.worstPair.losses} losses)
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-cyan-500" />
              <span className="text-muted-foreground">Optimal:</span>
              <span className="text-cyan-400">{userEdge.optimalHours}</span>
            </div>
          </div>
        </div>

        {/* Previous Suggestions */}
        {previousSuggestions.length > 1 && (
          <div>
            <div className="text-xs text-slate-500 mb-2">RECENT SUGGESTIONS</div>
            <ScrollArea className="h-[120px]">
              <div className="space-y-1">
                {previousSuggestions.slice(1, 5).map((suggestion) => (
                  <div 
                    key={suggestion.id}
                    className="flex items-center justify-between text-xs p-2 bg-slate-900/30 rounded"
                  >
                    <div className="flex items-center gap-2">
                      {getActionIcon(suggestion.action)}
                      <span>{suggestion.pair}</span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(suggestion.timestamp, { addSuffix: true })}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {suggestion.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}