import { useState, useEffect } from 'react';
import { RefreshCw, Bell, Clock, LogOut, User, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useNavigate } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export function Header() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { user, signOut } = useAuth();
  const { prices, loading, refreshData } = useRealtimePrices();
  const { mode: tradingMode, setMode: setTradingMode, virtualBalance, updateVirtualBalance } = useTradingMode();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const navigate = useNavigate();
  
  // Virtual balance editing state
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(virtualBalance));

  const handleSaveBalance = () => {
    const newBalance = parseFloat(balanceInput);
    if (!isNaN(newBalance) && newBalance >= 0) {
      updateVirtualBalance(newBalance);
      setEditingBalance(false);
    }
  };

  const handleResetBalance = () => {
    updateVirtualBalance(1000);
    setBalanceInput('1000');
    setEditingBalance(false);
  };

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

  const handleModeToggle = (checked: boolean) => {
    setTradingMode(checked ? 'live' : 'demo');
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

        {/* Demo/Live Toggle */}
        <div className="flex items-center gap-2 mr-4 flex-shrink-0 bg-secondary/50 rounded-lg px-3 py-1.5">
          <Label 
            htmlFor="trading-mode" 
            className={`text-xs font-medium cursor-pointer ${tradingMode === 'demo' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            Demo
          </Label>
          <Switch
            id="trading-mode"
            checked={tradingMode === 'live'}
            onCheckedChange={handleModeToggle}
            className="data-[state=checked]:bg-destructive"
          />
          <Label 
            htmlFor="trading-mode" 
            className={`text-xs font-medium cursor-pointer ${tradingMode === 'live' ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            Live
          </Label>
          {tradingMode === 'demo' && (
            <Popover open={editingBalance} onOpenChange={(open) => {
              setEditingBalance(open);
              if (open) setBalanceInput(String(virtualBalance));
            }}>
              <PopoverTrigger asChild>
                <button className="text-[10px] text-muted-foreground font-mono ml-1 hover:text-primary flex items-center gap-1 transition-colors">
                  ${virtualBalance.toFixed(0)}
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Virtual Balance</label>
                  <Input
                    type="number"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    className="h-8 text-sm"
                    min={0}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleSaveBalance}>
                      <Check className="w-3 h-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleResetBalance}>
                      Reset
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingBalance(false)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
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