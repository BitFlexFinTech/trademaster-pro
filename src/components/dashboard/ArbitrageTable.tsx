import { useState, useEffect } from 'react';
import { arbitrageOpportunities } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArbitrageOpportunity } from '@/hooks/useRealtimePrices';
import { Skeleton } from '@/components/ui/skeleton';

interface ArbitrageTableProps {
  opportunities?: ArbitrageOpportunity[];
  loading?: boolean;
}

interface TableRow {
  id: string;
  pair: string;
  route: string;
  buyPrice: number;
  sellPrice: number;
  profitPercent: number;
  profitUsd: number;
  volume24h: string;
  expires: string;
  amount: number;
  type: 'CEX' | 'DeFi';
}

export function ArbitrageTable({ opportunities = [], loading = false }: ArbitrageTableProps) {
  const [tableData, setTableData] = useState<TableRow[]>([]);

  useEffect(() => {
    if (opportunities.length > 0) {
      const rows: TableRow[] = opportunities.map((opp) => ({
        id: opp.id,
        pair: opp.pair,
        route: `${opp.buy_exchange} → ${opp.sell_exchange}`,
        buyPrice: opp.buy_price,
        sellPrice: opp.sell_price,
        profitPercent: opp.profit_percentage,
        profitUsd: (1000 * opp.profit_percentage) / 100,
        volume24h: formatVolume(opp.volume_24h),
        expires: getTimeRemaining(opp.expires_at),
        amount: 1000,
        type: (['Uniswap', 'Curve', 'GMX', 'Aave', 'dYdX', 'Compound'].some(d => 
          opp.buy_exchange.includes(d) || opp.sell_exchange.includes(d)
        ) ? 'DeFi' : 'CEX') as 'CEX' | 'DeFi',
      }));
      setTableData(rows);
    } else {
      setTableData(arbitrageOpportunities.map(opp => ({
        ...opp,
        id: String(opp.id),
        type: opp.type as 'CEX' | 'DeFi',
      })));
    }
  }, [opportunities]);

  const handleAmountChange = (id: string, amount: number) => {
    setTableData((prev) =>
      prev.map((opp) =>
        opp.id === id
          ? { ...opp, amount, profitUsd: (amount * opp.profitPercent) / 100 }
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
    <div className="card-terminal flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground text-sm">Arbitrage Opportunities</h3>
          <span className="live-indicator text-[10px]">{tableData.length} LIVE</span>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Auto: 1h
        </Button>
      </div>

      {/* Table with vertical-only scroll */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden max-h-[400px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-secondary/95 backdrop-blur-sm">
            <tr>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-left whitespace-nowrap">Pair</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-left whitespace-nowrap">Route</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-right whitespace-nowrap">Buy</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-right whitespace-nowrap">Sell</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-right whitespace-nowrap">Profit %</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-right whitespace-nowrap">Profit $</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-right whitespace-nowrap">Vol 24H</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-center whitespace-nowrap">Expires</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-center whitespace-nowrap">Amount</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-center whitespace-nowrap">Type</th>
              <th className="text-muted-foreground font-medium uppercase tracking-wider py-2 px-2 text-center whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && tableData.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} className="py-2 px-2"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (
              tableData.map((opp) => (
                <tr key={opp.id} className="hover:bg-secondary/30 border-t border-border">
                  <td className="py-2 px-2 font-medium text-foreground whitespace-nowrap">{opp.pair}</td>
                  <td className="py-2 px-2 text-muted-foreground whitespace-nowrap max-w-[100px] truncate" title={opp.route}>{opp.route}</td>
                  <td className="py-2 px-2 font-mono text-foreground text-right whitespace-nowrap">
                    ${formatPrice(opp.buyPrice)}
                  </td>
                  <td className="py-2 px-2 font-mono text-foreground text-right whitespace-nowrap">
                    ${formatPrice(opp.sellPrice)}
                  </td>
                  <td className={cn('py-2 px-2 font-mono font-medium text-right whitespace-nowrap', getProfitColor(opp.profitPercent))}>
                    +{opp.profitPercent.toFixed(2)}%
                  </td>
                  <td className={cn('py-2 px-2 font-mono text-right whitespace-nowrap', getProfitColor(opp.profitPercent))}>
                    +${opp.profitUsd.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground font-mono text-right whitespace-nowrap">{opp.volume24h}</td>
                  <td className="py-2 px-2 text-center">
                    <span className="inline-flex items-center gap-0.5 text-warning font-mono whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5" />
                      {opp.expires}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Input
                      type="number"
                      value={opp.amount}
                      onChange={(e) => handleAmountChange(opp.id, Number(e.target.value))}
                      className="w-16 h-6 text-xs font-mono bg-secondary border-border text-center px-1"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap',
                      opp.type === 'CEX' 
                        ? 'bg-primary/20 text-primary border border-primary/30' 
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    )}>
                      {opp.type}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <Button size="sm" className="btn-primary h-6 px-3 text-xs">
                      Trade
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

function formatVolume(volume: number): string {
  if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}B`;
  if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
  if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

function getTimeRemaining(expiresAt: string): string {
  const now = new Date().getTime();
  const expiry = new Date(expiresAt).getTime();
  const diff = Math.max(0, expiry - now);
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
