import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, TrendingUp, Check, Target, DollarSign, Clock, Percent } from 'lucide-react';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Recommendation {
  dailyTarget: number;
  profitPerTrade: number;
  estimatedTrades: number;
  confidence: number;
  reasoning: string;
  tradeIntervalMs: number;
}

interface RecommendationCardsProps {
  spotBalance?: number;
  futuresBalance?: number;
  historicalHitRate?: number;
}

export function JarvisRecommendationCards({
  spotBalance = 500,
  futuresBalance = 500,
  historicalHitRate = 85,
}: RecommendationCardsProps) {
  const { user } = useAuth();
  const { settings, updateSettings, isSaving } = useJarvisSettings();
  
  const [loading, setLoading] = useState(false);
  const [spotRec, setSpotRec] = useState<Recommendation | null>(null);
  const [leverageRec, setLeverageRec] = useState<Recommendation | null>(null);
  const [appliedType, setAppliedType] = useState<'spot' | 'leverage' | null>(null);

  const fetchRecommendations = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Generate SPOT recommendation
      const spotResponse = await supabase.functions.invoke('recommend-daily-target', {
        body: {
          usdtFloat: [{ exchange: 'Binance', amount: spotBalance, baseBalance: spotBalance, availableFloat: spotBalance }],
          historicalHitRate,
          averageProfitPerTrade: 0.50,
          tradingHoursPerDay: 8,
          riskTolerance: 'moderate',
          connectedExchanges: ['Binance'],
        },
      });

      if (spotResponse.data?.recommendation) {
        setSpotRec({
          dailyTarget: spotResponse.data.recommendation.dailyTarget,
          profitPerTrade: spotResponse.data.recommendation.profitPerTrade,
          estimatedTrades: spotResponse.data.recommendation.estimatedTrades,
          confidence: spotResponse.data.recommendation.confidence,
          reasoning: spotResponse.data.recommendation.reasoning,
          tradeIntervalMs: spotResponse.data.recommendation.tradeSpeed?.recommendedIntervalMs || 60000,
        });
      }

      // Generate LEVERAGE recommendation (higher targets due to leverage)
      const leverageMultiplier = settings?.leverage || 4;
      const leverageResponse = await supabase.functions.invoke('recommend-daily-target', {
        body: {
          usdtFloat: [{ 
            exchange: 'Binance', 
            amount: futuresBalance * leverageMultiplier, 
            baseBalance: futuresBalance, 
            availableFloat: futuresBalance * leverageMultiplier 
          }],
          historicalHitRate,
          averageProfitPerTrade: 2.00, // Higher profit per trade with leverage
          tradingHoursPerDay: 8,
          riskTolerance: 'aggressive',
          connectedExchanges: ['Binance'],
        },
      });

      if (leverageResponse.data?.recommendation) {
        setLeverageRec({
          dailyTarget: leverageResponse.data.recommendation.dailyTarget,
          profitPerTrade: leverageResponse.data.recommendation.profitPerTrade,
          estimatedTrades: leverageResponse.data.recommendation.estimatedTrades,
          confidence: leverageResponse.data.recommendation.confidence,
          reasoning: leverageResponse.data.recommendation.reasoning,
          tradeIntervalMs: leverageResponse.data.recommendation.tradeSpeed?.recommendedIntervalMs || 30000,
        });
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
      toast.error('Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (type: 'spot' | 'leverage') => {
    const rec = type === 'spot' ? spotRec : leverageRec;
    if (!rec) return;

    try {
      await updateSettings({
        target_bull_profit: rec.profitPerTrade,
        target_bear_profit: rec.profitPerTrade * 0.8, // Slightly lower for bear
        target_chop_profit: rec.profitPerTrade * 0.5, // Much lower for chop
      });

      // Also update bot_config if it exists
      if (user) {
        await supabase
          .from('bot_config')
          .upsert({
            user_id: user.id,
            daily_target: rec.dailyTarget,
            profit_per_trade: rec.profitPerTrade,
            trade_interval_ms: rec.tradeIntervalMs,
          }, { onConflict: 'user_id' });

        // Broadcast config change to all bot cards
        const channel = supabase.channel('jarvis-config-broadcast');
        channel.send({
          type: 'broadcast',
          event: 'config_update',
          payload: {
            dailyTarget: rec.dailyTarget,
            profitPerTrade: rec.profitPerTrade,
            tradeIntervalMs: rec.tradeIntervalMs,
            source: type,
          },
        });
      }

      setAppliedType(type);
      toast.success(`${type === 'spot' ? 'SPOT' : 'LEVERAGE'} settings applied!`, {
        description: `Daily target: $${rec.dailyTarget}, Profit/trade: $${rec.profitPerTrade.toFixed(2)}`,
      });
    } catch (error) {
      toast.error('Failed to apply recommendation');
    }
  };

  const RecommendationCard = ({ 
    type, 
    rec, 
    color 
  }: { 
    type: 'spot' | 'leverage'; 
    rec: Recommendation | null; 
    color: string;
  }) => (
    <Card className={cn(
      "border-2 transition-all",
      appliedType === type ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {type === 'spot' ? (
              <DollarSign className="h-4 w-4 text-emerald-500" />
            ) : (
              <Zap className="h-4 w-4 text-amber-500" />
            )}
            {type === 'spot' ? 'SPOT Trading' : 'LEVERAGE Trading'}
          </CardTitle>
          {rec && (
            <Badge variant="outline" className={cn("text-xs", color)}>
              {rec.confidence}% confidence
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!rec ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Click "Generate" to get AI recommendations
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Daily Target
                </div>
                <div className="text-lg font-bold text-primary">
                  ${rec.dailyTarget}
                </div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Per Trade
                </div>
                <div className="text-lg font-bold text-foreground">
                  ${rec.profitPerTrade.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                ~{rec.estimatedTrades} trades/day
              </span>
              <span className="flex items-center gap-1">
                <Percent className="h-3 w-3" />
                {(rec.tradeIntervalMs / 1000).toFixed(0)}s interval
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground line-clamp-2">
              {rec.reasoning}
            </p>

            <Button 
              size="sm" 
              className="w-full"
              onClick={() => applyRecommendation(type)}
              disabled={isSaving || appliedType === type}
            >
              {appliedType === type ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Applied
                </>
              ) : (
                <>
                  <Zap className="h-3 w-3 mr-1" />
                  Apply Settings
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          AI Trading Recommendations
        </h3>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={fetchRecommendations}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="h-3 w-3 mr-1" />
              Generate
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RecommendationCard 
          type="spot" 
          rec={spotRec} 
          color="text-emerald-400 border-emerald-500/50"
        />
        <RecommendationCard 
          type="leverage" 
          rec={leverageRec} 
          color="text-amber-400 border-amber-500/50"
        />
      </div>
    </div>
  );
}