// ============================================
// BotCardHeader - Bot Name, Status, Type Badge
// Presentation-only component using store
// ============================================

import { Badge } from '@/components/ui/badge';
import { Activity, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotCardHeaderProps {
  name: string;
  type: 'spot' | 'leverage';
  status: 'running' | 'stopped';
  mode: 'demo' | 'live';
}

export function BotCardHeader({ name, type, status, mode }: BotCardHeaderProps) {
  const isRunning = status === 'running';
  
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={cn(
          "p-1.5 rounded-lg",
          type === 'leverage' ? 'bg-orange-500/10' : 'bg-primary/10'
        )}>
          {type === 'leverage' ? (
            <Zap className="w-4 h-4 text-orange-500" />
          ) : (
            <Activity className="w-4 h-4 text-primary" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{name}</h3>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{type === 'leverage' ? 'Leverage' : 'Spot'}</span>
            <span>•</span>
            <span>{mode === 'demo' ? 'Demo' : 'Live'}</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge 
          variant={isRunning ? 'default' : 'outline'}
          className={cn(
            "text-[10px] h-5",
            isRunning && "animate-pulse bg-primary"
          )}
        >
          <div className={cn(
            "w-1.5 h-1.5 rounded-full mr-1",
            isRunning ? 'bg-white' : 'bg-muted-foreground'
          )} />
          {isRunning ? 'Running' : 'Stopped'}
        </Badge>
      </div>
    </div>
  );
}
