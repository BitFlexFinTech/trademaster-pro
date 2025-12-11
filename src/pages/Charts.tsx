import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChartToolbar, type IndicatorSettings } from '@/components/charts/ChartToolbar';
import { DrawingToolsSidebar, type DrawingTool } from '@/components/charts/DrawingToolsSidebar';
import { ChartRightSidebar } from '@/components/charts/ChartRightSidebar';
import { TradingChart } from '@/components/charts/TradingChart';
import { useChartData } from '@/hooks/useChartData';
import { Loader2 } from 'lucide-react';

export default function Charts() {
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState('4h');
  const [activeTool, setActiveTool] = useState<DrawingTool>('crosshair');
  const [indicators, setIndicators] = useState<IndicatorSettings>({
    sma20: false,
    sma50: false,
    ema20: false,
    rsi: false,
    macd: false,
    bollingerBands: false,
  });

  const { data, loading, error, currentPrice, refetch } = useChartData(selectedPair, selectedTimeframe);

  // Calculate price change from data
  const priceChange = data.length >= 2 
    ? ((data[data.length - 1].close - data[0].close) / data[0].close) * 100 
    : 0;

  const handleFullscreen = () => {
    const elem = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      elem.requestFullscreen();
    }
  };

  const handleClearDrawings = () => {
    // Drawing persistence would be handled here
    console.log('Clear drawings');
  };

  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-background">
        {/* Top Toolbar */}
        <ChartToolbar
          selectedPair={selectedPair}
          setSelectedPair={setSelectedPair}
          selectedTimeframe={selectedTimeframe}
          setSelectedTimeframe={setSelectedTimeframe}
          indicators={indicators}
          setIndicators={setIndicators}
          currentPrice={currentPrice}
          priceChange={priceChange}
          onFullscreen={handleFullscreen}
          onRefresh={refetch}
        />

        <div className="flex-1 flex min-h-0">
          {/* Left Drawing Tools */}
          <DrawingToolsSidebar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            onClearDrawings={handleClearDrawings}
          />

          {/* Main Chart Area */}
          <div className="flex-1 flex flex-col bg-background min-w-0">
            {loading && data.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-destructive">
                <p>Error loading chart data: {error}</p>
              </div>
            ) : (
              <TradingChart data={data} indicators={indicators} />
            )}
          </div>

          {/* Right Sidebar */}
          <ChartRightSidebar
            symbol={selectedPair}
            data={data}
            currentPrice={currentPrice}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
