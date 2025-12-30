import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionStatusIndicator() {
  const { isConnected, error } = useBinanceWebSocket();

  // Determine status
  const status: 'connected' | 'connecting' | 'disconnected' | 'error' = 
    error ? 'error' : 
    isConnected ? 'connected' : 'connecting';

  const statusConfig = {
    connected: {
      icon: Wifi,
      label: 'Live',
      className: 'ws-status-connected',
      dotClass: 'bg-primary',
    },
    connecting: {
      icon: Loader2,
      label: 'Connecting',
      className: 'ws-status-connecting',
      dotClass: 'bg-warning',
    },
    disconnected: {
      icon: WifiOff,
      label: 'Offline',
      className: 'ws-status-disconnected',
      dotClass: 'bg-destructive',
    },
    error: {
      icon: WifiOff,
      label: 'Error',
      className: 'ws-status-error',
      dotClass: 'bg-destructive',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div 
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium",
        "glass-panel border border-border/50",
        config.className
      )}
    >
      <div className={cn("status-dot", config.dotClass, status === 'connected' && "status-dot-pulse")} />
      <Icon className={cn("w-3 h-3", status === 'connecting' && "animate-spin")} />
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}
