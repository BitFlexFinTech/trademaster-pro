import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PnLTickerProps {
  value: number;
  showChange?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PnLTicker({ value, showChange = true, size = 'md', className }: PnLTickerProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [changeAmount, setChangeAmount] = useState(0);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (value !== displayValue) {
      setPreviousValue(displayValue);
      setChangeAmount(value - displayValue);
      setIsAnimating(true);
      
      // Clear any existing timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      // Animate to new value
      setDisplayValue(value);

      // Hide change indicator after animation
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
      }, 2000);
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [value, displayValue]);

  const isGain = value >= 0;
  const isChangePositive = changeAmount > 0;

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-4xl',
  };

  const changeSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      {/* Main P&L Value */}
      <div className="relative overflow-hidden">
        <div
          className={cn(
            "font-bold tabular-nums transition-all duration-500 ease-out",
            sizeClasses[size],
            isGain ? "text-green-500" : "text-red-500",
            isAnimating && (isChangePositive ? "animate-slide-up" : "animate-slide-down")
          )}
        >
          {isGain ? '+' : ''}{displayValue.toFixed(2)}
        </div>
      </div>

      {/* Direction Icon */}
      {isGain ? (
        <TrendingUp className={cn(
          "text-green-500 transition-transform",
          size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6',
          isAnimating && isChangePositive && "animate-bounce"
        )} />
      ) : (
        <TrendingDown className={cn(
          "text-red-500 transition-transform",
          size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6',
          isAnimating && !isChangePositive && "animate-bounce"
        )} />
      )}

      {/* Change Indicator */}
      {showChange && isAnimating && changeAmount !== 0 && (
        <div
          className={cn(
            "absolute -right-12 top-0 font-medium transition-all duration-500",
            changeSizeClasses[size],
            isChangePositive 
              ? "text-green-400 animate-fade-up" 
              : "text-red-400 animate-fade-down"
          )}
        >
          {isChangePositive ? '+' : ''}{changeAmount.toFixed(4)}
        </div>
      )}
    </div>
  );
}

// Compact ticker for use in cards
export function CompactPnLTicker({ value, className }: { value: number; className?: string }) {
  const [prevValue, setPrevValue] = useState(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value !== prevValue) {
      setFlash(value > prevValue ? 'up' : 'down');
      setPrevValue(value);
      
      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue]);

  return (
    <span
      className={cn(
        "tabular-nums font-bold transition-all duration-200",
        value >= 0 ? "text-green-500" : "text-red-500",
        flash === 'up' && "bg-green-500/20 scale-105",
        flash === 'down' && "bg-red-500/20 scale-95",
        className
      )}
    >
      {value >= 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}
