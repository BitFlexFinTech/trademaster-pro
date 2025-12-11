import { useState, useEffect } from 'react';
import { RefreshCw, Bell, Clock, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user, signOut } = useAuth();
  const { prices, loading, refreshData } = useRealtimePrices();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  const handleRefresh = async () => {
    await refreshData();
    setLastRefresh(new Date());
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Use real prices or fallback to mock
  const tickerData = prices.length > 0 
    ? prices.map(p => ({
        symbol: p.symbol,
        price: p.price,
        change: p.change_24h || 0,
      }))
    : [
        { symbol: 'BTC', price: 97000, change: 2.5 },
        { symbol: 'ETH', price: 3400, change: -1.2 },
        { symbol: 'SOL', price: 180, change: 5.3 },
        { symbol: 'XRP', price: 2.1, change: 3.8 },
        { symbol: 'ADA', price: 0.95, change: -0.5 },
      ];

  // Duplicate ticker data for seamless scrolling
  const duplicatedTicker = [...tickerData, ...tickerData];

  return (
    <header className="h-14 bg-background border-b border-border sticky top-0 z-50">
      <div className="h-full flex items-center px-4">
        {/* Live Indicator */}
        <div className="live-indicator mr-4 flex-shrink-0">
          {loading ? 'UPDATING' : 'LIVE'}
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 text-muted-foreground text-sm mr-4 flex-shrink-0">
          <Clock className="w-4 h-4" />
          <span className="font-mono">{formatTime(currentTime)}</span>
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
          <span className="text-xs text-muted-foreground hidden md:block">
            Last refresh: {formatTime(lastRefresh)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <button className="relative text-muted-foreground hover:text-foreground">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="w-4 h-4" />
                <span className="hidden md:inline max-w-[100px] truncate">
                  {user?.email?.split('@')[0] || 'User'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                {user?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}