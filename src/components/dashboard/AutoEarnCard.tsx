import { autoEarnData } from '@/lib/mockData';
import { Zap } from 'lucide-react';

export function AutoEarnCard() {
  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-muted-foreground">Auto Earn</h3>
        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded whitespace-nowrap">
          <Zap className="w-2.5 h-2.5 inline mr-0.5" />
          {autoEarnData.activeStrategies}/{autoEarnData.totalStrategies} Active
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <span className="text-[10px] text-muted-foreground block">24h Earnings</span>
          <p className="text-xl font-bold text-foreground font-mono">
            ${autoEarnData.earnings24h}
          </p>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Best Strategy</span>
          <p className="text-sm font-semibold text-foreground truncate" title={autoEarnData.bestStrategy}>
            {autoEarnData.bestStrategy}
          </p>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground mt-auto">
        Daily Profit Target{' '}
        <span className="text-primary">+{autoEarnData.dailyProfitTarget}%</span>
      </div>
    </div>
  );
}
