import { useEffect } from 'react';
import { PortfolioCard } from '@/components/dashboard/PortfolioCard';
import { OpportunitiesCard } from '@/components/dashboard/OpportunitiesCard';
import { AutoEarnCard } from '@/components/dashboard/AutoEarnCard';
import { AiSummaryCard } from '@/components/dashboard/AiSummaryCard';
import { VideoHighlights } from '@/components/dashboard/VideoHighlights';
import { ArbitrageTable } from '@/components/dashboard/ArbitrageTable';
import { NewsSidebar } from '@/components/dashboard/NewsSidebar';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useNotifications } from '@/hooks/useNotifications';

export default function Dashboard() {
  const { opportunities, loading, refreshData } = useRealtimePrices();
  const { notifyHighProfit, requestPushPermission } = useNotifications();

  // Request push notification permission on mount
  useEffect(() => {
    requestPushPermission();
  }, [requestPushPermission]);

  // Check for high-profit opportunities and notify
  useEffect(() => {
    if (opportunities.length > 0) {
      const highProfitOpps = opportunities.filter(opp => opp.profit_percentage >= 1);
      if (highProfitOpps.length > 0) {
        const topOpp = highProfitOpps[0];
        notifyHighProfit(
          topOpp.pair,
          topOpp.profit_percentage,
          topOpp.buy_exchange,
          topOpp.sell_exchange
        );
      }
    }
  }, [opportunities, notifyHighProfit]);

  // Initial data fetch
  useEffect(() => {
    refreshData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Row - Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <PortfolioCard />
        </div>
        <div className="lg:col-span-3">
          <OpportunitiesCard opportunities={opportunities} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <AutoEarnCard />
        </div>
        <div className="lg:col-span-2">
          <AiSummaryCard />
        </div>
        <div className="lg:col-span-2">
          <VideoHighlights />
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Arbitrage Table */}
        <div className="lg:col-span-9">
          <ArbitrageTable opportunities={opportunities} loading={loading} />
        </div>

        {/* News Sidebar */}
        <div className="lg:col-span-3">
          <NewsSidebar />
        </div>
      </div>
    </div>
  );
}