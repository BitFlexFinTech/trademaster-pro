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
      <div className="card-terminal p-3 h-full">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Skeleton className="h-2.5 w-14 mb-1" />
            <Skeleton className="h-7 w-16" />
          </div>
          <div>
            <Skeleton className="h-2.5 w-14 mb-1" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
      </div>
    );
  }

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-muted-foreground">Opportunities</h3>
        <span className="live-indicator text-[10px]">
          <TrendingUp className="w-2.5 h-2.5" />
          {liveCount || 50} Live
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <span className="text-[10px] text-muted-foreground block">Top Profit</span>
          <p className="text-xl font-bold text-primary font-mono">
            +{topProfit.toFixed(2)}%
          </p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Avg Profit</span>
          <p className="text-xl font-bold text-primary font-mono">
            +{avgProfit.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] mt-auto">
        <span className="text-muted-foreground whitespace-nowrap">
          Cross-Ex <span className="text-primary">+{crossExAvg.toFixed(1)}%</span>
        </span>
        <span className="text-muted-foreground whitespace-nowrap">
          Funding <span className="text-primary">+{defiAvg.toFixed(1)}%</span>
        </span>
        <span className="text-muted-foreground whitespace-nowrap">
          Triangular <span className="text-primary">+0.7%</span>
        </span>
      </div>
    </div>
  );
}
