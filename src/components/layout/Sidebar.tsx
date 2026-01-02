import { useState, useEffect } from 'react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Shield,
  FlaskConical,
  LineChart,
  Bot,
  Brain,
  Bug,
  Settings,
  User,
  ChevronLeft,
  ChevronRight,
  Crown,
  Newspaper,
  BookOpen,
  Wallet,
  Bell,
  ArrowRightLeft,
} from 'lucide-react';
import { UsageBanner } from '@/components/subscription/UsageBanner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useAlerts } from '@/hooks/useAlerts';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Wallet, label: 'Portfolio' },
  { to: '/bots', icon: Bot, label: 'Bots' },
  { to: '/bot-analytics', icon: Brain, label: 'Bot Analytics' },
  { to: '/trades-history', icon: BarChart3, label: 'Trades History' },
  { to: '/pair-performance', icon: BarChart3, label: 'Pair Analytics' },
  { to: '/arbitrage', icon: ArrowRightLeft, label: 'Arbitrage' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/risk', icon: Shield, label: 'Risk' },
  { to: '/sandbox', icon: FlaskConical, label: 'Sandbox' },
  { to: '/charts', icon: LineChart, label: 'Charts' },
  { to: '/news', icon: Newspaper, label: 'News' },
  { to: '/research', icon: BookOpen, label: 'Research' },
  { to: '/debugger', icon: Bug, label: 'Debugger', isDebugger: true },
  { to: '/bugs-dashboard', icon: Bug, label: '🐛BUGS🐛', isBugs: true },
];

const bottomNavItems = [
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/demo-account', icon: User, label: 'Demo Account' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();
  const { unreadCount } = useAlerts();

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      setIsAdmin(data?.role === 'super_admin');
    };
    checkAdminRole();
  }, [user]);

  return (
    <aside
      className={cn(
        'bg-sidebar border-r border-sidebar-border flex flex-col h-screen sticky top-0 transition-all duration-300',
        collapsed ? 'w-16' : 'w-48'
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-foreground">CryptoArb</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors',
                    collapsed && 'justify-center px-2',
                    (item as any).isBugs && 'text-red-400 hover:text-red-300 hover:bg-red-500/10 font-semibold',
                    (item as any).isDebugger && 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                  )}
                  activeClassName={cn(
                    'bg-sidebar-accent text-sidebar-accent-foreground',
                    (item as any).isBugs && 'bg-red-500/20 text-red-300',
                    (item as any).isDebugger && 'bg-amber-500/20 text-amber-300'
                  )}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', (item as any).isBugs && 'text-red-400')} />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </NavLink>
            </li>
          ))}
          {isAdmin && (
            <li>
              <NavLink
                to="/admin"
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-amber-400 hover:bg-sidebar-accent hover:text-amber-300 transition-colors',
                  collapsed && 'justify-center px-2'
                )}
                activeClassName="bg-sidebar-accent text-amber-300"
              >
                <Crown className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm">Admin</span>}
              </NavLink>
            </li>
          )}
        </ul>
      </nav>

      {/* Usage Banner */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <UsageBanner />
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="border-t border-sidebar-border py-4">
        <ul className="space-y-1 px-2">
          {bottomNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors relative',
                  collapsed && 'justify-center px-2'
                )}
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <div className="relative">
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {item.to === '/notifications' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                {!collapsed && (
                  <span className="text-sm flex items-center gap-2">
                    {item.label}
                    {item.to === '/notifications' && unreadCount > 0 && (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                        {unreadCount}
                      </Badge>
                    )}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 mx-2 mt-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors w-[calc(100%-16px)]',
            collapsed && 'justify-center px-2'
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
