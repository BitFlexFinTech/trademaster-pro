import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, 
  ReferenceLine, Area, ComposedChart, Tooltip 
} from 'recharts';
import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Clock, DollarSign, Target, AlertCircle, Play, Pause,
  SkipBack, SkipForward, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { useTradingMode } from '@/contexts/TradingModeContext';

interface TradeEvent {
  time: number;
  price: number;
  event?: 'entry' | 'exit' | 'peak' | 'trough';
  label?: string;
}

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
  candleData?: { time: number; price: number }[];
}

interface TradeReplayTimelineProps {
  open: boolean;
  onClose: () => void;
  trades: Trade[];
  initialTradeIndex?: number;
}

export function TradeReplayTimeline({ open, onClose, trades, initialTradeIndex = 0 }: TradeReplayTimelineProps) {
  const [currentIndex, setCurrentIndex] = useState(initialTradeIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [visibleDataPoints, setVisibleDataPoints] = useState<TradeEvent[]>([]);
  const { mode: tradingMode } = useTradingMode();

  const trade = trades[currentIndex];

  // Generate timeline data with events
  const timelineData = useMemo(() => {
    if (!trade) return [];

    // If real candle data exists, use it
    if (trade.candleData && trade.candleData.length > 0) {
      const events: TradeEvent[] = trade.candleData.map((c, i) => ({
        time: c.time,
        price: c.price,
        event: i === 0 ? 'entry' : i === trade.candleData!.length - 1 ? 'exit' : undefined,
      }));
      
      // Mark peak and trough
      let peakIdx = 0, troughIdx = 0;
      events.forEach((e, i) => {
        if (e.price > events[peakIdx].price) peakIdx = i;
        if (e.price < events[troughIdx].price) troughIdx = i;
      });
      if (peakIdx > 0 && peakIdx < events.length - 1) events[peakIdx].event = 'peak';
      if (troughIdx > 0 && troughIdx < events.length - 1) events[troughIdx].event = 'trough';
      
      return events;
    }

    // Generate synthetic timeline for visualization
    const duration = trade.closedAt 
      ? new Date(trade.closedAt).getTime() - new Date(trade.createdAt).getTime()
      : 60000;
    
    const steps = 20;
    const priceRange = Math.abs(trade.exitPrice - trade.entryPrice);
    const volatility = priceRange * 0.3;
    
    const events: TradeEvent[] = [];
    let currentPrice = trade.entryPrice;
    const targetPrice = trade.exitPrice;
    
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const timeOffset = duration * progress;
      
      // Price movement with some noise
      const trend = (targetPrice - trade.entryPrice) * progress;
      const noise = (Math.random() - 0.5) * volatility * (1 - progress); // Less noise near end
      currentPrice = trade.entryPrice + trend + noise;
      
      // Ensure we hit entry and exit exactly
      if (i === 0) currentPrice = trade.entryPrice;
      if (i === steps) currentPrice = trade.exitPrice;
      
      events.push({
        time: timeOffset,
        price: currentPrice,
        event: i === 0 ? 'entry' : i === steps ? 'exit' : undefined,
      });
    }
    
    return events;
  }, [trade]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying || timelineData.length === 0) return;

    const interval = setInterval(() => {
      setPlaybackProgress(prev => {
        const next = prev + 2;
        if (next >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, timelineData.length]);

  // Update visible data based on playback progress
  useEffect(() => {
    const visibleCount = Math.ceil((playbackProgress / 100) * timelineData.length);
    setVisibleDataPoints(timelineData.slice(0, Math.max(1, visibleCount)));
  }, [playbackProgress, timelineData]);

  useEffect(() => {
    setCurrentIndex(initialTradeIndex);
    setPlaybackProgress(100);
    setIsPlaying(false);
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
    setPlaybackProgress(100);
    setIsPlaying(false);
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(trades.length - 1, prev + 1));
    setPlaybackProgress(100);
    setIsPlaying(false);
  };

  const handleReplay = () => {
    setPlaybackProgress(0);
    setIsPlaying(true);
  };

  const priceMin = Math.min(trade.entryPrice, trade.exitPrice) * 0.997;
  const priceMax = Math.max(trade.entryPrice, trade.exitPrice) * 1.003;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Trade Replay Timeline</span>
            <Badge variant={isWin ? "default" : "destructive"}>
              {trade.pair}
            </Badge>
            <Badge variant="outline" className={cn(
              trade.direction === 'long' ? "text-emerald-500 border-emerald-500/50" : "text-red-500 border-red-500/50"
            )}>
              {trade.direction.toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              {trade.exchange || 'Unknown'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Timeline Chart */}
          <div className="h-[280px] bg-muted/30 rounded-lg p-3 relative">
            {visibleDataPoints.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p className="text-sm font-medium">Press play to start replay</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleDataPoints}>
                  <defs>
                    <linearGradient id="replayGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    tickFormatter={(v) => formatDuration(v)}
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis 
                    domain={[priceMin, priceMax]} 
                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                    tick={{ fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`$${value.toFixed(4)}`, 'Price']}
                    labelFormatter={(v) => `Time: ${formatDuration(v as number)}`}
                  />
                  
                  {/* Entry line */}
                  <ReferenceLine 
                    y={trade.entryPrice} 
                    stroke="hsl(var(--primary))" 
                    strokeDasharray="5 5"
                    label={{ value: `Entry $${trade.entryPrice.toFixed(2)}`, position: 'left', fill: 'hsl(var(--primary))', fontSize: 10 }}
                  />
                  
                  {/* Exit line */}
                  {playbackProgress === 100 && (
                    <ReferenceLine 
                      y={trade.exitPrice} 
                      stroke={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} 
                      strokeDasharray="5 5"
                      label={{ value: `Exit $${trade.exitPrice.toFixed(2)}`, position: 'right', fill: isWin ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))', fontSize: 10 }}
                    />
                  )}
                  
                  <Area
                    type="monotone"
                    dataKey="price"
                    fill="url(#replayGradient)"
                    stroke="transparent"
                  />
                  
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (payload.event === 'entry') {
                        return <circle cx={cx} cy={cy} r={6} fill="hsl(var(--primary))" stroke="white" strokeWidth={2} />;
                      }
                      if (payload.event === 'exit') {
                        return <circle cx={cx} cy={cy} r={6} fill={isWin ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"} stroke="white" strokeWidth={2} />;
                      }
                      return null;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            
            {/* Playback progress overlay */}
            <div className="absolute bottom-3 left-3 right-3">
              <Progress value={playbackProgress} className="h-1" />
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPlaybackProgress(0)} disabled={isPlaying}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button 
              variant={isPlaying ? "secondary" : "default"} 
              size="sm" 
              onClick={() => isPlaying ? setIsPlaying(false) : handleReplay()}
              className="gap-1 min-w-[100px]"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Replay'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPlaybackProgress(100)} disabled={isPlaying}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Trade Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                {trade.direction === 'long' ? (
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
                <span className="text-xs text-muted-foreground">Direction</span>
              </div>
              <p className={cn(
                "font-bold",
                trade.direction === 'long' ? "text-emerald-500" : "text-red-500"
              )}>
                {trade.direction.toUpperCase()}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">P&L</span>
              </div>
              <p className={cn(
                "font-bold font-mono",
                isWin ? "text-emerald-500" : "text-red-500"
              )}>
                {isWin ? '+' : ''}{trade.profitLoss.toFixed(4)} USDT
              </p>
              <p className="text-xs text-muted-foreground">
                {trade.profitPercent >= 0 ? '+' : ''}{trade.profitPercent.toFixed(2)}%
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Duration</span>
              </div>
              <p className="font-bold">{formatDuration(duration)}</p>
              <p className="text-xs text-muted-foreground">
                {trade.closedAt ? format(new Date(trade.closedAt), 'HH:mm:ss') : 'Open'}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Position</span>
              </div>
              <p className="font-bold font-mono">${trade.amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <span className="text-sm text-muted-foreground">
            Trade {currentIndex + 1} of {trades.length}
          </span>

          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentIndex === trades.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
