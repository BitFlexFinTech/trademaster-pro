import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, 
  ReferenceLine, Area, ComposedChart 
} from 'recharts';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, DollarSign, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Trade {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  amount: number;
  profitLoss: number;
  profitPercent: number;
  createdAt: Date;
  closedAt?: Date;
  exchange?: string;
}

interface TradeReplayModalProps {
  open: boolean;
  onClose: () => void;
  trades: Trade[];
  initialTradeIndex?: number;
}

// Generate mock price data around entry/exit for visualization
function generatePriceData(entryPrice: number, exitPrice: number, direction: 'long' | 'short') {
  const points: { time: number; price: number }[] = [];
  const minPrice = Math.min(entryPrice, exitPrice) * 0.998;
  const maxPrice = Math.max(entryPrice, exitPrice) * 1.002;
  const range = maxPrice - minPrice;
  
  // Generate 50 price points simulating the trade
  for (let i = 0; i < 50; i++) {
    let price: number;
    
    if (i < 5) {
      // Entry zone
      price = entryPrice + (Math.random() - 0.5) * range * 0.1;
    } else if (i > 45) {
      // Exit zone
      price = exitPrice + (Math.random() - 0.5) * range * 0.1;
    } else {
      // Middle - interpolate with some noise
      const progress = (i - 5) / 40;
      const basePrice = entryPrice + (exitPrice - entryPrice) * progress;
      price = basePrice + (Math.random() - 0.5) * range * 0.3;
    }
    
    points.push({ time: i, price });
  }
  
  return points;
}

export function TradeReplayModal({ open, onClose, trades, initialTradeIndex = 0 }: TradeReplayModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialTradeIndex);
  const [priceData, setPriceData] = useState<{ time: number; price: number }[]>([]);

  const trade = trades[currentIndex];

  useEffect(() => {
    if (trade) {
      setPriceData(generatePriceData(trade.entryPrice, trade.exitPrice, trade.direction));
    }
  }, [trade]);

  useEffect(() => {
    setCurrentIndex(initialTradeIndex);
  }, [initialTradeIndex]);

  if (!trade) return null;

  const isWin = trade.profitLoss > 0;
  const duration = trade.closedAt 
    ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
    : 0;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(trades.length - 1, prev + 1));
  };

  const priceMin = Math.min(trade.entryPrice, trade.exitPrice) * 0.997;
  const priceMax = Math.max(trade.entryPrice, trade.exitPrice) * 1.003;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Trade Replay</span>
            <Badge variant={isWin ? "default" : "destructive"}>
              {trade.pair}
            </Badge>
            <Badge variant="outline" className={cn(
              trade.direction === 'long' ? "text-green-500 border-green-500/50" : "text-red-500 border-red-500/50"
            )}>
              {trade.direction.toUpperCase()}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4">
          {/* Chart */}
          <div className="col-span-2 h-[300px] bg-muted/30 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={priceData}>
                <defs>
                  <linearGradient id="profitArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis domain={[priceMin, priceMax]} hide />
                
                {/* Entry line */}
                <ReferenceLine 
                  y={trade.entryPrice} 
                  stroke="hsl(var(--primary))" 
                  strokeDasharray="5 5"
                  label={{ value: 'Entry', position: 'left', fill: 'hsl(var(--primary))' }}
                />
                
                {/* Exit line */}
                <ReferenceLine 
                  y={trade.exitPrice} 
                  stroke={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} 
                  strokeDasharray="5 5"
                  label={{ value: 'Exit', position: 'right', fill: isWin ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))' }}
                />
                
                <Area
                  type="monotone"
                  dataKey="price"
                  fill="url(#profitArea)"
                  stroke="transparent"
                />
                
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Trade Details */}
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <div className="flex items-center gap-2 mt-1">
                {trade.direction === 'long' ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
                <span className={cn(
                  "font-bold",
                  trade.direction === 'long' ? "text-green-500" : "text-red-500"
                )}>
                  {trade.direction.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Entry Price</Label>
              <p className="font-mono text-lg">${trade.entryPrice.toFixed(4)}</p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Exit Price</Label>
              <p className={cn(
                "font-mono text-lg",
                isWin ? "text-green-500" : "text-red-500"
              )}>
                ${trade.exitPrice.toFixed(4)}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">P&L</Label>
              <div className="flex items-center gap-2 mt-1">
                <DollarSign className={cn("h-4 w-4", isWin ? "text-green-500" : "text-red-500")} />
                <span className={cn(
                  "font-bold text-xl",
                  isWin ? "text-green-500" : "text-red-500"
                )}>
                  {isWin ? '+' : ''}{trade.profitLoss.toFixed(4)} USDT
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <Label className="text-xs text-muted-foreground">Position Size</Label>
              <p className="font-mono">${trade.amount.toFixed(2)}</p>
            </div>

            {trade.exchange && (
              <div className="bg-muted/50 rounded-lg p-3">
                <Label className="text-xs text-muted-foreground">Exchange</Label>
                <p className="font-medium">{trade.exchange}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous Trade
          </Button>

          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} of {trades.length}
          </span>

          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentIndex === trades.length - 1}
          >
            Next Trade
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
