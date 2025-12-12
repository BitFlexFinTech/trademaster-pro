import { useStrategies } from '@/hooks/useStrategies';
import { Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function AutoEarnCard() {
  const { strategies, activeCount, totalEarnings, loading } = useStrategies();

  if (loading) {
    return (
      <div className="card-terminal p-3 h-full flex flex-col">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  const bestStrategy = strategies.find(s => s.status === 'running') || strategies[0];

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-muted-foreground">Auto Earn</h3>
        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded whitespace-nowrap">
          <Zap className="w-2.5 h-2.5 inline mr-0.5" />
          {activeCount}/{strategies.length} Active
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <span className="text-[10px] text-muted-foreground block">24h Earnings</span>
          <p className="text-xl font-bold text-foreground font-mono">
            ${totalEarnings.toFixed(2)}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Best Strategy</span>
          <p className="text-sm font-semibold text-foreground truncate" title={bestStrategy?.name}>
            {bestStrategy?.name || 'None active'}
          </p>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground mt-auto">
        Est. Daily Profit{' '}
        <span className="text-primary">{bestStrategy?.dailyProfit || '0%'}</span>
      </div>
    </div>
  );
}
