import { useState, useEffect } from 'react';
import { tickerData } from '@/lib/mockData';
import { RefreshCw, Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const handleRefresh = () => {
    setLastRefresh(new Date());
  };

  // Duplicate ticker data for seamless scrolling
  const duplicatedTicker = [...tickerData, ...tickerData];

  return (
    <header className="h-14 bg-background border-b border-border sticky top-0 z-50">
      <div className="h-full flex items-center px-4">
        {/* Live Indicator */}
        <div className="live-indicator mr-4 flex-shrink-0">
          LIVE
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 text-muted-foreground text-sm mr-4 flex-shrink-0">
          <Clock className="w-4 h-4" />
          <span className="font-mono">{formatTime(currentTime)}</span>
          <span className="text-primary font-medium">{portfolioChange}%</span>
        </div>

        {/* Ticker Tape */}
        <div className="flex-1 overflow-hidden mx-4">
          <div className="ticker-scroll flex items-center gap-6 whitespace-nowrap">
            {duplicatedTicker.map((item, index) => (
              <div key={`${item.symbol}-${index}`} className="flex items-center gap-2">
                <span className="font-medium text-foreground">{item.symbol}</span>
                <span className="text-muted-foreground font-mono">
                  ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`font-mono text-sm ${
                    item.change >= 0 ? 'text-primary' : 'text-destructive'
                  }`}
                >
                  {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            Last refresh: {formatTime(lastRefresh)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <button className="relative text-muted-foreground hover:text-foreground">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
          </button>
        </div>
      </div>
    </header>
  );
}

const portfolioChange = '1.87';
