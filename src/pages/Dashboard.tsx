import { useEffect } from 'react';
import { PortfolioCard } from '@/components/dashboard/PortfolioCard';
import { BotStrategyAICard } from '@/components/dashboard/BotStrategyAICard';
import { BotSummaryCard } from '@/components/dashboard/BotSummaryCard';
import { AiSummaryCard } from '@/components/dashboard/AiSummaryCard';
import { VideoHighlights } from '@/components/dashboard/VideoHighlights';
import { GreenBackWidget } from '@/components/dashboard/GreenBackWidget';
import { NewsSidebar } from '@/components/dashboard/NewsSidebar';
import { JarvisEngineDashboard } from '@/components/dashboard/JarvisEngineDashboard';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useNotifications } from '@/hooks/useNotifications';

export default function Dashboard() {
  const { refreshData } = useRealtimePrices();
  const { requestPushPermission } = useNotifications();

  useEffect(() => {
    requestPushPermission();
  }, [requestPushPermission]);

  useEffect(() => {
    refreshData();
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top Row: Compact Jarvis + Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-shrink-0 mb-2">
        {/* Jarvis Engine - Compact */}
        <div className="lg:col-span-5 max-h-[140px] overflow-hidden">
          <JarvisEngineDashboard />
        </div>
        {/* Stats Cards */}
        <div className="lg:col-span-2 h-[100px] overflow-hidden">
          <PortfolioCard />
        </div>
        <div className="lg:col-span-2 h-[100px] overflow-hidden">
          <BotStrategyAICard />
        </div>
        <div className="lg:col-span-3 h-[100px] overflow-hidden">
          <AiSummaryCard />
        </div>
      </div>

      {/* Video Highlights - Prominent Row */}
      <div className="flex-shrink-0 mb-2 h-[220px]">
        <VideoHighlights />
      </div>

      {/* Main Content - Takes remaining space */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* GreenBack Bot Widget */}
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
