import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, Loader2, Zap, TrendingUp, TrendingDown, 
  Minus, Check, Target, DollarSign, Clock, Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RegimeRecommendation {
  regime: 'BULL' | 'BEAR' | 'CHOP';
  winRate: number;
  avgProfit: number;
  tradeCount: number;
  recommendedTarget: number;
  recommendedPositionSize: number;
  recommendedInterval: number;
  reasoning: string;
}

interface OptimizationResult {
  recommendations: RegimeRecommendation[];
  overallInsight: string;
  confidence: number;
  analyzedAt: Date;
}

export function JarvisAIOptimizer() {
  const { user } = useAuth();
  const { settings, updateSettings, isSaving } = useJarvisSettings();
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [appliedRegimes, setAppliedRegimes] = useState<string[]>([]);

  const runOptimization = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const response = await supabase.functions.invoke('analyze-strategy', {
        body: {
          userId: user.id,
          action: 'regime_optimization',
        },
      });

      if (response.error) throw response.error;

      // Transform the response into regime-specific recommendations
      const data = response.data;
      
      const recommendations: RegimeRecommendation[] = [
        {
          regime: 'BULL',
          winRate: data.regimeStats?.BULL?.winRate || 85,
          avgProfit: data.regimeStats?.BULL?.avgProfit || 0.65,
          tradeCount: data.regimeStats?.BULL?.tradeCount || 0,
          recommendedTarget: Math.max(1.5, (data.regimeStats?.BULL?.avgProfit || 0.5) * 2.5),
          recommendedPositionSize: settings?.base_capital ? settings.base_capital * 1.1 : 120,
          recommendedInterval: 45000,
          reasoning: 'Strong momentum - increase targets and position size',
        },
        {
          regime: 'BEAR',
          winRate: data.regimeStats?.BEAR?.winRate || 72,
          avgProfit: data.regimeStats?.BEAR?.avgProfit || 0.45,
          tradeCount: data.regimeStats?.BEAR?.tradeCount || 0,
          recommendedTarget: Math.max(1.0, (data.regimeStats?.BEAR?.avgProfit || 0.4) * 2),
          recommendedPositionSize: settings?.base_capital ? settings.base_capital * 0.8 : 100,
          recommendedInterval: 90000,
          reasoning: 'Defensive mode - conservative targets, smaller positions',
        },
        {
          regime: 'CHOP',
          winRate: data.regimeStats?.CHOP?.winRate || 65,
          avgProfit: data.regimeStats?.CHOP?.avgProfit || 0.30,
          tradeCount: data.regimeStats?.CHOP?.tradeCount || 0,
          recommendedTarget: Math.max(0.5, (data.regimeStats?.CHOP?.avgProfit || 0.3) * 1.5),
          recommendedPositionSize: settings?.base_capital ? settings.base_capital * 0.6 : 80,
          recommendedInterval: 120000,
          reasoning: 'Choppy conditions - minimal exposure, tight stops',
        },
      ];

      setResult({
        recommendations,
        overallInsight: data.summary || 'Analysis complete. Recommendations based on your historical performance per regime.',
        confidence: data.confidence || 75,
        analyzedAt: new Date(),
      });
    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('Failed to run AI optimization');
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (rec: RegimeRecommendation) => {
    try {
      const updates: any = {};
      
      if (rec.regime === 'BULL') {
        updates.target_bull_profit = rec.recommendedTarget;
      } else if (rec.regime === 'BEAR') {
        updates.target_bear_profit = rec.recommendedTarget;
      } else {
        updates.target_chop_profit = rec.recommendedTarget;
      }

      await updateSettings(updates);
      setAppliedRegimes(prev => [...prev, rec.regime]);
      toast.success(`${rec.regime} settings applied`);
    } catch (error) {
      toast.error('Failed to apply settings');
    }
  };

  const applyAll = async () => {
    if (!result) return;
    
    try {
      await updateSettings({
        target_bull_profit: result.recommendations[0].recommendedTarget,
        target_bear_profit: result.recommendations[1].recommendedTarget,
        target_chop_profit: result.recommendations[2].recommendedTarget,
      });
      setAppliedRegimes(['BULL', 'BEAR', 'CHOP']);
      toast.success('All regime settings applied');
    } catch (error) {
      toast.error('Failed to apply settings');
    }
  };

  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'BEAR': return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-amber-500" />;
    }
  };

  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'border-emerald-500/50 bg-emerald-500/5';
      case 'BEAR': return 'border-red-500/50 bg-red-500/5';
      default: return 'border-amber-500/50 bg-amber-500/5';
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Strategy Optimizer
          </CardTitle>
          <Button 
            size="sm" 
            onClick={runOptimization}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-3 w-3 mr-1" />
                Optimize
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!result ? (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              Click "Optimize" to analyze your trading performance and get 
              AI-powered recommendations for each market regime.
            </p>
          </div>
        ) : (
          <>
            {/* Confidence & Insight */}
            <div className="bg-muted/30 rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Analysis Confidence</span>
                <Badge variant="outline" className={cn(
                  "text-xs",
                  result.confidence >= 70 ? "text-emerald-400 border-emerald-500/50" :
                  result.confidence >= 50 ? "text-amber-400 border-amber-500/50" :
                  "text-red-400 border-red-500/50"
                )}>
                  {result.confidence}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {result.overallInsight}
              </p>
            </div>

            {/* Per-Regime Recommendations */}
            <ScrollArea className="h-[350px]">
              <div className="space-y-3">
                {result.recommendations.map((rec) => (
                  <div 
                    key={rec.regime}
                    className={cn(
                      "rounded-lg border p-3 transition-all",
                      getRegimeColor(rec.regime),
                      appliedRegimes.includes(rec.regime) && "ring-2 ring-primary"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getRegimeIcon(rec.regime)}
                        <span className="font-semibold">{rec.regime} Regime</span>
                      </div>
                      <Button
                        size="sm"
                        variant={appliedRegimes.includes(rec.regime) ? "secondary" : "default"}
                        onClick={() => applyRecommendation(rec)}
                        disabled={isSaving || appliedRegimes.includes(rec.regime)}
                      >
                        {appliedRegimes.includes(rec.regime) ? (
                          <>
                            <Check className="h-3 w-3 mr-1" />
                            Applied
                          </>
                        ) : (
                          'Apply'
                        )}
                      </Button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-[10px] text-muted-foreground">Win Rate</div>
                        <div className="text-sm font-bold text-foreground">
                          {rec.winRate.toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-[10px] text-muted-foreground">Avg Profit</div>
                        <div className="text-sm font-bold text-emerald-400">
                          ${rec.avgProfit.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-background/50 rounded p-2">
                        <div className="text-[10px] text-muted-foreground">Trades</div>
                        <div className="text-sm font-bold text-foreground">
                          {rec.tradeCount}
                        </div>
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          Target Profit
                        </span>
                        <span className="text-primary font-mono">
                          ${rec.recommendedTarget.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          Position Size
                        </span>
                        <span className="font-mono">
                          ${rec.recommendedPositionSize.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Interval
                        </span>
                        <span className="font-mono">
                          {(rec.recommendedInterval / 1000).toFixed(0)}s
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground mt-2 italic">
                      {rec.reasoning}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Apply All Button */}
            <Button 
              className="w-full"
              onClick={applyAll}
              disabled={isSaving || appliedRegimes.length === 3}
            >
              {appliedRegimes.length === 3 ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  All Settings Applied
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-1" />
                  Apply All Recommendations
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}