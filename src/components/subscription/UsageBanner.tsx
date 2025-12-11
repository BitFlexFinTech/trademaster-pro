import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, Crown } from 'lucide-react';
import { PricingModal } from './PricingModal';

export function UsageBanner() {
  const { plan, signalsUsed, tradesUsed, limits } = useSubscription();
  const [showPricing, setShowPricing] = useState(false);

  if (plan === 'enterprise' as string) return null;

  const signalProgress = limits.signalsPerDay === -1 ? 0 : (signalsUsed / limits.signalsPerDay) * 100;
  const tradeProgress = limits.tradesPerDay === -1 ? 0 : (tradesUsed / limits.tradesPerDay) * 100;
  const isNearLimit = signalProgress > 80 || tradeProgress > 80;

  return (
    <>
      <div className={`p-3 rounded-lg border ${
        isNearLimit ? 'bg-destructive/10 border-destructive/30' : 'bg-muted/30 border-border'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${isNearLimit ? 'text-destructive' : 'text-primary'}`} />
            <span className="text-sm font-medium text-foreground capitalize">{plan} Plan</span>
          </div>
          {plan !== 'enterprise' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-primary hover:text-primary/80 h-7 px-2"
              onClick={() => setShowPricing(true)}
            >
              <Crown className="w-3 h-3 mr-1" />
              Upgrade
            </Button>
          )}
        </div>

        {limits.signalsPerDay !== -1 && (
          <div className="space-y-1 mb-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Signals</span>
              <span className={signalProgress > 80 ? 'text-destructive' : 'text-muted-foreground'}>
                {signalsUsed}/{limits.signalsPerDay}
              </span>
            </div>
            <Progress value={signalProgress} className="h-1.5" />
          </div>
        )}

        {limits.tradesPerDay !== -1 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Trades</span>
              <span className={tradeProgress > 80 ? 'text-destructive' : 'text-muted-foreground'}>
                {tradesUsed}/{limits.tradesPerDay}
              </span>
            </div>
            <Progress value={tradeProgress} className="h-1.5" />
          </div>
        )}

        {isNearLimit && (
          <p className="text-xs text-destructive mt-2">
            Approaching daily limit. Upgrade for more.
          </p>
        )}
      </div>

      <PricingModal open={showPricing} onOpenChange={setShowPricing} />
    </>
  );
}
