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
  const { requestPushPermission } = useNotifications();

  useEffect(() => {
    requestPushPermission();
  }, [requestPushPermission]);

  useEffect(() => {
    refreshData();
  }, []);

  return (
    <div className="space-y-4">
      {/* Top Row - Stats Cards - Match screenshot layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-2">
          <PortfolioCard />
        </div>
        <div className="lg:col-span-2">
          <OpportunitiesCard opportunities={opportunities} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <AutoEarnCard />
        </div>
        <div className="lg:col-span-3">
          <AiSummaryCard />
        </div>
        <div className="lg:col-span-3">
          <VideoHighlights />
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
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
