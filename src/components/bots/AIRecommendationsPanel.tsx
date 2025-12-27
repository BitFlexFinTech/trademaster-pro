import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useBotStrategyAI, StrategyRecommendation } from '@/hooks/useBotStrategyAI';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  Brain, 
  Target, 
  DollarSign, 
  Clock, 
  TrendingUp, 
  Shield, 
  Zap, 
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface AIRecommendationField {
  key: string;
  label: string;
  icon: React.ElementType;
  currentValue: string | number;
  recommendedValue: string | number;
  displayCurrent: string;
  displayRecommended: string;
  unit?: string;
  improvement?: string;
  color: 'primary' | 'warning' | 'destructive' | 'muted';
}

interface AIRecommendationsPanelProps {
  botConfig: {
    dailyTarget: number;
    profitPerTrade: number;
    amountPerTrade: number;
    tradeIntervalMs: number;
    dailyStopLoss: number;
    perTradeStopLoss: number;
    minProfitThreshold: number;
    focusPairs: string[];
  };
  onApplyField: (field: string, value: any) => void;
  onApplyAll: () => void;
  className?: string;
  compact?: boolean;
}

export function AIRecommendationsPanel({ 
  botConfig, 
  onApplyField, 
  onApplyAll,
  className,
  compact = false
}: AIRecommendationsPanelProps) {
  const { user } = useAuth();
  const { recommendation, loading, applying, fetchRecommendation, applyRecommendation } = useBotStrategyAI();
  const [applyingField, setApplyingField] = useState<string | null>(null);

  // Build fields from recommendation
  const buildFields = useCallback((): AIRecommendationField[] => {
    if (!recommendation?.recommendations) return [];

    const rec = recommendation.recommendations;
    const fields: AIRecommendationField[] = [];

    // Field 1: Trading Strategy
    fields.push({
      key: 'tradingStrategy',
      label: 'Trading Strategy',
      icon: Brain,
      currentValue: 'profit',
      recommendedValue: rec.tradingStrategy || 'profit',
      displayCurrent: 'Profit Mode',
      displayRecommended: rec.tradingStrategy === 'signal' ? 'Signal Mode' : 'Profit Mode',
      color: rec.tradingStrategy === 'signal' ? 'warning' : 'primary',
    });

    // Field 2: Daily Target
    fields.push({
      key: 'dailyTarget',
      label: 'Daily Target',
      icon: Target,
      currentValue: botConfig.dailyTarget,
      recommendedValue: rec.dailyTarget || 40,
      displayCurrent: `$${botConfig.dailyTarget}`,
      displayRecommended: `$${rec.dailyTarget || 40}`,
      unit: '$',
      improvement: rec.dailyTarget > botConfig.dailyTarget ? `+$${(rec.dailyTarget - botConfig.dailyTarget).toFixed(0)}` : undefined,
      color: 'primary',
    });

    // Field 3: Profit Per Trade
    fields.push({
      key: 'profitPerTrade',
      label: 'Profit/Trade',
      icon: DollarSign,
      currentValue: botConfig.profitPerTrade,
      recommendedValue: rec.profitPerTrade || 0.50,
      displayCurrent: `$${botConfig.profitPerTrade.toFixed(2)}`,
      displayRecommended: `$${(rec.profitPerTrade || 0.50).toFixed(2)}`,
      unit: '$',
      color: 'primary',
    });

    // Field 4: Amount Per Trade
    fields.push({
      key: 'amountPerTrade',
      label: 'Amount/Trade',
      icon: DollarSign,
      currentValue: botConfig.amountPerTrade,
      recommendedValue: rec.amountPerTrade || 100,
      displayCurrent: `$${botConfig.amountPerTrade.toFixed(0)}`,
      displayRecommended: `$${(rec.amountPerTrade || 100).toFixed(0)}`,
      unit: '$',
      color: 'warning',
    });

    // Field 5: Trade Speed
    fields.push({
      key: 'tradeIntervalMs',
      label: 'Speed (Interval)',
      icon: Clock,
      currentValue: botConfig.tradeIntervalMs,
      recommendedValue: rec.tradeIntervalMs || 60000,
      displayCurrent: `${(botConfig.tradeIntervalMs / 1000).toFixed(0)}s`,
      displayRecommended: `${((rec.tradeIntervalMs || 60000) / 1000).toFixed(0)}s`,
      unit: 'ms',
      color: 'muted',
    });

    // Field 6: Daily Stop Loss
    fields.push({
      key: 'dailyStopLoss',
      label: 'Daily Stop',
      icon: Shield,
      currentValue: botConfig.dailyStopLoss,
      recommendedValue: rec.dailyStopLoss || 5,
      displayCurrent: `-$${botConfig.dailyStopLoss.toFixed(2)}`,
      displayRecommended: `-$${(rec.dailyStopLoss || 5).toFixed(2)}`,
      unit: '$',
      color: 'destructive',
    });

    // Field 7: Per-Trade Stop Loss
    fields.push({
      key: 'perTradeStopLoss',
      label: 'SL/Trade',
      icon: AlertTriangle,
      currentValue: botConfig.perTradeStopLoss,
      recommendedValue: rec.stopLoss || 0.10,
      displayCurrent: `-$${botConfig.perTradeStopLoss.toFixed(2)}`,
      displayRecommended: `-$${(rec.stopLoss || 0.10).toFixed(2)}`,
      unit: '$',
      color: 'destructive',
    });

    // Field 8: Min Edge
    fields.push({
      key: 'minProfitThreshold',
      label: 'Min Edge',
      icon: Zap,
      currentValue: botConfig.minProfitThreshold * 100,
      recommendedValue: rec.minEdge || 0.3,
      displayCurrent: `${(botConfig.minProfitThreshold * 100).toFixed(2)}%`,
      displayRecommended: `${(rec.minEdge || 0.3).toFixed(2)}%`,
      unit: '%',
      color: 'primary',
    });

    // Field 9: Focus Pairs
    fields.push({
      key: 'focusPairs',
      label: 'Focus Pairs',
      icon: TrendingUp,
      currentValue: botConfig.focusPairs.length,
      recommendedValue: (rec.focusPairs || []).length,
      displayCurrent: `${botConfig.focusPairs.slice(0, 3).join(', ')}${botConfig.focusPairs.length > 3 ? '...' : ''}`,
      displayRecommended: `${(rec.focusPairs || []).slice(0, 3).join(', ')}${(rec.focusPairs || []).length > 3 ? '...' : ''}`,
      color: 'muted',
    });

    return fields;
  }, [recommendation, botConfig]);

  const fields = buildFields();

  // Apply single field
  const handleApplyField = async (field: AIRecommendationField) => {
    if (!user || !recommendation) return;

    setApplyingField(field.key);
    try {
      const rec = recommendation.recommendations;
      let dbColumn: string;
      let value: any;

      switch (field.key) {
        case 'dailyTarget':
          dbColumn = 'daily_target';
          value = rec.dailyTarget;
          break;
        case 'profitPerTrade':
          dbColumn = 'profit_per_trade';
          value = rec.profitPerTrade;
          break;
        case 'amountPerTrade':
          dbColumn = 'amount_per_trade';
          value = rec.amountPerTrade;
          break;
        case 'tradeIntervalMs':
          dbColumn = 'trade_interval_ms';
          value = rec.tradeIntervalMs;
          break;
        case 'dailyStopLoss':
          dbColumn = 'daily_stop_loss';
          value = rec.dailyStopLoss;
          break;
        case 'perTradeStopLoss':
          dbColumn = 'per_trade_stop_loss';
          value = rec.stopLoss;
          break;
        case 'minProfitThreshold':
          dbColumn = 'min_profit_threshold';
          value = rec.minEdge / 100; // Convert % to decimal
          break;
        case 'focusPairs':
          dbColumn = 'focus_pairs';
          value = rec.focusPairs;
          break;
        default:
          return;
      }

      // Update database
      const { error } = await supabase
        .from('bot_config')
        .upsert({
          user_id: user.id,
          [dbColumn]: value,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Broadcast for immediate sync
      await supabase.channel('bot-config-sync').send({
        type: 'broadcast',
        event: 'config_changed',
        payload: { [field.key]: value },
      });

      onApplyField(field.key, value);
      toast.success(`${field.label} updated!`, {
        description: `Changed to ${field.displayRecommended}`,
      });
    } catch (error) {
      console.error('Failed to apply field:', error);
      toast.error(`Failed to update ${field.label}`);
    } finally {
      setApplyingField(null);
    }
  };

  const getColorClass = (color: string) => {
    switch (color) {
      case 'primary': return 'text-primary';
      case 'warning': return 'text-warning';
      case 'destructive': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  // Count fields with changes
  const changedFieldsCount = fields.filter(f => String(f.currentValue) !== String(f.recommendedValue)).length;

  // Compact mode - single row card
  if (compact) {
    return (
      <div className={cn("card-terminal p-2", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Brain className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground whitespace-nowrap">AI STRATEGY</span>
            {recommendation ? (
              <>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[9px] px-1 h-4",
                    recommendation.confidence >= 80 ? "border-primary text-primary" :
                    recommendation.confidence >= 60 ? "border-warning text-warning" : "border-destructive text-destructive"
                  )}
                >
                  {recommendation.confidence}%
                </Badge>
                {changedFieldsCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">{changedFieldsCount} changes</span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground">Click Analyze</span>
            )}
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-5 text-[10px] px-1.5"
              onClick={fetchRecommendation}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Analyze'}
            </Button>
            {recommendation && changedFieldsCount > 0 && (
              <Button
                size="sm"
                variant="default"
                className="h-5 text-[10px] px-1.5"
                onClick={() => {
                  applyRecommendation();
                  onApplyAll();
                }}
                disabled={applying}
              >
                {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply All'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className={cn("card-terminal p-4", className)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">AI Strategy Recommendations</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={fetchRecommendation}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Analyze
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">
          Click "Analyze" to get AI recommendations for all 9 bot settings.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("card-terminal p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">AI Strategy Recommendations</span>
          <Badge variant="outline" className="text-[9px] h-4 border-primary text-primary">
            {recommendation.confidence}% confidence
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={fetchRecommendation}
            disabled={loading}
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => {
              applyRecommendation();
              onApplyAll();
            }}
            disabled={applying}
          >
            {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Apply All
          </Button>
        </div>
      </div>

      {/* Summary */}
      {recommendation.summary && (
        <p className="text-[10px] text-muted-foreground mb-3 pb-2 border-b border-border/50">
          {recommendation.summary}
        </p>
      )}

      {/* Fields Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {fields.map((field) => {
          const Icon = field.icon;
          const isChanged = String(field.currentValue) !== String(field.recommendedValue);
          const isApplying = applyingField === field.key;

          return (
            <div
              key={field.key}
              className={cn(
                "p-2 rounded-lg border transition-all",
                isChanged 
                  ? "bg-primary/5 border-primary/30 hover:border-primary/50" 
                  : "bg-secondary/30 border-border/50"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn("w-3 h-3", getColorClass(field.color))} />
                  <span className="text-[10px] font-medium text-foreground">{field.label}</span>
                </div>
                {isChanged && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[9px] gap-1"
                    onClick={() => handleApplyField(field)}
                    disabled={isApplying}
                  >
                    {isApplying ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <Check className="w-2.5 h-2.5" />
                    )}
                    Apply
                  </Button>
                )}
              </div>
              
              <div className="flex items-center justify-between text-[9px]">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-mono text-foreground">{field.displayCurrent}</span>
                </div>
                <div className="flex items-center text-muted-foreground">→</div>
                <div className="flex flex-col text-right">
                  <span className="text-muted-foreground">Recommended</span>
                  <span className={cn("font-mono font-medium", isChanged ? "text-primary" : "text-foreground")}>
                    {field.displayRecommended}
                  </span>
                </div>
              </div>

              {field.improvement && (
                <div className="mt-1 text-[8px] text-primary font-medium">
                  {field.improvement} potential
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Metrics Footer */}
      {recommendation.metrics && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-[9px] text-muted-foreground">
          <span>Capital: ${recommendation.metrics.totalCapital?.toLocaleString()}</span>
          <span>Est. trades: {recommendation.metrics.estimatedDailyTrades}/day</span>
          <span>Trades/hr: {recommendation.metrics.tradesPerHour}</span>
        </div>
      )}
    </div>
  );
}
