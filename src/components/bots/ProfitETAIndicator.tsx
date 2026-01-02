import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, TrendingDown, Minus, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

interface ProfitETAIndicatorProps {
  pair: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPnL: number;
  targetProfit: number;
  positionSize: number;
  className?: string;
}

interface PricePoint {
  price: number;
  timestamp: number;
}

export function ProfitETAIndicator({
  pair,
  direction,
  entryPrice,
  currentPnL,
  targetProfit,
  positionSize,
  className,
}: ProfitETAIndicatorProps) {
  const { getPrice } = useBinanceWebSocket();
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [eta, setEta] = useState<string>('Calculating...');
  const [status, setStatus] = useState<'favorable' | 'against' | 'consolidating'>('consolidating');

  const symbol = pair.replace('/', '');

  // Track price history every 2 seconds
  useEffect(() => {
    const trackPrice = () => {
      const price = getPrice(symbol);
      if (price && price > 0) {
        setPriceHistory(prev => {
          const newHistory = [...prev, { price, timestamp: Date.now() }];
          // Keep last 5 minutes of data (150 points at 2s interval)
          return newHistory.slice(-150);
        });
      }
    };

    trackPrice();
    const interval = setInterval(trackPrice, 2000);
    return () => clearInterval(interval);
  }, [symbol, getPrice]);

  // Calculate ETA based on price velocity
  useEffect(() => {
    if (priceHistory.length < 10) {
      setEta('Gathering data...');
      setStatus('consolidating');
      return;
    }

    // Calculate velocity over last 5 minutes
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const recentHistory = priceHistory.filter(p => p.timestamp >= fiveMinAgo);

    if (recentHistory.length < 5) {
      setEta('Gathering data...');
      return;
    }

    const oldestPrice = recentHistory[0].price;
    const currentPrice = recentHistory[recentHistory.length - 1].price;
    const timeDiffMinutes = (recentHistory[recentHistory.length - 1].timestamp - recentHistory[0].timestamp) / 60000;

    if (timeDiffMinutes < 0.5) {
      return;
    }

    // Price change per minute
    const priceChangePerMin = (currentPrice - oldestPrice) / timeDiffMinutes;
    
    // Remaining profit needed
    const remainingProfit = targetProfit - currentPnL;
    
    if (remainingProfit <= 0) {
      setEta('Target reached! 🎯');
      setStatus('favorable');
      return;
    }

    // Calculate required price move for remaining profit
    // profit = positionSize * (priceMove / entryPrice)
    // priceMove = (remainingProfit / positionSize) * entryPrice
    const requiredPriceMove = (remainingProfit / positionSize) * entryPrice;
    
    // For long: need price to go up, for short: need price to go down
    const priceDirection = direction === 'long' ? 1 : -1;
    const effectiveVelocity = priceChangePerMin * priceDirection;

    if (Math.abs(effectiveVelocity) < 0.00001 * currentPrice) {
      // Price is essentially flat (less than 0.001% per minute)
      setEta('Consolidating');
      setStatus('consolidating');
      return;
    }

    if (effectiveVelocity < 0) {
      // Price moving against position
      setEta('Moving against');
      setStatus('against');
      return;
    }

    // Calculate time to reach target
    const minutesToTarget = requiredPriceMove / effectiveVelocity;
    
    if (minutesToTarget < 0 || !isFinite(minutesToTarget)) {
      setEta('Calculating...');
      setStatus('consolidating');
      return;
    }

    if (minutesToTarget > 60) {
      const hours = Math.floor(minutesToTarget / 60);
      const mins = Math.floor(minutesToTarget % 60);
      setEta(`~${hours}h ${mins}m`);
    } else if (minutesToTarget > 1) {
      const mins = Math.floor(minutesToTarget);
      const secs = Math.floor((minutesToTarget - mins) * 60);
      setEta(`~${mins}m ${secs}s`);
    } else {
      const secs = Math.floor(minutesToTarget * 60);
      setEta(`~${secs}s`);
    }
    
    setStatus('favorable');
  }, [priceHistory, direction, entryPrice, currentPnL, targetProfit, positionSize]);

  const statusConfig = {
    favorable: {
      icon: TrendingUp,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
    },
    against: {
      icon: TrendingDown,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
    },
    consolidating: {
      icon: Minus,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded border text-xs",
      config.bgColor,
      config.borderColor,
      className
    )}>
      <Timer className={cn("h-3 w-3", config.color)} />
      <StatusIcon className={cn("h-3 w-3", config.color)} />
      <span className={cn("font-mono", config.color)}>{eta}</span>
    </div>
  );
}

// Compact version for position cards
export function ProfitETABadge({
  pair,
  direction,
  entryPrice,
  currentPnL,
  targetProfit,
  positionSize,
}: Omit<ProfitETAIndicatorProps, 'className'>) {
  const { getPrice } = useBinanceWebSocket();
  const [eta, setEta] = useState<string>('...');
  const [status, setStatus] = useState<'favorable' | 'against' | 'consolidating'>('consolidating');
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

  const symbol = pair.replace('/', '');

  useEffect(() => {
    const trackPrice = () => {
      const price = getPrice(symbol);
      if (price && price > 0) {
        setPriceHistory(prev => [...prev, { price, timestamp: Date.now() }].slice(-90));
      }
    };

    trackPrice();
    const interval = setInterval(trackPrice, 2000);
    return () => clearInterval(interval);
  }, [symbol, getPrice]);

  useEffect(() => {
    if (priceHistory.length < 5) return;

    const now = Date.now();
    const recentHistory = priceHistory.filter(p => p.timestamp >= now - 3 * 60 * 1000);
    if (recentHistory.length < 3) return;

    const oldestPrice = recentHistory[0].price;
    const currentPrice = recentHistory[recentHistory.length - 1].price;
    const timeDiffMinutes = (recentHistory[recentHistory.length - 1].timestamp - recentHistory[0].timestamp) / 60000;
    
    if (timeDiffMinutes < 0.25) return;

    const priceChangePerMin = (currentPrice - oldestPrice) / timeDiffMinutes;
    const remainingProfit = targetProfit - currentPnL;

    if (remainingProfit <= 0) {
      setEta('🎯');
      setStatus('favorable');
      return;
    }

    const requiredPriceMove = (remainingProfit / positionSize) * entryPrice;
    const priceDirection = direction === 'long' ? 1 : -1;
    const effectiveVelocity = priceChangePerMin * priceDirection;

    if (Math.abs(effectiveVelocity) < 0.00001 * currentPrice) {
      setEta('—');
      setStatus('consolidating');
      return;
    }

    if (effectiveVelocity < 0) {
      setEta('↓');
      setStatus('against');
      return;
    }

    const minutesToTarget = requiredPriceMove / effectiveVelocity;
    
    if (minutesToTarget > 60) {
      setEta(`${Math.floor(minutesToTarget / 60)}h`);
    } else if (minutesToTarget > 1) {
      setEta(`${Math.floor(minutesToTarget)}m`);
    } else {
      setEta(`${Math.floor(minutesToTarget * 60)}s`);
    }
    setStatus('favorable');
  }, [priceHistory, direction, entryPrice, currentPnL, targetProfit, positionSize]);

  const colorMap = {
    favorable: 'text-emerald-400 border-emerald-500/50',
    against: 'text-red-400 border-red-500/50',
    consolidating: 'text-amber-400 border-amber-500/50',
  };

  return (
    <Badge variant="outline" className={cn("text-[8px] h-4 px-1", colorMap[status])}>
      <Clock className="h-2 w-2 mr-0.5" />
      {eta}
    </Badge>
  );
}
