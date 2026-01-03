import { useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Medal, Award, Crown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useProfitLeaderboard, LeaderboardPeriod, PairRanking } from '@/hooks/useProfitLeaderboard';

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  day: 'Today',
  week: '7 Days',
  month: '30 Days',
  all: 'All Time',
};

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-amber-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400" />;
  if (rank === 3) return <Award className="w-4 h-4 text-amber-600" />;
  return <span className="text-xs text-muted-foreground w-4 text-center">{rank}</span>;
}

function TrendIndicator({ trend, trendValue }: { trend: 'up' | 'down' | 'stable'; trendValue: number }) {
  const absValue = Math.abs(trendValue);
  
  if (trend === 'up') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 text-emerald-400">
              <TrendingUp className="w-3 h-3" />
              <span className="text-[9px] font-mono">+{absValue.toFixed(0)}%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            <p>Up {absValue.toFixed(1)}% vs previous period</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  if (trend === 'down') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5 text-red-400">
              <TrendingDown className="w-3 h-3" />
              <span className="text-[9px] font-mono">-{absValue.toFixed(0)}%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            <p>Down {absValue.toFixed(1)}% vs previous period</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <Minus className="w-3 h-3" />
      <span className="text-[9px]">~</span>
    </div>
  );
}

function PairRow({ ranking, isExpanded, onToggle }: { ranking: PairRanking; isExpanded: boolean; onToggle: () => void }) {
  return (
    <div 
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        ranking.rank <= 3 && 'border-primary/30 bg-primary/5'
      )}
    >
      {/* Main row */}
      <button 
        onClick={onToggle}
        className="w-full p-2 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="w-6 flex items-center justify-center">
          <RankIcon rank={ranking.rank} />
        </div>
        
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium truncate block">{ranking.pair}</span>
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <div className="text-center w-12">
            <span className="text-muted-foreground block">Trades</span>
            <span className="font-mono">{ranking.tradeCount}</span>
          </div>
          
          <div className="text-center w-12">
            <span className="text-muted-foreground block">Win %</span>
            <span className={cn(
              'font-mono',
              ranking.winRate >= 60 ? 'text-emerald-400' : ranking.winRate >= 50 ? 'text-amber-400' : 'text-red-400'
            )}>
              {ranking.winRate.toFixed(0)}%
            </span>
          </div>
          
          <div className="text-right w-16 flex items-center gap-2">
            <div>
              <span className="text-muted-foreground block">Profit</span>
              <span className={cn(
                'font-mono font-medium',
                ranking.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}>
                {ranking.totalProfit >= 0 ? '+' : ''}{ranking.totalProfit.toFixed(2)}
              </span>
            </div>
          </div>
          
          {/* Trend Indicator */}
          <div className="w-12 flex justify-end">
            <TrendIndicator trend={ranking.trend} trendValue={ranking.trendValue} />
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 border-t bg-muted/20">
          <div className="grid grid-cols-4 gap-2 text-[9px]">
            <div className="text-center p-1.5 bg-background/50 rounded">
              <span className="text-muted-foreground block">Long P/L</span>
              <div className="flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span className={ranking.longProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {ranking.longProfit >= 0 ? '+' : ''}{ranking.longProfit.toFixed(2)}
                </span>
              </div>
              <span className="text-muted-foreground">({ranking.longCount} trades)</span>
            </div>
            
            <div className="text-center p-1.5 bg-background/50 rounded">
              <span className="text-muted-foreground block">Short P/L</span>
              <div className="flex items-center justify-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-400" />
                <span className={ranking.shortProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {ranking.shortProfit >= 0 ? '+' : ''}{ranking.shortProfit.toFixed(2)}
                </span>
              </div>
              <span className="text-muted-foreground">({ranking.shortCount} trades)</span>
            </div>
            
            <div className="text-center p-1.5 bg-background/50 rounded">
              <span className="text-muted-foreground block">Best Trade</span>
              <span className="text-emerald-400 font-mono">+{ranking.bestTrade.toFixed(2)}</span>
            </div>
            
            <div className="text-center p-1.5 bg-background/50 rounded">
              <span className="text-muted-foreground block">Worst Trade</span>
              <span className="text-red-400 font-mono">{ranking.worstTrade.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="mt-2 text-[9px] text-muted-foreground text-center">
            Avg profit per trade: <span className={cn(
              'font-mono',
              ranking.avgProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {ranking.avgProfit >= 0 ? '+' : ''}{ranking.avgProfit.toFixed(3)} USDT
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfitLeaderboard({ className }: { className?: string }) {
  const [period, setPeriod] = useState<LeaderboardPeriod>('day');
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  
  const { rankings, totalProfit, totalTrades, overallWinRate, isLoading } = useProfitLeaderboard(period);

  return (
    <Card className={cn('card-terminal', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Pair Performance Leaderboard
          </CardTitle>
        </div>
        
        {/* Period selector */}
        <div className="flex gap-1 mt-2">
          {(Object.keys(PERIOD_LABELS) as LeaderboardPeriod[]).map(p => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>

        {/* Summary stats */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center p-2 bg-muted/30 rounded">
              <span className="text-[10px] text-muted-foreground block">Total Profit</span>
              <span className={cn(
                'text-sm font-mono font-bold',
                totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} USDT
              </span>
            </div>
            <div className="text-center p-2 bg-muted/30 rounded">
              <span className="text-[10px] text-muted-foreground block">Total Trades</span>
              <span className="text-sm font-mono font-bold text-foreground">{totalTrades}</span>
            </div>
            <div className="text-center p-2 bg-muted/30 rounded">
              <span className="text-[10px] text-muted-foreground block">Win Rate</span>
              <span className={cn(
                'text-sm font-mono font-bold',
                overallWinRate >= 60 ? 'text-emerald-400' : overallWinRate >= 50 ? 'text-amber-400' : 'text-red-400'
              )}>
                {overallWinRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rankings.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            <div className="text-center">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No trades for this period</p>
              <p className="text-xs mt-1">Complete some trades to see rankings</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-1.5 pr-2">
              {rankings.map(ranking => (
                <PairRow 
                  key={ranking.pair} 
                  ranking={ranking}
                  isExpanded={expandedPair === ranking.pair}
                  onToggle={() => setExpandedPair(expandedPair === ranking.pair ? null : ranking.pair)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
