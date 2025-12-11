import { useState } from 'react';
import { arbitrageOpportunities } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ArbitrageTable() {
  const [opportunities, setOpportunities] = useState(arbitrageOpportunities);

  const handleAmountChange = (id: number, amount: number) => {
    setOpportunities((prev) =>
      prev.map((opp) =>
        opp.id === id
          ? {
              ...opp,
              amount,
              profitUsd: (amount * opp.profitPercent) / 100,
            }
          : opp
      )
    );
  };

  const getProfitColor = (percent: number) => {
    if (percent > 1) return 'text-primary';
    if (percent >= 0.5) return 'text-emerald-400';
    if (percent >= 0) return 'text-muted-foreground';
    return 'text-destructive';
  };

  return (
    <div className="card-terminal">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-foreground">Arbitrage Opportunities</h3>
          <span className="live-indicator">50 LIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Auto: 1h
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-terminal">
          <thead>
            <tr className="bg-secondary/50">
              <th>Pair</th>
              <th>Route</th>
              <th>Buy Price</th>
              <th>Sell Price</th>
              <th>Profit %</th>
              <th>Profit USD</th>
              <th>Volume 24H</th>
              <th>Expires</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.map((opp) => (
              <tr key={opp.id} className="hover:bg-secondary/30">
                <td className="font-medium text-foreground">{opp.pair}</td>
                <td className="text-muted-foreground text-sm">{opp.route}</td>
                <td className="font-mono text-foreground">
                  ${opp.buyPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="font-mono text-foreground">
                  ${opp.sellPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={cn('font-mono font-medium', getProfitColor(opp.profitPercent))}>
                  +{opp.profitPercent.toFixed(2)}%
                </td>
                <td className={cn('font-mono', getProfitColor(opp.profitPercent))}>
                  +${opp.profitUsd.toFixed(2)}
                </td>
                <td className="text-muted-foreground font-mono">{opp.volume24h}</td>
                <td>
                  <span className="flex items-center gap-1 text-warning font-mono">
                    <Clock className="w-3 h-3" />
                    {opp.expires}
                  </span>
                </td>
                <td>
                  <Input
                    type="number"
                    value={opp.amount}
                    onChange={(e) => handleAmountChange(opp.id, Number(e.target.value))}
                    className="w-20 h-8 text-sm font-mono bg-secondary border-border"
                  />
                </td>
                <td>
                  <span className={opp.type === 'CEX' ? 'badge-cex' : 'badge-defi'}>
                    {opp.type}
                  </span>
                </td>
                <td>
                  <Button size="sm" className="btn-primary h-7 px-4">
                    Trade
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
