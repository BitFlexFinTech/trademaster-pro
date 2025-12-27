import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  colorByValue?: boolean;
  className?: string;
  positiveClass?: string;
  negativeClass?: string;
  neutralClass?: string;
}

// Ease-out exponential for natural deceleration
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function AnimatedCounter({
  value,
  duration = 500,
  decimals = 2,
  prefix = '',
  suffix = '',
  colorByValue = false,
  className,
  positiveClass = 'text-primary',
  negativeClass = 'text-destructive',
  neutralClass = 'text-foreground',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const animate = useCallback((startValue: number, endValue: number) => {
    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    startTimeRef.current = null;

    const step = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);

      const current = startValue + (endValue - startValue) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, [duration]);

  useEffect(() => {
    if (value !== previousValueRef.current) {
      animate(previousValueRef.current, value);
      previousValueRef.current = value;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, animate]);

  // Determine color class based on value
  const colorClass = colorByValue
    ? displayValue > 0
      ? positiveClass
      : displayValue < 0
        ? negativeClass
        : neutralClass
    : '';

  // Format the display value
  const formattedValue = displayValue.toFixed(decimals);
  const showPlus = colorByValue && displayValue > 0;

  return (
    <span
      className={cn(
        'tabular-nums font-mono transition-colors',
        colorClass,
        className
      )}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {prefix}
      {showPlus && '+'}
      {formattedValue}
      {suffix}
    </span>
  );
}

// Compact version for smaller displays
export function CompactAnimatedCounter({
  value,
  className,
  showSign = true,
}: {
  value: number;
  className?: string;
  showSign?: boolean;
}) {
  return (
    <AnimatedCounter
      value={value}
      duration={300}
      decimals={2}
      prefix={showSign && value >= 0 ? '+$' : '$'}
      colorByValue
      className={cn('font-bold', className)}
    />
  );
}

// Percentage version
export function AnimatedPercentage({
  value,
  className,
  colorByValue = true,
}: {
  value: number;
  className?: string;
  colorByValue?: boolean;
}) {
  return (
    <AnimatedCounter
      value={value}
      duration={400}
      decimals={1}
      suffix="%"
      colorByValue={colorByValue}
      className={className}
    />
  );
}

// Integer version for counts
export function AnimatedInteger({
  value,
  className,
  prefix = '',
  suffix = '',
}: {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <AnimatedCounter
      value={value}
      duration={300}
      decimals={0}
      prefix={prefix}
      suffix={suffix}
      className={className}
    />
  );
}
