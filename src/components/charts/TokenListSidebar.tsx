import { useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TokenListSidebarProps {
  selectedPair: string;
  onSelectPair: (pair: string) => void;
}

interface TokenData {
  symbol: string;
  displayName: string;
  price: number;
  change24h: number;
}

// Top 100 crypto pairs
const TOP_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT',
  'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'MATICUSDT', 'LTCUSDT', 'SHIBUSDT', 'TRXUSDT',
  'ATOMUSDT', 'UNIUSDT', 'ETCUSDT', 'XLMUSDT', 'NEARUSDT', 'BCHUSDT', 'APTUSDT',
  'FILUSDT', 'ALGOUSDT', 'VETUSDT', 'ICPUSDT', 'QNTUSDT', 'HBARUSDT', 'GRTUSDT',
  'FTMUSDT', 'SANDUSDT', 'EGLDUSDT', 'MANAUSDT', 'THETAUSDT', 'AXSUSDT', 'AAVEUSDT',
  'EOSUSDT', 'XTZUSDT', 'FLOWUSDT', 'CHZUSDT', 'RUNEUSDT', 'SNXUSDT', 'CRVUSDT',
  'LRCUSDT', 'MKRUSDT', 'ENJUSDT', 'BATUSDT', 'COMPUSDT', 'YFIUSDT', 'ZECUSDT',
  'DASHUSDT', 'NEOUSDT', 'WAVESUSDT', 'ZILUSDT', 'KSMUSDT', 'SUSHIUSDT', '1INCHUSDT',
  'GALAUSDT', 'ROSEUSDT', 'KAVAUSDT', 'ANKRUSDT', 'IOTAUSDT', 'ONTUSDT', 'CAKEUSDT',
  'CELRUSDT', 'SKLUSDT', 'RVNUSDT', 'ZENUSDT', 'SCUSDT', 'DYDXUSDT', 'GMTUSDT',
  'APEUSDT', 'WOOUSDT', 'OPUSDT', 'LDOUSDT', 'ARBUSDT', 'SUIUSDT', 'PEPEUSDT',
  'INJUSDT', 'STXUSDT', 'IMXUSDT', 'SEIUSDT', 'TIAUSDT', 'ORDIUSDT', 'WLDUSDT',
  'BLURUSDT', 'PENDLEUSDT', 'JUPUSDT', 'WUSDT', 'ENSUSDT', 'CFXUSDT', 'ARUSDT',
  'FETUSDT', 'AGIXUSDT', 'RENDERUSDT', 'KASUSDT', 'BONKUSDT', 'FLOKIUSDT', 'MEMEUSDT'
];

export function TokenListSidebar({ selectedPair, onSelectPair }: TokenListSidebarProps) {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();
        
        const filteredTokens = TOP_SYMBOLS.map(symbol => {
          const ticker = data.find((t: any) => t.symbol === symbol);
          if (ticker) {
            return {
              symbol: symbol,
              displayName: symbol.replace('USDT', '/USDT'),
              price: parseFloat(ticker.lastPrice),
              change24h: parseFloat(ticker.priceChangePercent),
            };
          }
          return null;
        }).filter(Boolean) as TokenData[];
        
        setTokens(filteredTokens);
      } catch (error) {
        console.error('Failed to fetch prices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredTokens = tokens.filter(token =>
    token.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  return (
    <div className="w-48 flex-shrink-0 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      {/* Token List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : (
            filteredTokens.map((token) => (
              <button
                key={token.symbol}
                onClick={() => onSelectPair(token.displayName)}
                className={cn(
                  'w-full px-2 py-1.5 text-left hover:bg-muted/50 transition-colors',
                  selectedPair === token.displayName && 'bg-primary/10 border-l-2 border-l-primary'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {token.displayName.split('/')[0]}
                  </span>
                  <span className={cn(
                    'text-[10px] flex items-center gap-0.5',
                    token.change24h >= 0 ? 'text-green-500' : 'text-red-500'
                  )}>
                    {token.change24h >= 0 ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    {Math.abs(token.change24h).toFixed(2)}%
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ${formatPrice(token.price)}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
