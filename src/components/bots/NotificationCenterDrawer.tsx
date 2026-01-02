import { Bell, Trash2, RotateCcw, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useNotificationCenter, AppNotification } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

function NotificationIcon({ type }: { type: AppNotification['type'] }) {
  switch (type) {
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-primary" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function NotificationItem({ 
  notification, 
  onDismiss, 
  onRestore 
}: { 
  notification: AppNotification; 
  onDismiss: () => void;
  onRestore: () => void;
}) {
  return (
    <div 
      className={cn(
        "p-3 border-b border-border last:border-b-0 transition-opacity",
        notification.dismissed && "opacity-50 bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3">
        <NotificationIcon type={notification.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{notification.title}</p>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(notification.timestamp, { addSuffix: true })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[9px] h-4 px-1">
              {notification.source}
            </Badge>
            {notification.dismissed ? (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 text-[10px] px-1.5"
                onClick={onRestore}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationCenterDrawer() {
  const { 
    notifications, 
    dismissNotification, 
    restoreNotification, 
    clearAllNotifications, 
    unreadCount 
  } = useNotificationCenter();

  const activeNotifications = notifications.filter(n => !n.dismissed);
  const dismissedNotifications = notifications.filter(n => n.dismissed);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="relative text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 bg-primary rounded-full flex items-center justify-center">
              <span className="text-[9px] font-bold text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[420px] p-0">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base">Notifications</SheetTitle>
            {notifications.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearAllNotifications}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-60px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div>
              {/* Active Notifications */}
              {activeNotifications.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Active ({activeNotifications.length})
                  </div>
                  {activeNotifications.map(n => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onDismiss={() => dismissNotification(n.id)}
                      onRestore={() => restoreNotification(n.id)}
                    />
                  ))}
                </div>
              )}

              {/* Dismissed Notifications */}
              {dismissedNotifications.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Dismissed ({dismissedNotifications.length})
                  </div>
                  {dismissedNotifications.map(n => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onDismiss={() => dismissNotification(n.id)}
                      onRestore={() => restoreNotification(n.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
