import { Target, SlidersHorizontal, Bot, BarChart3, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TipCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}

function TipCard({ icon: Icon, title, description, action, onClick }: TipCardProps) {
  return (
    <div className="bg-background/50 rounded-lg p-2 border border-border/30">
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-md bg-primary/10">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-medium text-foreground">{title}</h4>
          <p className="text-[10px] text-muted-foreground line-clamp-2">{description}</p>
          {action && onClick && (
            <Button
              size="sm"
              variant="link"
              onClick={onClick}
              className="h-auto p-0 text-[10px] text-primary mt-0.5"
            >
              {action} →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface BotsOnboardingTipsProps {
  onDismiss: () => void;
  onOpenWizard?: () => void;
  className?: string;
}

export function BotsOnboardingTips({ onDismiss, onOpenWizard, className }: BotsOnboardingTipsProps) {
  return (
    <div className={cn(
      "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-300",
      className
    )}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/20">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm mb-1">
            Welcome to GreenBack Trading Bots! 👋
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Let's get you set up for optimal trading. Here are a few tips to get started:
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <TipCard
              icon={Target}
              title="Set Your Target"
              description="Use the Profit Target Wizard for optimal daily goals"
              action="Open Wizard"
              onClick={onOpenWizard}
            />
            <TipCard
              icon={SlidersHorizontal}
              title="Quick Adjust"
              description="Click the slider icon on bot cards for quick changes"
            />
            <TipCard
              icon={Bot}
              title="Choose Mode"
              description="Start with Spot for lower risk, Leverage for higher potential"
            />
            <TipCard
              icon={BarChart3}
              title="Track Performance"
              description="Monitor P&L, hit rate, and trades in real-time"
            />
          </div>

          <div className="flex gap-2">
            {onOpenWizard && (
              <Button size="sm" onClick={onOpenWizard} className="h-7 text-xs gap-1">
                <Target className="w-3 h-3" />
                Open Profit Target Wizard
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onDismiss} className="h-7 text-xs">
              Got it, don't show again
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss} className="h-6 w-6 p-0 shrink-0">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
