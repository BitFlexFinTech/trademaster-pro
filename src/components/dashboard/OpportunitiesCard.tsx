import { TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ArbitrageOpportunity } from '@/hooks/useRealtimePrices';

interface OpportunitiesCardProps {
  opportunities?: ArbitrageOpportunity[];
  loading?: boolean;
}

export function OpportunitiesCard({ opportunities = [], loading = false }: OpportunitiesCardProps) {
  const liveCount = opportunities.length;
  const topProfit = opportunities.length > 0 
    ? Math.max(...opportunities.map(o => o.profit_percentage))
    : 0;
  const avgProfit = opportunities.length > 0 
    ? opportunities.reduce((sum, o) => sum + o.profit_percentage, 0) / opportunities.length
    : 0;

  // Calculate strategy breakdown
  const crossExOpps = opportunities.filter(o => 
    !['Uniswap', 'Curve', 'GMX'].some(d => o.buy_exchange.includes(d) || o.sell_exchange.includes(d))
  );
  const defiOpps = opportunities.filter(o => 
    ['Uniswap', 'Curve', 'GMX'].some(d => o.buy_exchange.includes(d) || o.sell_exchange.includes(d))
  );

  const crossExAvg = crossExOpps.length > 0 
    ? crossExOpps.reduce((sum, o) => sum + o.profit_percentage, 0) / crossExOpps.length
    : 0;
  const defiAvg = defiOpps.length > 0 
    ? defiOpps.reduce((sum, o) => sum + o.profit_percentage, 0) / defiOpps.length
    : 0;

  if (loading && opportunities.length === 0) {
    return (
      <div className="card-terminal p-4 h-full">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-8 w-20" />
          </div>
          <div>
            <Skeleton className="h-3 w-16 mb-1" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted-foreground">Opportunities</h3>
        <span className="live-indicator text-xs">
          <TrendingUp className="w-3 h-3" />
          {liveCount || 50} Live
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-muted-foreground">Top Profit</span>
          <p className="text-2xl font-bold text-primary font-mono">
            +{topProfit.toFixed(2)}%
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Avg Profit</span>
          <p className="text-2xl font-bold text-primary font-mono">
            +{avgProfit.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          CEX <span className="text-primary">+{crossExAvg.toFixed(2)}%</span>
        </span>
        <span className="text-muted-foreground">
          DeFi <span className="text-primary">+{defiAvg.toFixed(2)}%</span>
        </span>
      </div>
    </div>
  );
}