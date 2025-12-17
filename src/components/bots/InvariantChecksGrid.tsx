import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InvariantCheckResult } from '@/lib/selfAuditReporter';

interface InvariantChecksGridProps {
  invariants: Record<string, InvariantCheckResult>;
}

const CHECK_LABELS: Record<string, string> = {
  balanceFloor: 'Balance Floor (S)',
  noProfitReuse: 'No Profit Reuse',
  profitSegregation: 'Profit Segregation',
  minProfitEnforced: 'Min Profit Enforced',
  symmetricLogic: 'Symmetric Logic',
  speedAdjustment: 'Speed Adjustment',
};

export function InvariantChecksGrid({ invariants }: InvariantChecksGridProps) {
  const entries = Object.entries(invariants);

  if (entries.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        No invariant checks available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([key, check]) => {
        const isPassing = check.status === 'PASS';
        const Icon = isPassing ? CheckCircle2 : XCircle;
        const label = CHECK_LABELS[key] || check.name || key;

        return (
          <div
            key={key}
            className={cn(
              'p-2 rounded border',
              isPassing 
                ? 'bg-primary/5 border-primary/20' 
                : 'bg-destructive/5 border-destructive/20'
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon 
                className={cn(
                  'w-3 h-3',
                  isPassing ? 'text-primary' : 'text-destructive'
                )} 
              />
              <Badge 
                variant={isPassing ? 'default' : 'destructive'} 
                className="text-[8px] px-1"
              >
                {check.status}
              </Badge>
            </div>
            <p className="text-[9px] font-medium text-foreground truncate">
              {label}
            </p>
            {check.details && (
              <p className="text-[8px] text-muted-foreground mt-0.5 line-clamp-2">
                {check.details}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
