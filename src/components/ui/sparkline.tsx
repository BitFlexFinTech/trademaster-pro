import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  className?: string;
  color?: 'green' | 'red' | 'blue' | 'yellow' | 'auto';
  strokeWidth?: number;
}

export function Sparkline({ 
  data, 
  className, 
  color = 'auto',
  strokeWidth = 1.5 
}: SparklineProps) {
  const { path, trend, viewBox } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', trend: 'neutral' as const, viewBox: '0 0 100 24' };
    }

    const width = 100;
    const height = 24;
    const padding = 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Normalize data to fit in the viewBox
    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
      const y = padding + (1 - (value - min) / range) * (height - 2 * padding);
      return { x, y };
    });

    // Create SVG path
    const pathData = points.map((point, index) => 
      `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    ).join(' ');

    // Determine trend
    const firstValue = data[0];
    const lastValue = data[data.length - 1];
    const trend = lastValue > firstValue ? 'up' : lastValue < firstValue ? 'down' : 'neutral';

    return { 
      path: pathData, 
      trend, 
      viewBox: `0 0 ${width} ${height}` 
    };
  }, [data]);

  const strokeColor = useMemo(() => {
    if (color === 'auto') {
      switch (trend) {
        case 'up': return 'hsl(var(--primary))';
        case 'down': return 'hsl(var(--destructive))';
        default: return 'hsl(var(--muted-foreground))';
      }
    }
    switch (color) {
      case 'green': return 'hsl(142.1 76.2% 36.3%)';
      case 'red': return 'hsl(0 84.2% 60.2%)';
      case 'blue': return 'hsl(var(--primary))';
      case 'yellow': return 'hsl(45 93% 47%)';
      default: return 'hsl(var(--muted-foreground))';
    }
  }, [color, trend]);

  if (!path) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <span className="text-[10px] text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <svg 
      viewBox={viewBox} 
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* End point dot */}
      {data.length > 1 && (
        <circle
          cx={100 - 2}
          cy={2 + (1 - (data[data.length - 1] - Math.min(...data)) / (Math.max(...data) - Math.min(...data) || 1)) * 20}
          r={2}
          fill={strokeColor}
        />
      )}
    </svg>
  );
}
