import { portfolioData } from '@/lib/mockData';
import { TrendingUp } from 'lucide-react';

export function PortfolioCard() {
  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm text-muted-foreground">Portfolio Value</h3>
        <div className="flex items-center gap-1 text-primary text-sm">
          <TrendingUp className="w-4 h-4" />
          +{portfolioData.changePercent}%
        </div>
      </div>
      
      <div className="mb-3">
        <span className="text-3xl font-bold text-foreground font-mono">
          ${portfolioData.totalValue.toLocaleString()}
        </span>
        <p className="text-sm text-primary mt-1">
          +${portfolioData.change24h.toLocaleString()} (24h)
        </p>
      </div>

      <div className="space-y-2">
        {portfolioData.holdings.map((holding) => (
          <div key={holding.symbol} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{holding.symbol}</span>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-mono">
                ${holding.value.toLocaleString()}
              </span>
              <span className="text-primary">{holding.percent}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
