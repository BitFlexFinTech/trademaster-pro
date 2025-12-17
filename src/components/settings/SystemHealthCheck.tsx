import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw, Database, Wifi, Server, Key } from 'lucide-react';

interface SystemHealthCheckProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'checking';
  message: string;
  icon: typeof Database;
}

export function SystemHealthCheck({ open, onOpenChange }: SystemHealthCheckProps) {
  const { user } = useAuth();
  const [checks, setChecks] = useState<HealthCheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runHealthChecks = async () => {
    setRunning(true);
    const results: HealthCheckResult[] = [];

    // Initialize all checks as "checking"
    const initialChecks: HealthCheckResult[] = [
      { name: 'Database Connection', status: 'checking', message: 'Checking...', icon: Database },
      { name: 'Authentication', status: 'checking', message: 'Checking...', icon: Key },
      { name: 'Exchange Connections', status: 'checking', message: 'Checking...', icon: Wifi },
      { name: 'Edge Functions', status: 'checking', message: 'Checking...', icon: Server },
    ];
    setChecks(initialChecks);

    // Check 1: Database Connection
    try {
      const { data, error } = await supabase.from('price_cache').select('id').limit(1);
      results.push({
        name: 'Database Connection',
        status: error ? 'fail' : 'pass',
        message: error ? error.message : 'Connected successfully',
        icon: Database,
      });
    } catch (e) {
      results.push({
        name: 'Database Connection',
        status: 'fail',
        message: e instanceof Error ? e.message : 'Connection failed',
        icon: Database,
      });
    }
    setChecks([...results, ...initialChecks.slice(results.length)]);

    // Check 2: Authentication
    try {
      const { data: { session } } = await supabase.auth.getSession();
      results.push({
        name: 'Authentication',
        status: session ? 'pass' : 'warning',
        message: session ? `Logged in as ${session.user.email}` : 'Not authenticated',
        icon: Key,
      });
    } catch (e) {
      results.push({
        name: 'Authentication',
        status: 'fail',
        message: 'Auth check failed',
        icon: Key,
      });
    }
    setChecks([...results, ...initialChecks.slice(results.length)]);

    // Check 3: Exchange Connections
    if (user) {
      try {
        const { data: exchanges, error } = await supabase
          .from('exchange_connections')
          .select('exchange_name, is_connected')
          .eq('user_id', user.id);
        
        const connectedCount = exchanges?.filter(e => e.is_connected).length || 0;
        results.push({
          name: 'Exchange Connections',
          status: connectedCount > 0 ? 'pass' : 'warning',
          message: connectedCount > 0 
            ? `${connectedCount} exchange(s) connected` 
            : 'No exchanges connected',
          icon: Wifi,
        });
      } catch (e) {
        results.push({
          name: 'Exchange Connections',
          status: 'fail',
          message: 'Failed to check exchanges',
          icon: Wifi,
        });
      }
    } else {
      results.push({
        name: 'Exchange Connections',
        status: 'warning',
        message: 'Login required to check',
        icon: Wifi,
      });
    }
    setChecks([...results, ...initialChecks.slice(results.length)]);

    // Check 4: Edge Functions
    try {
      const { data, error } = await supabase.functions.invoke('fetch-prices', {
        body: { symbols: ['BTC'] },
      });
      results.push({
        name: 'Edge Functions',
        status: error ? 'fail' : 'pass',
        message: error ? error.message : 'Functions responding',
        icon: Server,
      });
    } catch (e) {
      results.push({
        name: 'Edge Functions',
        status: 'warning',
        message: 'Could not verify (may be OK)',
        icon: Server,
      });
    }

    setChecks(results);
    setRunning(false);
  };

  useEffect(() => {
    if (open) {
      runHealthChecks();
    }
  }, [open]);

  const getStatusIcon = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'checking':
        return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: HealthCheckResult['status']) => {
    switch (status) {
      case 'pass':
        return <Badge variant="default" className="text-xs">PASS</Badge>;
      case 'fail':
        return <Badge variant="destructive" className="text-xs">FAIL</Badge>;
      case 'warning':
        return <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-500">WARN</Badge>;
      case 'checking':
        return <Badge variant="outline" className="text-xs">...</Badge>;
    }
  };

  const overallStatus = checks.every(c => c.status === 'pass') 
    ? 'All systems operational' 
    : checks.some(c => c.status === 'fail')
    ? 'Issues detected'
    : 'Some warnings';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Server className="w-5 h-5 text-primary" />
              System Health Check
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={runHealthChecks}
              disabled={running}
              className="h-7"
            >
              {running ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {checks.map((check) => {
            const Icon = check.icon;
            return (
              <div key={check.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{check.name}</p>
                    <p className="text-xs text-muted-foreground">{check.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(check.status)}
                  {getStatusBadge(check.status)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-sm text-center text-muted-foreground">
            {running ? 'Running checks...' : overallStatus}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
