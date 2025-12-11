import { aiSummaryData } from '@/lib/mockData';
import { Sparkles, TrendingUp } from 'lucide-react';

export function AiSummaryCard() {
  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">AI Daily Summary</h3>
        </div>
        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
          Updated {aiSummaryData.updatedAgo} ago
        </span>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">↗ Top 5 Opportunities Today</span>
          <div className="space-y-1 mt-1">
            {aiSummaryData.topOpportunities.map((opp, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {idx + 1}. {opp.pair} via {opp.route}
                </span>
                <span className="text-primary font-mono">+{opp.profit.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-border">
          <div className="flex-1">
            <span className="text-xs text-muted-foreground block">Best Strategy</span>
            <span className="text-foreground font-medium">{aiSummaryData.bestStrategy}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Yield</span>
            <span className="text-primary font-mono">+{aiSummaryData.bestStrategyProfit}%/day</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Signals Win Rate:</span>
          <span className="text-primary font-mono">{aiSummaryData.signalsWinRate}%</span>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
          <div className="card-terminal bg-secondary/50 p-2 rounded text-center">
            <span className="text-xs text-muted-foreground block">24h Profit</span>
            <span className="text-lg font-bold text-primary font-mono">
              +${aiSummaryData.profit24h.toLocaleString()}
            </span>
          </div>
          <div className="card-terminal bg-secondary/50 p-2 rounded text-center">
            <span className="text-xs text-muted-foreground block">Trades</span>
            <span className="text-lg font-bold text-foreground font-mono">
              {aiSummaryData.trades24h}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
