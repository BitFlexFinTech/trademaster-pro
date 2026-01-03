import { Bot, TrendingUp, BarChart3, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type MobileTab = 'bots' | 'positions' | 'analytics' | 'settings';

interface BottomNavigationProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; label: string; icon: typeof Bot }[] = [
  { id: 'bots', label: 'Bots', icon: Bot },
  { id: 'positions', label: 'Positions', icon: TrendingUp },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function BottomNavigation({ activeTab, onTabChange }: BottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 md:hidden safe-area-inset-bottom">
      <div className="grid grid-cols-4 h-16">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 transition-colors",
              "active:bg-muted/50 touch-manipulation",
              activeTab === id 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
            style={{ minHeight: '48px' }} // Touch target size
          >
            <Icon className={cn(
              "w-5 h-5 transition-transform",
              activeTab === id && "scale-110"
            )} />
            <span className={cn(
              "text-[10px] font-medium",
              activeTab === id && "text-primary"
            )}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
