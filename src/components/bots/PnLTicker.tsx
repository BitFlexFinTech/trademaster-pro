import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { AnimatedCounter, CompactAnimatedCounter } from '@/components/ui/AnimatedCounter';

interface PnLTickerProps {
  value: number;
  showChange?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function PnLTicker({ value, size = 'md', className }: PnLTickerProps) {
  const isGain = value >= 0;

  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-4xl',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <AnimatedCounter
        value={value}
        duration={500}
        decimals={2}
        prefix={isGain ? '+$' : '-$'}
        colorByValue
        className={cn("font-bold", sizeClasses[size])}
      />

      {isGain ? (
        <TrendingUp className={cn("text-green-500", iconSizes[size])} />
      ) : (
        <TrendingDown className={cn("text-red-500", iconSizes[size])} />
      )}
    </div>
  );
}

// Compact ticker for use in cards
export function CompactPnLTicker({ value, className }: { value: number; className?: string }) {
  return (
    <CompactAnimatedCounter
      value={value}
      className={className}
    />
  );
}
