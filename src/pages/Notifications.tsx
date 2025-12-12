import { useAlerts } from '@/hooks/useAlerts';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Loader2,
  TrendingUp,
  Bot,
  Zap,
  AlertTriangle,
  Info,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

const ALERT_TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  trade: { icon: DollarSign, color: 'text-primary', label: 'Trade' },
  signal: { icon: TrendingUp, color: 'text-blue-400', label: 'Signal' },
  opportunity: { icon: Zap, color: 'text-yellow-400', label: 'Opportunity' },
  bot: { icon: Bot, color: 'text-purple-400', label: 'Bot' },
  warning: { icon: AlertTriangle, color: 'text-destructive', label: 'Warning' },
  system: { icon: Info, color: 'text-muted-foreground', label: 'System' },
};

export default function Notifications() {
  const { alerts, loading, unreadCount, markAsRead, markAllAsRead, deleteAlert, deleteAllAlerts } = useAlerts();
  const [filter, setFilter] = useState<string>('all');

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : filter === 'unread'
    ? alerts.filter(a => !a.isRead)
    : alerts.filter(a => a.alertType === filter);

  const getAlertConfig = (type: string) => {
    return ALERT_TYPE_CONFIG[type] || ALERT_TYPE_CONFIG.system;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="default" className="bg-primary text-primary-foreground">
              {unreadCount} new
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead} className="gap-2">
              <CheckCheck className="w-4 h-4" />
              Mark All Read
            </Button>
          )}
          {alerts.length > 0 && (
            <Button variant="outline" size="sm" onClick={deleteAllAlerts} className="gap-2 text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-shrink-0 flex-wrap">
        {['all', 'unread', 'trade', 'signal', 'opportunity', 'bot', 'system'].map(f => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
            className="h-8 text-xs capitalize"
          >
            {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : f}
          </Button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="card-terminal flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Notifications</h3>
            <p className="text-muted-foreground text-sm">
              {filter === 'all' 
                ? "You're all caught up! New notifications will appear here."
                : `No ${filter} notifications found.`}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {filteredAlerts.map((alert) => {
                const config = getAlertConfig(alert.alertType);
                const Icon = config.icon;
                
                return (
                  <div
                    key={alert.id}
                    className={cn(
                      'p-4 hover:bg-muted/30 transition-colors',
                      !alert.isRead && 'bg-primary/5 border-l-2 border-l-primary'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn('p-2 rounded-lg bg-secondary/50', config.color)}>
                        <Icon className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">{alert.title}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {config.label}
                          </Badge>
                          {!alert.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                        
                        {alert.message && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {alert.message}
                          </p>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!alert.isRead && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => markAsRead(alert.id)}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteAlert(alert.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
