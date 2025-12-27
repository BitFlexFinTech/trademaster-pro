import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Bell, Save, RotateCcw, TrendingUp, TrendingDown, 
  Minus, ChevronDown, AlertTriangle, Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RegimeThreshold {
  profitWarning: number;
  profitCritical: number;
  lossWarning: number;
  lossCritical: number;
}

interface RegimeAlertConfig {
  BULL: RegimeThreshold;
  BEAR: RegimeThreshold;
  CHOP: RegimeThreshold;
}

const DEFAULT_THRESHOLDS: RegimeAlertConfig = {
  BULL: { profitWarning: 2.0, profitCritical: 5.0, lossWarning: -1.0, lossCritical: -3.0 },
  BEAR: { profitWarning: 1.5, profitCritical: 3.0, lossWarning: -0.5, lossCritical: -2.0 },
  CHOP: { profitWarning: 1.0, profitCritical: 2.0, lossWarning: -0.3, lossCritical: -1.0 },
};

export function RegimeAlertThresholds() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [thresholds, setThresholds] = useState<RegimeAlertConfig>(DEFAULT_THRESHOLDS);
  const [saving, setSaving] = useState(false);
  const [openRegimes, setOpenRegimes] = useState<Record<string, boolean>>({
    BULL: true,
    BEAR: false,
    CHOP: false,
  });

  useEffect(() => {
    if (!user) return;
    
    const loadThresholds = async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('regime_alert_thresholds')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data?.regime_alert_thresholds && typeof data.regime_alert_thresholds === 'object') {
        setThresholds(data.regime_alert_thresholds as unknown as RegimeAlertConfig);
      }
    };
    
    loadThresholds();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from('user_settings')
          .update({ regime_alert_thresholds: thresholds as any })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id, regime_alert_thresholds: thresholds as any });
        if (error) throw error;
      }
      toast.success('Alert thresholds saved');
    } catch (err) {
      console.error('Failed to save thresholds:', err);
      toast.error('Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
  };

  const updateThreshold = (regime: keyof RegimeAlertConfig, field: keyof RegimeThreshold, value: number) => {
    setThresholds(prev => ({
      ...prev,
      [regime]: {
        ...prev[regime],
        [field]: value,
      },
    }));
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
      case 'BULL': return 'border-emerald-500/50 bg-emerald-500/10';
      case 'BEAR': return 'border-red-500/50 bg-red-500/10';
      default: return 'border-amber-500/50 bg-amber-500/10';
    }
  };

  const ThresholdSection = ({ regime, config }: { regime: keyof RegimeAlertConfig; config: RegimeThreshold }) => (
    <Collapsible 
      open={openRegimes[regime]} 
      onOpenChange={(open) => setOpenRegimes(prev => ({ ...prev, [regime]: open }))}
    >
      <CollapsibleTrigger className={cn(
        "flex items-center justify-between w-full p-3 rounded-lg border transition-colors",
        getRegimeColor(regime)
      )}>
        <div className="flex items-center gap-2">
          {getRegimeIcon(regime)}
          <span className="font-medium">{regime} Regime</span>
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 transition-transform",
          openRegimes[regime] && "rotate-180"
        )} />
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          {/* Profit Thresholds */}
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              Profit Alerts
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Warning ($)</Label>
                <Input
                  type="number"
                  value={config.profitWarning}
                  onChange={(e) => updateThreshold(regime, 'profitWarning', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 text-xs"
                  step={0.5}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Critical ($)</Label>
                <Input
                  type="number"
                  value={config.profitCritical}
                  onChange={(e) => updateThreshold(regime, 'profitCritical', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 text-xs"
                  step={0.5}
                />
              </div>
            </div>
          </div>

          {/* Loss Thresholds */}
          <div className="space-y-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              Loss Alerts
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Warning ($)</Label>
                <Input
                  type="number"
                  value={config.lossWarning}
                  onChange={(e) => updateThreshold(regime, 'lossWarning', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 text-xs"
                  step={0.5}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Critical ($)</Label>
                <Input
                  type="number"
                  value={config.lossCritical}
                  onChange={(e) => updateThreshold(regime, 'lossCritical', parseFloat(e.target.value) || 0)}
                  className="w-20 h-8 text-xs"
                  step={0.5}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview badges */}
        <div className="flex flex-wrap gap-1 pt-2 border-t border-border">
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/50">
            Profit ≥ ${config.profitWarning}: Info
          </Badge>
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/50">
            Profit ≥ ${config.profitCritical}: Celebrate
          </Badge>
          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/50">
            Loss ≤ ${config.lossWarning}: Warning
          </Badge>
          <Badge variant="outline" className="text-[10px] text-red-400 border-red-500/50">
            Loss ≤ ${config.lossCritical}: Critical
          </Badge>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Regime-Based Alert Thresholds
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-xs text-muted-foreground">
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Set different alert thresholds for each market regime. More aggressive in BULL, 
          conservative in BEAR, and tight in CHOP.
        </p>

        {/* Regime Sections */}
        <div className="space-y-3">
          <ThresholdSection regime="BULL" config={thresholds.BULL} />
          <ThresholdSection regime="BEAR" config={thresholds.BEAR} />
          <ThresholdSection regime="CHOP" config={thresholds.CHOP} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            size="sm" 
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-3 w-3 mr-1" />
            {saving ? 'Saving...' : 'Save Thresholds'}
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleReset}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}