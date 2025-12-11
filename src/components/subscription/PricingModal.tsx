import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Building } from 'lucide-react';
import { useSubscription, PlanType, PLAN_LIMITS } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';

interface PricingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRICING = {
  free: { price: 0, period: 'forever' },
  pro: { price: 29, period: 'month' },
  enterprise: { price: 99, period: 'month' },
};

const PLAN_ICONS = {
  free: Zap,
  pro: Crown,
  enterprise: Building,
};

export function PricingModal({ open, onOpenChange }: PricingModalProps) {
  const { plan: currentPlan, upgradePlan } = useSubscription();
  const [loading, setLoading] = useState<PlanType | null>(null);
  const { toast } = useToast();

  const handleUpgrade = async (newPlan: PlanType) => {
    if (newPlan === currentPlan) return;
    
    setLoading(newPlan);
    
    // Simulate checkout process
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      await upgradePlan(newPlan);
      toast({
        title: 'Plan Updated!',
        description: `You're now on the ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} plan.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update plan. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-2xl text-foreground">Choose Your Plan</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Select the plan that best fits your trading needs
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {(['free', 'pro', 'enterprise'] as PlanType[]).map((planType) => {
            const Icon = PLAN_ICONS[planType];
            const pricing = PRICING[planType];
            const limits = PLAN_LIMITS[planType];
            const isCurrentPlan = currentPlan === planType;
            const isPopular = planType === 'pro';

            return (
              <div
                key={planType}
                className={`relative rounded-xl p-6 border ${
                  isPopular
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-muted/30'
                }`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Most Popular
                  </Badge>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    isPopular ? 'bg-primary/20' : 'bg-muted'
                  }`}>
                    <Icon className={`w-5 h-5 ${isPopular ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground capitalize">
                    {planType}
                  </h3>
                </div>

                <div className="mb-6">
                  <span className="text-3xl font-bold text-foreground">
                    ${pricing.price}
                  </span>
                  <span className="text-muted-foreground">/{pricing.period}</span>
                </div>

                <ul className="space-y-3 mb-6">
                  {limits.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${isPopular ? 'btn-primary' : ''}`}
                  variant={isPopular ? 'default' : 'outline'}
                  disabled={isCurrentPlan || loading !== null}
                  onClick={() => handleUpgrade(planType)}
                >
                  {loading === planType
                    ? 'Processing...'
                    : isCurrentPlan
                    ? 'Current Plan'
                    : planType === 'free'
                    ? 'Downgrade'
                    : 'Upgrade'}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          All plans include 7-day money-back guarantee. Cancel anytime.
        </p>
      </DialogContent>
    </Dialog>
  );
}
