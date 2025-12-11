import { PortfolioCard } from '@/components/dashboard/PortfolioCard';
import { OpportunitiesCard } from '@/components/dashboard/OpportunitiesCard';
import { AutoEarnCard } from '@/components/dashboard/AutoEarnCard';
import { AiSummaryCard } from '@/components/dashboard/AiSummaryCard';
import { VideoHighlights } from '@/components/dashboard/VideoHighlights';
import { ArbitrageTable } from '@/components/dashboard/ArbitrageTable';
import { NewsSidebar } from '@/components/dashboard/NewsSidebar';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Top Row - Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3">
          <PortfolioCard />
        </div>
        <div className="lg:col-span-3">
          <OpportunitiesCard />
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
          <ArbitrageTable />
        </div>

        {/* News Sidebar */}
        <div className="lg:col-span-3">
          <NewsSidebar />
        </div>
      </div>
    </div>
  );
}
