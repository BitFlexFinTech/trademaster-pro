import { ArbitrageTable } from '@/components/dashboard/ArbitrageTable';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { ArrowRightLeft } from 'lucide-react';

export default function Arbitrage() {
  const { opportunities, loading, refreshData } = useRealtimePrices();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <ArrowRightLeft className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Arbitrage Opportunities</h1>
        <span className="live-indicator">{opportunities.length} LIVE</span>
      </div>

      <div className="flex-1 min-h-0">
        <ArbitrageTable opportunities={opportunities} loading={loading} />
      </div>
    </div>
  );
}
