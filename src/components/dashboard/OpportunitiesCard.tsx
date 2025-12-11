import { opportunitiesData } from '@/lib/mockData';
import { TrendingUp } from 'lucide-react';

export function OpportunitiesCard() {
  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted-foreground">Opportunities</h3>
        <span className="live-indicator text-xs">
          <TrendingUp className="w-3 h-3" />
          {opportunitiesData.liveCount} Live
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-muted-foreground">Top Profit</span>
          <p className="text-2xl font-bold text-primary font-mono">
            +{opportunitiesData.topProfit.toFixed(2)}%
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Avg Profit</span>
          <p className="text-2xl font-bold text-primary font-mono">
            +{opportunitiesData.avgProfit.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          Cross-Ex <span className="text-primary">+{opportunitiesData.crossEx}%</span>
        </span>
        <span className="text-muted-foreground">
          Triangular <span className="text-primary">+{opportunitiesData.triangular}%</span>
        </span>
        <span className="text-muted-foreground">
          Funding <span className="text-primary">+{opportunitiesData.funding}%</span>
        </span>
      </div>
    </div>
  );
}
