import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Brain,
  Clock,
  Target
} from 'lucide-react';
import { useTradesHistory } from '@/hooks/useTradesHistory';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type RegimeType = 'BULL' | 'BEAR' | 'CHOP';

interface TradeWithContext {
  id: string;
  pair: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number | null;
  created_at: string;
  closed_at: string | null;
  regime: RegimeType;
  aiSuggestion: string;
  aiConfidence: 'high' | 'medium' | 'low';
}

// Simulate regime based on trade timing (in real app would come from stored data)
function inferRegime(trade: { created_at: string; direction: string }): RegimeType {
  const hour = new Date(trade.created_at).getHours();
  // Simulate regime based on time patterns
  if (hour >= 8 && hour < 16) return trade.direction === 'long' ? 'BULL' : 'BEAR';
  if (hour >= 16 && hour < 22) return trade.direction === 'short' ? 'BEAR' : 'BULL';
  return 'CHOP';
}

// Generate simulated AI suggestion based on trade context
function generateAISuggestion(trade: { direction: string; profit_loss: number | null }, regime: RegimeType): { message: string; confidence: 'high' | 'medium' | 'low' } {
  const isProfit = (trade.profit_loss ?? 0) > 0;
  const matchesRegime = (regime === 'BULL' && trade.direction === 'long') || 
                        (regime === 'BEAR' && trade.direction === 'short');
  
  if (matchesRegime && isProfit) {
    return { message: `${regime} regime confirmed trend. High confluence entry.`, confidence: 'high' };
  } else if (matchesRegime) {
    return { message: `${regime} regime entry, awaiting confirmation.`, confidence: 'medium' };
  } else if (regime === 'CHOP') {
    return { message: 'CHOP regime scalp. Reduced position size.', confidence: 'low' };
  } else {
    return { message: 'Counter-trend trade. Tight stop recommended.', confidence: 'low' };
  }
}

export function JarvisTradeHistoryPanel() {
  const { sessions, loading } = useTradesHistory();

  // Flatten all trades from all sessions
  const allTrades = useMemo(() => {
    return sessions.flatMap(session => session.trades);
  }, [sessions]);

  const tradesWithContext = useMemo<TradeWithContext[]>(() => {
    if (!allTrades) return [];
    
    return allTrades.slice(0, 20).map(trade => {
      const regime = inferRegime(trade);
      const { message, confidence } = generateAISuggestion(trade, regime);
      
      return {
        id: trade.id,
        pair: trade.pair,
        direction: trade.direction,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        profit_loss: trade.profit_loss,
        created_at: trade.created_at,
        closed_at: trade.closed_at,
        regime,
        aiSuggestion: message,
        aiConfidence: confidence,
      };
    });
  }, [allTrades]);

  const regimeStats = useMemo(() => {
    const stats: Record<RegimeType, { total: number; wins: number; pnl: number }> = {
      BULL: { total: 0, wins: 0, pnl: 0 },
      BEAR: { total: 0, wins: 0, pnl: 0 },
      CHOP: { total: 0, wins: 0, pnl: 0 },
    };
    
    tradesWithContext.forEach(t => {
      stats[t.regime].total++;
      if ((t.profit_loss ?? 0) > 0) stats[t.regime].wins++;
      stats[t.regime].pnl += t.profit_loss ?? 0;
    });
    
    return stats;
  }, [tradesWithContext]);

  const getRegimeIcon = (regime: RegimeType) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-3 w-3" />;
      case 'BEAR': return <TrendingDown className="h-3 w-3" />;
      default: return <Minus className="h-3 w-3" />;
    }
  };

  const getRegimeColor = (regime: RegimeType) => {
    switch (regime) {
      case 'BULL': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'BEAR': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    }
  };

  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high': return 'text-emerald-400';
      case 'medium': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          JARVIS Trade History
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Regime Performance Summary */}
        <div className="grid grid-cols-3 gap-2">
          {(['BULL', 'BEAR', 'CHOP'] as RegimeType[]).map(regime => {
            const stats = regimeStats[regime];
            const hitRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(0) : '0';
            
            return (
              <div 
                key={regime}
                className="bg-muted/50 rounded-lg p-2 text-center"
              >
                <Badge variant="outline" className={cn("text-xs mb-1", getRegimeColor(regime))}>
                  {getRegimeIcon(regime)}
                  <span className="ml-1">{regime}</span>
                </Badge>
                <div className="text-xs text-muted-foreground">
                  {stats.total} trades | {hitRate}% win
                </div>
                <div className={cn(
                  "text-sm font-bold",
                  stats.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {stats.pnl >= 0 ? '+' : ''}{stats.pnl.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trade List */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
          {loading ? (
              <div className="text-center text-muted-foreground py-8">
                Loading trades...
              </div>
            ) : tradesWithContext.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No trades recorded yet
              </div>
            ) : (
              tradesWithContext.map(trade => (
                <div 
                  key={trade.id}
                  className="bg-muted/30 rounded-lg p-3 border border-border/50 space-y-2"
                >
                  {/* Trade Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          trade.direction === 'long' 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' 
                            : 'bg-red-500/20 text-red-400 border-red-500/50'
                        )}
                      >
                        {trade.direction === 'long' ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                        {trade.direction.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-medium">{trade.pair}</span>
                    </div>
                    <Badge variant="outline" className={cn("text-xs", getRegimeColor(trade.regime))}>
                      {getRegimeIcon(trade.regime)}
                      <span className="ml-1">{trade.regime}</span>
                    </Badge>
                  </div>

                  {/* Trade Details */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="text-foreground ml-1">${trade.entry_price.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Exit:</span>
                      <span className="text-foreground ml-1">
                        {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "font-bold",
                        (trade.profit_loss ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      )}>
                        {(trade.profit_loss ?? 0) >= 0 ? '+' : ''}${(trade.profit_loss ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* AI Context */}
                  <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                    <Brain className={cn("h-3 w-3 mt-0.5", getConfidenceColor(trade.aiConfidence))} />
                    <div className="flex-1">
                      <span className="text-xs text-muted-foreground">
                        {trade.aiSuggestion}
                      </span>
                      <span className={cn("text-xs ml-2", getConfidenceColor(trade.aiConfidence))}>
                        ({trade.aiConfidence})
                      </span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(trade.created_at), 'MMM d, HH:mm')}
                    {trade.closed_at && (
                      <span className="ml-2">
                        → {format(new Date(trade.closed_at), 'HH:mm')}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}