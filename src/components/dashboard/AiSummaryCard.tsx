import { aiSummaryData } from '@/lib/mockData';
import { Sparkles, TrendingUp } from 'lucide-react';

export function AiSummaryCard() {
  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-medium text-foreground">AI Daily Summary</h3>
        </div>
        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
          Updated {aiSummaryData.updatedAgo} ago
        </span>
      </div>

      <div className="space-y-2 text-xs flex-1 min-h-0 overflow-hidden">
        <div>
          <span className="text-muted-foreground text-[10px]">↗ Top 5 Opportunities Today</span>
          <div className="space-y-0.5 mt-0.5">
            {aiSummaryData.topOpportunities.map((opp, idx) => (
              <div key={idx} className="flex items-center justify-between gap-1">
                <span className="text-muted-foreground truncate text-[11px]">
                  {idx + 1}. {opp.pair} via {opp.route}
                </span>
                <span className="text-primary font-mono text-[11px] whitespace-nowrap flex-shrink-0">+{opp.profit.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1.5 border-t border-border">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-muted-foreground block">Best Strategy</span>
            <span className="text-foreground font-medium text-[11px] truncate block">{aiSummaryData.bestStrategy}</span>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="text-[10px] text-muted-foreground block">Yield</span>
            <span className="text-primary font-mono text-[11px]">+{aiSummaryData.bestStrategyProfit}%/day</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px]">
          <TrendingUp className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
          <span className="text-muted-foreground">Signals Win Rate:</span>
          <span className="text-primary font-mono">{aiSummaryData.signalsWinRate}%</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border">
          <div className="bg-secondary/50 p-1.5 rounded text-center">
            <span className="text-[10px] text-muted-foreground block">24h Profit</span>
            <span className="text-sm font-bold text-primary font-mono">
              +${aiSummaryData.profit24h.toLocaleString()}
            </span>
          </div>
          <div className="bg-secondary/50 p-1.5 rounded text-center">
            <span className="text-[10px] text-muted-foreground block">Trades</span>
            <span className="text-sm font-bold text-foreground font-mono">
              {aiSummaryData.trades24h}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
