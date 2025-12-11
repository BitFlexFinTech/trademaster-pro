import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, CreditCard, AlertTriangle, Shield, RefreshCw, Trash2 } from 'lucide-react';
import { getErrorLogs, clearErrorLogs } from '@/lib/errorLogger';
import type { ErrorLog } from '@/lib/errorLogger';
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
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    proUsers: 0,
    errorCount: 0,
  });

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    // Check if user has super_admin role
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
      // Load profiles with roles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, created_at');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.user_id);
        return {
          id: profile.user_id,
          email: profile.display_name || 'Unknown',
          created_at: profile.created_at,
          role: userRole?.role || 'trader',
        };
      });

      setUsers(usersWithRoles);

      // Load subscriptions
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      // Map subscriptions with user info
      const subsWithEmail = (subs || []).map(sub => {
        const userProfile = usersWithRoles.find(u => u.id === sub.user_id);
        return {
          ...sub,
          user_email: userProfile?.email || 'Unknown',
        };
      });

      setSubscriptions(subsWithEmail);

      // Load error logs from localStorage
      const logs = getErrorLogs();
      setErrorLogs(logs);

      // Calculate stats
      setStats({
        totalUsers: usersWithRoles.length,
        activeSubscriptions: (subs || []).filter(s => s.status === 'active').length,
        proUsers: (subs || []).filter(s => s.plan === 'pro' || s.plan === 'enterprise').length,
        errorCount: logs.length,
      });
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = () => {
    clearErrorLogs();
    setErrorLogs([]);
    setStats(prev => ({ ...prev, errorCount: 0 }));
    toast.success('Error logs cleared');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'admin': return 'default';
      case 'trader': return 'secondary';
      default: return 'outline';
    }
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'enterprise': return 'destructive';
      case 'pro': return 'default';
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, subscriptions, and monitor system health</p>
        </div>
        <Button onClick={loadData} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Total Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Active Subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats.activeSubscriptions}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Pro/Enterprise Users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{stats.proUsers}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Error Logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${stats.errorCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {stats.errorCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions ({subscriptions.length})</TabsTrigger>
          <TabsTrigger value="errors">Error Logs ({errorLogs.length})</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>Manage platform users and their roles</CardDescription>
            </CardHeader>
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
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(u.role)}>{u.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
              <CardDescription>View and manage user subscriptions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.user_email}</TableCell>
                      <TableCell>
                        <Badge variant={getPlanBadgeVariant(sub.plan)}>{sub.plan}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{sub.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(sub.starts_at)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {sub.ends_at ? formatDate(sub.ends_at) : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {subscriptions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No subscriptions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Error Logs Tab */}
        <TabsContent value="errors">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Error Logs</CardTitle>
                <CardDescription>Recent application errors (stored locally)</CardDescription>
              </div>
              {errorLogs.length > 0 && (
                <Button variant="destructive" size="sm" onClick={handleClearLogs} className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Clear Logs
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {errorLogs.map((log) => (
                  <div key={log.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>
                        {log.level}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">{log.message}</p>
                    {log.stack && (
                      <pre className="text-xs text-muted-foreground bg-background p-2 rounded mt-2 overflow-x-auto">
                        {log.stack.slice(0, 300)}...
                      </pre>
                    )}
                    {log.context && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Context: {JSON.stringify(log.context)}
                      </p>
                    )}
                  </div>
                ))}
                {errorLogs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No error logs recorded</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
