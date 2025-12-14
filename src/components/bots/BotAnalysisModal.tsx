import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  TrendingUp, 
  Target, 
  DollarSign, 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lightbulb,
  ArrowRight,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AnalysisReport {
  summary: string;
  insights: string[];
  recommendedProfitPerTrade: number;
  recommendedAmountPerTrade: number;
  improvements: string[];
  recommendations?: Array<{
    id: string;
    title: string;
    description: string;
    type: 'profit_target' | 'stop_loss' | 'pairs' | 'timing' | 'leverage';
    newValue?: number | string | string[];
    impact: string;
  }>;
}

interface BotStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  hitRate: number;
}

interface CurrentConfig {
  profitPerTrade: number;
  amountPerTrade: number;
  stopLoss: number;
  focusPairs: string[];
}

interface BotAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botName: string;
  analysis: AnalysisReport | null;
  stats: BotStats | null;
  onApplyRecommendation: (type: string, value: any) => void;
  loading?: boolean;
  currentConfig?: CurrentConfig;
}

export function BotAnalysisModal({
  open,
  onOpenChange,
  botName,
  analysis,
  stats,
  onApplyRecommendation,
  loading = false,
  currentConfig,
}: BotAnalysisModalProps) {
  const [applying, setApplying] = useState<string | null>(null);

  const handleApply = async (type: string, value: any) => {
    setApplying(type);
    try {
      // Show notification handled by parent with old vs new values
      await onApplyRecommendation(type, value);
    } catch (err) {
      toast.error('Failed to apply recommendation');
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Analyzing bot performance...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Performance Analysis
            <Badge variant="outline" className="ml-2">{botName}</Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
                <p className="text-xl font-bold text-foreground">{stats.totalTrades}</p>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                <p className={cn(
                  'text-xl font-bold',
                  stats.hitRate >= 60 ? 'text-primary' : stats.hitRate >= 50 ? 'text-warning' : 'text-destructive'
                )}>
                  {stats.hitRate.toFixed(1)}%
                </p>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
                <p className={cn(
                  'text-xl font-bold',
                  stats.totalPnl >= 0 ? 'text-primary' : 'text-destructive'
                )}>
                  ${stats.totalPnl.toFixed(2)}
                </p>
              </div>
              <div className="bg-secondary/50 p-3 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1">Avg Win/Loss</p>
                <p className="text-sm font-medium text-foreground">
                  <span className="text-primary">${stats.avgWin.toFixed(2)}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">${stats.avgLoss.toFixed(2)}</span>
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          {analysis && (
            <>
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">Summary</h3>
                    <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                  </div>
                </div>
              </div>

              {/* Key Insights */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-warning" />
                  Key Insights
                </h3>
                <div className="space-y-2">
                  {analysis.insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="my-6" />

              {/* Actionable Recommendations */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-primary" />
                  Actionable Recommendations
                </h3>
                
                <div className="space-y-3">
                  {/* Profit Per Trade Recommendation */}
                  <div className="bg-secondary/30 border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                          <DollarSign className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Adjust Profit Target</h4>
                          <p className="text-xs text-muted-foreground">
                            Current: ${currentConfig?.profitPerTrade?.toFixed(2) || '1.00'} → New: ${analysis.recommendedProfitPerTrade.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleApply('profit_per_trade', analysis.recommendedProfitPerTrade)}
                        disabled={applying === 'profit_per_trade'}
                        className="gap-1"
                      >
                        {applying === 'profit_per_trade' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            Apply <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Amount Per Trade Recommendation */}
                  <div className="bg-secondary/30 border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                          <TrendingUp className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Adjust Position Size</h4>
                          <p className="text-xs text-muted-foreground">
                            Current: ${currentConfig?.amountPerTrade?.toFixed(0) || '100'} → New: ${analysis.recommendedAmountPerTrade.toFixed(0)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply('amount_per_trade', analysis.recommendedAmountPerTrade)}
                        disabled={applying === 'amount_per_trade'}
                        className="gap-1"
                      >
                        {applying === 'amount_per_trade' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            Apply <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Tighter Stop Loss */}
                  <div className="bg-secondary/30 border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Tighter Stop Loss</h4>
                          <p className="text-xs text-muted-foreground">
                            Current: -${currentConfig?.stopLoss?.toFixed(2) || '0.60'} → New: -$0.45
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply('stop_loss', 0.45)}
                        disabled={applying === 'stop_loss'}
                        className="gap-1"
                      >
                        {applying === 'stop_loss' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            Apply <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Focus High Volume Pairs */}
                  <div className="bg-secondary/30 border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <Zap className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Focus High-Volume Pairs</h4>
                          <p className="text-xs text-muted-foreground">
                            Current: {currentConfig?.focusPairs?.slice(0, 3).join(', ') || 'BTC, ETH, SOL'}... → New: BTC, ETH, SOL only
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply('focus_pairs', ['BTC', 'ETH', 'SOL'])}
                        disabled={applying === 'focus_pairs'}
                        className="gap-1"
                      >
                        {applying === 'focus_pairs' ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            Apply <ArrowRight className="w-3 h-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              {/* Strategy Improvements */}
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Strategy Improvements
                </h3>
                <div className="space-y-2">
                  {analysis.improvements.map((improvement, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-secondary/30 p-3 rounded-lg">
                      <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs text-primary font-medium">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{improvement}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {!analysis && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              No analysis available yet.
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
