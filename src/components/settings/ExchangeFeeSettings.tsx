import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, DollarSign, Sparkles, TrendingDown, Check, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  BINANCE_VIP_TIERS,
  OKX_VIP_TIERS,
  BYBIT_VIP_TIERS,
  getVipTierFees,
  getAvailableTiers,
  calculatePositionForOneDollarProfit,
  DEFAULT_EXCHANGE_FEES,
} from '@/lib/positionSizing';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExchangeFeeConfig {
  exchange: string;
  feeTier: string;
  makerFee: number;
  takerFee: number;
  bnbDiscount: boolean;
  okxDiscount: boolean;
}

const SUPPORTED_EXCHANGES = ['binance', 'okx', 'bybit'];

export function ExchangeFeeSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState<Record<string, ExchangeFeeConfig>>({});

  // Load existing settings
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_exchange_fees')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;

        const configMap: Record<string, ExchangeFeeConfig> = {};
        
        // Initialize with defaults for all exchanges
        SUPPORTED_EXCHANGES.forEach((exchange) => {
          const defaultFees = getVipTierFees(exchange, 'standard', false);
          configMap[exchange] = {
            exchange,
            feeTier: 'standard',
            makerFee: defaultFees.maker,
            takerFee: defaultFees.taker,
            bnbDiscount: false,
            okxDiscount: false,
          };
        });

        // Override with saved settings
        data?.forEach((row) => {
          configMap[row.exchange_name] = {
            exchange: row.exchange_name,
            feeTier: row.fee_tier || 'standard',
            makerFee: row.maker_fee || DEFAULT_EXCHANGE_FEES[row.exchange_name],
            takerFee: row.taker_fee || DEFAULT_EXCHANGE_FEES[row.exchange_name],
            bnbDiscount: row.bnb_discount || false,
            okxDiscount: row.okx_discount || false,
          };
        });

        setConfigs(configMap);
      } catch (err) {
        console.error('Failed to load fee settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  const handleTierChange = useCallback((exchange: string, tier: string) => {
    const fees = getVipTierFees(exchange, tier, configs[exchange]?.bnbDiscount);
    setConfigs((prev) => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        feeTier: tier,
        makerFee: fees.maker,
        takerFee: fees.taker,
      },
    }));
  }, [configs]);

  const handleDiscountToggle = useCallback((exchange: string, checked: boolean) => {
    const tier = configs[exchange]?.feeTier || 'standard';
    const fees = getVipTierFees(exchange, tier, checked);
    
    setConfigs((prev) => ({
      ...prev,
      [exchange]: {
        ...prev[exchange],
        bnbDiscount: exchange === 'binance' ? checked : prev[exchange]?.bnbDiscount || false,
        okxDiscount: exchange === 'okx' ? checked : prev[exchange]?.okxDiscount || false,
        makerFee: fees.maker,
        takerFee: fees.taker,
      },
    }));
  }, [configs]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const upserts = Object.values(configs).map((config) => ({
        user_id: user.id,
        exchange_name: config.exchange,
        fee_tier: config.feeTier,
        maker_fee: config.makerFee,
        taker_fee: config.takerFee,
        bnb_discount: config.bnbDiscount,
        okx_discount: config.okxDiscount,
      }));

      const { error } = await supabase
        .from('user_exchange_fees')
        .upsert(upserts, { onConflict: 'user_id,exchange_name' });

      if (error) throw error;

      toast.success('Fee settings saved!', {
        description: 'Position sizing will use your VIP tier rates.',
      });
    } catch (err) {
      console.error('Failed to save fee settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const getPositionForOneDollar = (exchange: string) => {
    const config = configs[exchange];
    if (!config) return null;
    
    const effectiveFee = config.takerFee * (config.bnbDiscount && exchange === 'binance' ? 0.75 : 1);
    return calculatePositionForOneDollarProfit(effectiveFee, 10000, exchange);
  };

  const getStandardPositionSize = (exchange: string) => {
    const standardFee = DEFAULT_EXCHANGE_FEES[exchange] || 0.001;
    return calculatePositionForOneDollarProfit(standardFee, 10000, exchange);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          <CardTitle>Exchange Fee Configuration</CardTitle>
        </div>
        <CardDescription>
          Configure your VIP tier and fee discounts for accurate position sizing calculations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {SUPPORTED_EXCHANGES.map((exchange) => {
          const config = configs[exchange];
          const tiers = getAvailableTiers(exchange);
          const positionResult = getPositionForOneDollar(exchange);
          const standardResult = getStandardPositionSize(exchange);
          const savings = standardResult && positionResult 
            ? standardResult.recommendedAmount - positionResult.recommendedAmount 
            : 0;

          return (
            <div key={exchange} className="p-4 rounded-lg bg-muted/30 border space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold capitalize">{exchange}</span>
                  <Badge variant="outline" className="text-xs">
                    {config?.feeTier || 'standard'}
                  </Badge>
                </div>
                {exchange === 'binance' && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`bnb-${exchange}`} className="text-xs text-muted-foreground">
                      BNB Discount (25%)
                    </Label>
                    <Switch
                      id={`bnb-${exchange}`}
                      checked={config?.bnbDiscount || false}
                      onCheckedChange={(checked) => handleDiscountToggle(exchange, checked)}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">VIP Tier</Label>
                  <Select
                    value={config?.feeTier || 'standard'}
                    onValueChange={(value) => handleTierChange(exchange, value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiers.map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          {tier === 'standard' ? 'Standard' : tier.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Effective Taker Fee</Label>
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md bg-background border">
                    <span className="font-mono text-sm">
                      {((config?.takerFee || 0.001) * (config?.bnbDiscount && exchange === 'binance' ? 0.75 : 1) * 100).toFixed(3)}%
                    </span>
                    {config?.bnbDiscount && exchange === 'binance' && (
                      <Badge variant="secondary" className="text-xs">
                        <TrendingDown className="w-3 h-3 mr-1" />
                        -25%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Position sizing impact */}
              <div className="p-3 rounded bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">$1 Profit Position Size</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-[200px]">
                          Position size needed to achieve $1 net profit after fees with 0.6% price move.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-primary">
                    ${positionResult?.recommendedAmount.toFixed(0) || '---'}
                  </span>
                  {savings > 0 && (
                    <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                      Saves ${savings.toFixed(0)} vs standard
                    </Badge>
                  )}
                </div>
                {positionResult && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Required move: {positionResult.requiredMovePercent.toFixed(3)}% • 
                    Fees: ${positionResult.feeImpactUsd.toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          Save Fee Settings
        </Button>
      </CardContent>
    </Card>
  );
}
