import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAdminAnalytics } from '@/hooks/useAdminAnalytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, CreditCard, AlertTriangle, Shield, RefreshCw, Trash2, Bot, Activity, BarChart3 } from 'lucide-react';
import { PlatformAnalytics } from '@/components/admin/PlatformAnalytics';
import { SystemHealth } from '@/components/admin/SystemHealth';
import { toast } from 'sonner';

interface UserWithRole {
  id: string;
  email: string;
  created_at: string;
  role: string;
}

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  user_email?: string;
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  
  const { stats, topBots, dailyVolume, exchangeDistribution, errorStats, recentErrors, refetch: refetchAnalytics } = useAdminAnalytics();

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const { data: roleData, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (error || roleData?.role !== 'super_admin') {
      toast.error('Access denied. Super admin privileges required.');
      navigate('/dashboard');
      return;
    }

    setIsAdmin(true);
    loadData();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, created_at');
      const { data: roles } = await supabase.from('user_roles').select('user_id, role');

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => ({
        id: profile.user_id,
        email: profile.display_name || 'Unknown',
        created_at: profile.created_at,
        role: roles?.find(r => r.user_id === profile.user_id)?.role || 'trader',
      }));
      setUsers(usersWithRoles);

      const { data: subs } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false });
      setSubscriptions((subs || []).map(sub => ({
        ...sub,
        user_email: usersWithRoles.find(u => u.id === sub.user_id)?.email || 'Unknown',
      })));
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
    refetchAnalytics();
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'admin': return 'default';
      default: return 'secondary';
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Checking admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform-wide analytics, bot monitoring, and system health</p>
        </div>
        <Button onClick={handleRefresh} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="analytics" className="gap-2"><BarChart3 className="w-3.5 h-3.5" />Platform Analytics</TabsTrigger>
          <TabsTrigger value="bots" className="gap-2"><Bot className="w-3.5 h-3.5" />Bot Performance</TabsTrigger>
          <TabsTrigger value="users" className="gap-2"><Users className="w-3.5 h-3.5" />Users ({users.length})</TabsTrigger>
          <TabsTrigger value="health" className="gap-2"><Activity className="w-3.5 h-3.5" />System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          <PlatformAnalytics stats={stats} topBots={topBots} exchangeDistribution={exchangeDistribution} dailyVolume={dailyVolume} />
        </TabsContent>

        <TabsContent value="bots">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-primary" />All Bot Runs</CardTitle>
              <CardDescription>Platform-wide bot performance across all users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-secondary/50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.totalBots}</p>
                  <p className="text-xs text-muted-foreground">Total Bots</p>
                </div>
                <div className="bg-secondary/50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-primary">{stats.runningBots}</p>
                  <p className="text-xs text-muted-foreground">Running</p>
                </div>
                <div className="bg-secondary/50 p-4 rounded-lg text-center">
                  <p className={`text-2xl font-bold ${stats.platformPnL >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    ${stats.platformPnL.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Platform P&L</p>
                </div>
                <div className="bg-secondary/50 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.avgHitRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Avg Hit Rate</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bot Name</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Trades</TableHead>
                    <TableHead>Hit Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topBots.map((bot) => (
                    <TableRow key={bot.botId}>
                      <TableCell className="font-medium">{bot.botName}</TableCell>
                      <TableCell className={bot.pnl >= 0 ? 'text-primary' : 'text-destructive'}>${bot.pnl.toFixed(2)}</TableCell>
                      <TableCell>{bot.trades}</TableCell>
                      <TableCell>{bot.hitRate.toFixed(1)}%</TableCell>
                      <TableCell><Badge variant={bot.status === 'running' ? 'default' : 'secondary'}>{bot.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle>All Users</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono text-xs">{u.id.slice(0, 8)}...</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell><Badge variant={getRoleBadgeVariant(u.role)}>{u.role}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <SystemHealth errorStats={errorStats} recentErrors={recentErrors} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
