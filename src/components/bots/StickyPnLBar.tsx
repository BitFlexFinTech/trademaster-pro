import { memo } from 'react';
import { DollarSign, Bot, Play, Square, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type BotFilter = 'all' | 'running' | 'stopped' | 'profitable' | 'losing';

interface StickyPnLBarProps {
  totalPnL: number;
  runningBotCount: number;
  activeFilter: BotFilter;
  onFilterChange: (filter: BotFilter) => void;
}

const filters: { id: BotFilter; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: Bot },
  { id: 'running', label: 'Running', icon: Play },
  { id: 'stopped', label: 'Stopped', icon: Square },
  { id: 'profitable', label: '+P&L', icon: TrendingUp },
  { id: 'losing', label: '-P&L', icon: TrendingDown },
];

export const StickyPnLBar = memo(function StickyPnLBar({
  totalPnL,
  runningBotCount,
  activeFilter,
  onFilterChange,
}: StickyPnLBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-3 py-2 mb-2 rounded-lg">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* P&L Display */}
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Total P&L
          </span>
          <span
            className={cn(
              "text-lg font-mono font-bold tabular-nums transition-colors",
              totalPnL >= 0 ? "text-neon-profit" : "text-destructive"
            )}
          >
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
            {runningBotCount} active
          </Badge>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1">
          {filters.map((filter) => (
            <Button
              key={filter.id}
              size="sm"
              variant={activeFilter === filter.id ? 'default' : 'ghost'}
              className={cn(
                "h-6 text-[10px] px-2 gap-1",
                activeFilter === filter.id && "bg-primary text-primary-foreground"
              )}
              onClick={() => onFilterChange(filter.id)}
            >
              <filter.icon className="w-3 h-3" />
              {filter.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
});
