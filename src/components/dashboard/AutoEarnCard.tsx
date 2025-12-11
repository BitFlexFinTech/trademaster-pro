import { autoEarnData } from '@/lib/mockData';
import { Zap } from 'lucide-react';

export function AutoEarnCard() {
  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted-foreground">Auto Earn</h3>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
          <Zap className="w-3 h-3 inline mr-1" />
          {autoEarnData.activeStrategies}/{autoEarnData.totalStrategies} Active
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <span className="text-xs text-muted-foreground">24h Earnings</span>
          <p className="text-2xl font-bold text-foreground font-mono">
            ${autoEarnData.earnings24h}
          </p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Best Strategy</span>
          <p className="text-lg font-semibold text-foreground truncate">
            {autoEarnData.bestStrategy}
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Daily Profit Target{' '}
        <span className="text-primary">+{autoEarnData.dailyProfitTarget}%</span>
      </div>
    </div>
  );
}
