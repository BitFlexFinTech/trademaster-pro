import { portfolioData } from '@/lib/mockData';
import { TrendingUp } from 'lucide-react';

export function PortfolioCard() {
  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-muted-foreground">Portfolio Value</h3>
        <div className="flex items-center gap-0.5 text-primary text-xs">
          <TrendingUp className="w-3 h-3" />
          +{portfolioData.changePercent}%
        </div>
      </div>
      
      <div className="mb-2">
        <span className="text-2xl font-bold text-foreground font-mono">
          ${portfolioData.totalValue.toLocaleString()}
        </span>
        <p className="text-xs text-primary mt-0.5">
          +${portfolioData.change24h.toLocaleString()} (24h)
        </p>
      </div>

      <div className="space-y-1.5 flex-1">
        {portfolioData.holdings.map((holding) => (
          <div key={holding.symbol} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{holding.symbol}</span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono">
                ${holding.value.toLocaleString()}
              </span>
              <span className="text-primary text-[11px]">{holding.percent}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
