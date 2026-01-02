import { useState, useMemo, useCallback, useEffect } from 'react';
import { Brain, Calculator, TrendingUp, Zap, DollarSign, Target, RefreshCw, Check, AlertTriangle, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useBotStrategyAI, StrategyRecommendation } from '@/hooks/useBotStrategyAI';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Exchange fee rates
const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.001,
  bybit: 0.001,
  okx: 0.0008,
  kraken: 0.0016,
  nexo: 0.002,
};

interface PositionCalculation {
  positionSize: number;
  requiredMovePercent: number;
  estimatedFees: number;
  netProfit: number;
  tpPrice: number;
  tradesPerDay: number;
  estimatedDailyProfit: number;
}

export function AIStrategyDashboard() {
  const { user } = useAuth();
  const { recommendation, loading, applying, fetchRecommendation, applyRecommendation, lastUpdated } = useBotStrategyAI();
  
  // Auto-apply state
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [autoApplyLoading, setAutoApplyLoading] = useState(false);
  
  // Calculator state
  const [calcExchange, setCalcExchange] = useState('binance');
  const [calcPositionSize, setCalcPositionSize] = useState(200);
  const [targetProfit, setTargetProfit] = useState(1.00);
  const [calcEntryPrice, setCalcEntryPrice] = useState(95000);

  // Load auto-apply setting from database
  useEffect(() => {
    if (!user) return;
    
    const loadSettings = async () => {
      const { data } = await supabase
        .from('bot_config')
        .select('auto_apply_ai')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setAutoApplyEnabled(data.auto_apply_ai ?? false);
      }
    };
    
    loadSettings();
  }, [user]);

  // Auto-apply when recommendation changes and enabled
  useEffect(() => {
    if (autoApplyEnabled && recommendation && recommendation.confidence >= 85 && !applying) {
      toast.info('🤖 Auto-applying AI recommendation...', {
        description: `Confidence: ${recommendation.confidence}%`,
      });
      applyRecommendation();
    }
  }, [recommendation, autoApplyEnabled, applying, applyRecommendation]);

  // Toggle auto-apply
  const handleAutoApplyToggle = useCallback(async (enabled: boolean) => {
    if (!user) return;
    
    setAutoApplyLoading(true);
    try {
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          auto_apply_ai: enabled,
        }, { onConflict: 'user_id' });
      
      if (error) throw error;
      
      setAutoApplyEnabled(enabled);
      toast.success(enabled 
        ? '🤖 Auto-Apply enabled (>85% confidence)' 
        : 'Auto-Apply disabled'
      );
    } catch (err) {
      toast.error('Failed to update setting');
    } finally {
      setAutoApplyLoading(false);
    }
  }, [user]);

  // Position sizing calculator for $1 profit
  const calculation = useMemo((): PositionCalculation => {
    const feeRate = EXCHANGE_FEES[calcExchange] || 0.001;
    const roundTripFees = feeRate * 2;
    
    // Required price move = (target profit + fees) / position size
    const estimatedFees = calcPositionSize * roundTripFees;
    const requiredGross = targetProfit + estimatedFees;
    const requiredMovePercent = (requiredGross / calcPositionSize) * 100;
    
    // TP price calculation
    const tpPrice = calcEntryPrice * (1 + requiredMovePercent / 100);
    
    // Trades per day estimate (conservative: 8-12 trades/day for $1 target)
    const avgHoldTimeMinutes = 30; // Estimated 30 min per trade
    const tradingHoursPerDay = 8;
    const tradesPerDay = Math.floor((tradingHoursPerDay * 60) / avgHoldTimeMinutes);
    
    const estimatedDailyProfit = tradesPerDay * targetProfit;
    
    return {
      positionSize: calcPositionSize,
      requiredMovePercent,
      estimatedFees,
      netProfit: targetProfit,
      tpPrice,
      tradesPerDay,
      estimatedDailyProfit,
    };
  }, [calcExchange, calcPositionSize, targetProfit, calcEntryPrice]);

  return (
    <div className="space-y-4">
      {/* Header with Auto-Apply Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">AI Strategy Dashboard</h2>
          {recommendation && (
            <Badge variant={recommendation.confidence >= 85 ? 'default' : 'secondary'}>
              {recommendation.confidence}% confidence
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-apply" className="text-xs text-muted-foreground">
              Auto-Apply AI (&gt;85%)
            </Label>
            <Switch
              id="auto-apply"
              checked={autoApplyEnabled}
              onCheckedChange={handleAutoApplyToggle}
              disabled={autoApplyLoading}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecommendation}
            disabled={loading}
          >
            <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="calculator" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="calculator" className="gap-1">
            <Calculator className="w-3 h-3" />
            $1 Profit Calculator
          </TabsTrigger>
          <TabsTrigger value="recommendation" className="gap-1">
            <Brain className="w-3 h-3" />
            AI Recommendation
          </TabsTrigger>
        </TabsList>

        {/* $1 Profit Calculator */}
        <TabsContent value="calculator" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Inputs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Position Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Exchange</Label>
                  <select
                    value={calcExchange}
                    onChange={(e) => setCalcExchange(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    {Object.keys(EXCHANGE_FEES).map(ex => (
                      <option key={ex} value={ex}>
                        {ex.charAt(0).toUpperCase() + ex.slice(1)} ({(EXCHANGE_FEES[ex] * 100).toFixed(2)}% fee)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Position Size ($)</Label>
                  <Slider
                    value={[calcPositionSize]}
                    onValueChange={([v]) => setCalcPositionSize(v)}
                    min={50}
                    max={1000}
                    step={10}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>$50</span>
                    <span className="font-bold text-foreground">${calcPositionSize}</span>
                    <span>$1000</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Target Net Profit ($)</Label>
                  <Input
                    type="number"
                    value={targetProfit}
                    onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 1)}
                    step={0.25}
                    min={0.25}
                    max={10}
                    className="h-9"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Entry Price (BTC example)</Label>
                  <Input
                    type="number"
                    value={calcEntryPrice}
                    onChange={(e) => setCalcEntryPrice(parseFloat(e.target.value) || 95000)}
                    className="h-9"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  $1 Profit Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="text-xs text-muted-foreground">Required Move</div>
                    <div className="text-xl font-bold text-primary">
                      {calculation.requiredMovePercent.toFixed(3)}%
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="text-xs text-muted-foreground">Round-Trip Fees</div>
                    <div className="text-xl font-bold text-loss">
                      ${calculation.estimatedFees.toFixed(2)}
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="text-xs text-muted-foreground">Take Profit Price</div>
                    <div className="text-xl font-bold text-profit">
                      ${calculation.tpPrice.toFixed(2)}
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-background border">
                    <div className="text-xs text-muted-foreground">Net Profit</div>
                    <div className="text-xl font-bold text-profit">
                      ${calculation.netProfit.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Est. Daily Profit</span>
                    <Badge variant="outline">{calculation.tradesPerDay} trades/day</Badge>
                  </div>
                  <div className="text-2xl font-bold text-profit">
                    ${calculation.estimatedDailyProfit.toFixed(2)}
                  </div>
                </div>

                <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  No stop-loss with $1 strategy. Positions held until profitable.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Recommendation */}
        <TabsContent value="recommendation" className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : recommendation ? (
            <div className="space-y-4">
              {/* Confidence meter */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">AI Confidence</span>
                    <span className="text-lg font-bold">{recommendation.confidence}%</span>
                  </div>
                  <Progress value={recommendation.confidence} className="h-2" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {recommendation.summary}
                  </p>
                </CardContent>
              </Card>

              {/* Recommended settings */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Recommended Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {recommendation.recommendations && (
                      <>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-xs text-muted-foreground">Daily Target</div>
                          <div className="font-bold">${recommendation.recommendations.dailyTarget}</div>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-xs text-muted-foreground">Profit/Trade</div>
                          <div className="font-bold">${recommendation.recommendations.profitPerTrade}</div>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-xs text-muted-foreground">Position Size</div>
                          <div className="font-bold">${recommendation.recommendations.amountPerTrade}</div>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <div className="text-xs text-muted-foreground">Speed</div>
                          <div className="font-bold">{recommendation.recommendations.tradeIntervalMs}ms</div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={applyRecommendation}
                      disabled={applying}
                      className="flex-1"
                    >
                      {applying ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Apply Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No recommendation available</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchRecommendation}>
                Fetch Recommendation
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
