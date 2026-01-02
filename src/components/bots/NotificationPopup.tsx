import { memo } from 'react';
import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type NotificationType = 'warning' | 'error' | 'info' | 'success';

interface NotificationPopupProps {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actions?: React.ReactNode;
  onDismiss: (id: string) => void;
}

const typeConfig = {
  error: {
    icon: AlertCircle,
    containerClass: 'border-destructive/50 bg-destructive/10',
    iconClass: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-warning/50 bg-warning/10',
    iconClass: 'text-warning',
  },
  info: {
    icon: Info,
    containerClass: 'border-primary/50 bg-primary/10',
    iconClass: 'text-primary',
  },
  success: {
    icon: CheckCircle,
    containerClass: 'border-green-500/50 bg-green-500/10',
    iconClass: 'text-green-500',
  },
};

export const NotificationPopup = memo(function NotificationPopup({
  id,
  type,
  title,
  message,
  actions,
  onDismiss,
}: NotificationPopupProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <Card
      className={cn(
        'p-3 shadow-lg border animate-slide-in-right',
        config.containerClass
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 flex-shrink-0 mt-0.5', config.iconClass)} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">{message}</p>
          {actions && <div className="mt-2 flex gap-2">{actions}</div>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={() => onDismiss(id)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
});

// Container for stacking multiple notifications
interface NotificationStackProps {
  children: React.ReactNode;
}

export function NotificationStack({ children }: NotificationStackProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {children}
    </div>
  );
}
