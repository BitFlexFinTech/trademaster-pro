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

  // Transform API data to table rows
  useEffect(() => {
    if (opportunities.length > 0) {
      const rows: TableRow[] = opportunities.map((opp, index) => ({
        id: opp.id,
        pair: opp.pair,
        route: `${opp.buy_exchange} → ${opp.sell_exchange}`,
        buyPrice: opp.buy_price,
        sellPrice: opp.sell_price,
        profitPercent: opp.profit_percentage,
        profitUsd: (1000 * opp.profit_percentage) / 100, // Default 1000 USDT
        volume24h: formatVolume(opp.volume_24h),
        expires: getTimeRemaining(opp.expires_at),
        amount: 1000,
        type: (['Uniswap', 'Curve', 'GMX', 'Aave'].some(d => 
          opp.buy_exchange.includes(d) || opp.sell_exchange.includes(d)
        ) ? 'DeFi' : 'CEX') as 'CEX' | 'DeFi',
      }));
      setTableData(rows);
    } else {
      // Fall back to mock data
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
          <span className="live-indicator">{tableData.length} LIVE</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Auto: 1m
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
            {loading && tableData.length === 0 ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j}><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (
              tableData.map((opp) => (
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
                    {opp.profitPercent >= 0 ? '+' : ''}{opp.profitPercent.toFixed(2)}%
                  </td>
                  <td className={cn('font-mono', getProfitColor(opp.profitPercent))}>
                    {opp.profitUsd >= 0 ? '+' : ''}${opp.profitUsd.toFixed(2)}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}