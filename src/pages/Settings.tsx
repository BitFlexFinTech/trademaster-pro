import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, Link, AlertTriangle, CheckCircle2, Unlink } from 'lucide-react';
import { ExchangeConnectModal } from '@/components/exchange/ExchangeConnectModal';
import { SecurityConfigPanel } from '@/components/settings/SecurityConfigPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const EXCHANGES = [
  { id: 1, name: 'Binance', color: '#F0B90B', requiresPassphrase: false },
  { id: 2, name: 'KuCoin', color: '#24AE8F', requiresPassphrase: true },
  { id: 3, name: 'Bybit', color: '#F7A600', requiresPassphrase: false },
  { id: 4, name: 'OKX', color: '#FFFFFF', requiresPassphrase: true },
  { id: 5, name: 'Kraken', color: '#5741D9', requiresPassphrase: false },
  { id: 6, name: 'Hyperliquid', color: '#00FF88', requiresPassphrase: false },
  { id: 7, name: 'Nexo', color: '#4DA3FF', requiresPassphrase: false },
];

interface ExchangeConnection {
  exchange_name: string;
  is_connected: boolean;
  permissions: string[];
  last_verified_at?: string;
}

export default function Settings() {
  const [connections, setConnections] = useState<Record<string, ExchangeConnection>>({});
  const [selectedExchange, setSelectedExchange] = useState<typeof EXCHANGES[0] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchConnections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected, permissions, last_verified_at')
        .eq('user_id', user.id);

      if (error) throw error;

      const connMap: Record<string, ExchangeConnection> = {};
      data?.forEach(conn => {
        connMap[conn.exchange_name] = conn;
      });
      setConnections(connMap);

      // Check if user is admin
      const { data: hasRole } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'super_admin'
      });
      setIsAdmin(!!hasRole);
    } catch (err: unknown) {
      console.error('Error fetching connections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [user]);

  const handleConnectClick = (exchange: typeof EXCHANGES[0]) => {
    if (connections[exchange.name]?.is_connected) {
      handleDisconnect(exchange.name);
    } else {
      setSelectedExchange(exchange);
      setModalOpen(true);
    }
  };

  const handleDisconnect = async (exchangeName: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('exchange_connections')
        .update({ 
          is_connected: false, 
          api_key_hash: null,
          encrypted_api_secret: null,
          encrypted_passphrase: null,
          encryption_iv: null,
        })
        .eq('user_id', user.id)
        .eq('exchange_name', exchangeName);

      if (error) throw error;

      toast({
        title: 'Exchange Disconnected',
        description: `${exchangeName} has been disconnected from your account`,
      });

      fetchConnections();
    } catch (err: unknown) {
      console.error('Error disconnecting:', err);
      toast({
        title: 'Error',
        description: 'Failed to disconnect exchange',
        variant: 'destructive',
      });
    }
  };

  const connectedCount = Object.values(connections).filter(c => c.is_connected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Exchange Settings</h1>
        </div>
        <span className="text-sm text-muted-foreground">
          {connectedCount} of {EXCHANGES.length} exchanges connected
        </span>
      </div>

      {/* Exchange Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXCHANGES.map((exchange) => {
          const connection = connections[exchange.name];
          const isConnected = connection?.is_connected || false;

          return (
            <div key={exchange.id} className="card-terminal p-4">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: exchange.color + '20' }}
                >
                  <span
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: exchange.color }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">{exchange.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        <span className="text-primary">Connected</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                        Not connected
                      </>
                    )}
                  </p>
                </div>
              </div>

              {isConnected && connection?.permissions && (
                <div className="mb-4 flex flex-wrap gap-1">
                  {connection.permissions.map(perm => (
                    <span key={perm} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                      {perm}
                    </span>
                  ))}
                </div>
              )}

              <Button
                className={`w-full gap-2 ${isConnected ? 'bg-muted hover:bg-destructive/20 text-foreground' : 'btn-primary'}`}
                onClick={() => handleConnectClick(exchange)}
              >
                {isConnected ? (
                  <>
                    <Unlink className="w-4 h-4" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4" />
                    Connect
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Admin Security Panel */}
      {isAdmin && <SecurityConfigPanel />}

      {/* Security Notice */}
      <div className="card-terminal p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-foreground mb-1">Security Notice</h3>
            <p className="text-sm text-muted-foreground">
              API keys are encrypted with AES-256-GCM before storage. We recommend using read-only keys or keys with limited trading permissions. Never share your API secrets with anyone. Your keys are stored securely and never transmitted in plain text.
            </p>
          </div>
        </div>
      </div>

      {/* Connection Modal */}
      <ExchangeConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        exchange={selectedExchange}
        onConnected={fetchConnections}
      />
    </div>
  );
}
