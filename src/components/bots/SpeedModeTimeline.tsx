import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimelineChartSchema } from '@/lib/dashboardGenerator';

interface SpeedModeTimelineProps {
  data: TimelineChartSchema;
}

const MODE_CONFIG = {
  slow: { 
    icon: Timer, 
    color: 'text-orange-500', 
    bg: 'bg-orange-500/10',
    label: 'Slow (120s)',
  },
  normal: { 
    icon: Clock, 
    color: 'text-blue-500', 
    bg: 'bg-blue-500/10',
    label: 'Normal (60s)',
  },
  fast: { 
    icon: Zap, 
    color: 'text-primary', 
    bg: 'bg-primary/10',
    label: 'Fast (15s)',
  },
};

export function SpeedModeTimeline({ data }: SpeedModeTimelineProps) {
  const events = useMemo(() => {
    return data.events.slice(-6); // Show last 6 events
  }, [data]);

  if (events.length === 0) {
    return (
      <div className="h-[80px] flex items-center justify-center text-muted-foreground text-xs">
        No speed mode changes yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event, idx) => {
        const config = MODE_CONFIG[event.mode as keyof typeof MODE_CONFIG] || MODE_CONFIG.normal;
        const Icon = config.icon;
        const time = new Date(event.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false,
        });

        return (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-2 p-2 rounded',
              config.bg
            )}
          >
            <Icon className={cn('w-3 h-3', config.color)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn('text-[8px]', config.color)}>
                  {config.label}
                </Badge>
                <span className="text-[9px] text-muted-foreground">{time}</span>
              </div>
              <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                {event.reason}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
