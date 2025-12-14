import { useEffect } from 'react';
import { PortfolioCard } from '@/components/dashboard/PortfolioCard';
import { OpportunitiesCard } from '@/components/dashboard/OpportunitiesCard';
import { AutoEarnCard } from '@/components/dashboard/AutoEarnCard';
import { AiSummaryCard } from '@/components/dashboard/AiSummaryCard';
import { VideoHighlights } from '@/components/dashboard/VideoHighlights';
import { GreenBackWidget } from '@/components/dashboard/GreenBackWidget';
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top Row - Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 flex-shrink-0 mb-4">
        <div className="lg:col-span-2 h-[140px] overflow-hidden">
          <PortfolioCard />
        </div>
        <div className="lg:col-span-2 h-[140px] overflow-hidden">
          <OpportunitiesCard opportunities={opportunities} loading={loading} />
        </div>
        <div className="lg:col-span-2 h-[140px] overflow-hidden">
          <AutoEarnCard />
        </div>
        <div className="lg:col-span-3 h-[140px] overflow-hidden">
          <AiSummaryCard />
        </div>
        <div className="lg:col-span-3 h-[220px] overflow-hidden">
          <VideoHighlights />
        </div>
      </div>

      {/* Main Content - Takes remaining space */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* GreenBack Bot Widget - replaces Arbitrage table */}
        <div className="lg:col-span-9 min-h-0 overflow-hidden">
          <GreenBackWidget />
        </div>

        {/* News Sidebar */}
        <div className="lg:col-span-3 min-h-0 overflow-hidden">
          <NewsSidebar />
        </div>
      </div>
    </div>
  );
}
