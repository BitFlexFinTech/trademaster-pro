import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { LineChart, Bell, Maximize2, RotateCcw } from 'lucide-react';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];
const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'AVAX/USDT', 'BNB/USDT', 'ADA/USDT'];

export interface IndicatorSettings {
  sma20: boolean;
  sma50: boolean;
  ema20: boolean;
  rsi: boolean;
  macd: boolean;
  bollingerBands: boolean;
}

interface ChartToolbarProps {
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  selectedTimeframe: string;
  setSelectedTimeframe: (tf: string) => void;
  indicators: IndicatorSettings;
  setIndicators: (indicators: IndicatorSettings) => void;
  currentPrice: number | null;
  priceChange: number;
  onFullscreen?: () => void;
  onRefresh?: () => void;
}

export function ChartToolbar({
  selectedPair,
  setSelectedPair,
  selectedTimeframe,
  setSelectedTimeframe,
  indicators,
  setIndicators,
  currentPrice,
  priceChange,
  onFullscreen,
  onRefresh,
}: ChartToolbarProps) {
  const toggleIndicator = (key: keyof IndicatorSettings) => {
    setIndicators({ ...indicators, [key]: !indicators[key] });
  };

  return (
    <div className="flex items-center justify-between p-2 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        {/* Symbol Selector */}
        <Select value={selectedPair} onValueChange={setSelectedPair}>
          <SelectTrigger className="w-32 h-8 bg-secondary border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {PAIRS.map((pair) => (
              <SelectItem key={pair} value={pair}>{pair}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Timeframe Buttons */}
        <div className="flex items-center gap-0.5 bg-secondary rounded p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                selectedTimeframe === tf
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicators Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <LineChart className="w-3.5 h-3.5" />
              Indicators
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-popover border-border z-50">
            <DropdownMenuLabel className="text-xs">Moving Averages</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={indicators.sma20}
              onCheckedChange={() => toggleIndicator('sma20')}
            >
              SMA (20)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={indicators.sma50}
              onCheckedChange={() => toggleIndicator('sma50')}
            >
              SMA (50)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={indicators.ema20}
              onCheckedChange={() => toggleIndicator('ema20')}
            >
              EMA (20)
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Oscillators</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={indicators.rsi}
              onCheckedChange={() => toggleIndicator('rsi')}
            >
              RSI (14)
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={indicators.macd}
              onCheckedChange={() => toggleIndicator('macd')}
            >
              MACD (12, 26, 9)
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Bands</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={indicators.bollingerBands}
              onCheckedChange={() => toggleIndicator('bollingerBands')}
            >
              Bollinger Bands (20, 2)
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Alert Button */}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Bell className="w-3.5 h-3.5" />
          Alert
        </Button>
      </div>

      <div className="flex items-center gap-3">
        {/* Price Display */}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{selectedPair}</p>
          <p className={`font-mono text-sm font-medium ${priceChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
            ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}
            <span className="ml-1.5 text-xs">
              ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onRefresh}>
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onFullscreen}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
