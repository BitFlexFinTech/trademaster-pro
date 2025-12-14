import { useState, useEffect } from 'react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useAuth } from '@/hooks/useAuth';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  User,
  Link,
  Wallet,
  Eye,
  Bell,
  FlaskConical,
  FileText,
  RefreshCw,
  Activity,
  Loader2,
  CheckCircle,
  RotateCcw,
} from 'lucide-react';

interface ExchangeConnection {
  id: string;
  exchange_name: string;
  is_connected: boolean;
}

export default function DemoAccount() {
  const { user } = useAuth();
  const { wallets, supportedWallets, connectWallet, connecting, loading: walletsLoading } = useWalletConnect();
  const { virtualBalance, resetDemo } = useTradingMode();
  const [exchanges, setExchanges] = useState<ExchangeConnection[]>([]);
  const [loadingExchanges, setLoadingExchanges] = useState(true);
  const [resetting, setResetting] = useState(false);

  const handleResetDemo = async () => {
    if (!user) return;
    setResetting(true);
    try {
      await resetDemo(user.id);
      toast.success('Demo account reset to $5,000');
    } catch (err) {
      console.error('Reset failed:', err);
      toast.error('Failed to reset demo account');
    } finally {
      setResetting(false);
    }
  };
  const [visibility, setVisibility] = useState({
    portfolio: true,
    opportunities: true,
    autoEarn: true,
    aiSummary: true,
    signals: true,
    news: true,
    videos: true,
  });
  const [alertSettings, setAlertSettings] = useState({
    profitThreshold: 2,
    pushNotifications: true,
    emailAlerts: false,
    soundAlerts: true,
  });

  useEffect(() => {
    async function fetchExchanges() {
      if (!user) {
        setLoadingExchanges(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('exchange_connections')
          .select('id, exchange_name, is_connected')
          .eq('user_id', user.id);
        
        setExchanges(data || []);
      } catch (err) {
        console.error('Error fetching exchanges:', err);
      } finally {
        setLoadingExchanges(false);
      }
    }

    fetchExchanges();
  }, [user]);

  const toggleVisibility = (key: keyof typeof visibility) => {
    setVisibility({ ...visibility, [key]: !visibility[key] });
  };

  const exchangeList = [
    { id: 'binance', name: 'Binance', icon: '🟡' },
    { id: 'bybit', name: 'Bybit', icon: '🟠' },
    { id: 'okx', name: 'OKX', icon: '⚪' },
    { id: 'kucoin', name: 'KuCoin', icon: '🟢' },
    { id: 'hyperliquid', name: 'Hyperliquid', icon: '🟣' },
    { id: 'kraken', name: 'Kraken', icon: '🔵' },
    { id: 'nexo', name: 'Nexo.com', icon: '💙' },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <User className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Trader Demo Account</h1>
        <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded">
          Control Center
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Exchange Connections */}
            <div className="card-terminal p-4">
              <div className="flex items-center gap-2 mb-4">
                <Link className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Exchange Connections</h3>
              </div>

              {loadingExchanges ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {exchangeList.map((ex) => {
                    const connected = exchanges.find(e => 
                      e.exchange_name.toLowerCase() === ex.id && e.is_connected
                    );
                    return (
                      <div
                        key={ex.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{ex.icon}</span>
                          <div>
                            <p className="text-foreground font-medium">{ex.name}</p>
                            <p className={`text-xs ${connected ? 'text-primary' : 'text-muted-foreground'}`}>
                              {connected ? 'Connected' : 'Not connected'}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant={connected ? 'outline' : 'default'}
                          size="sm"
                          className={connected ? '' : 'btn-primary'}
                        >
                          {connected ? 'Manage' : 'Connect'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* DeFi Wallets */}
            <div className="card-terminal p-4">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">DeFi Wallets</h3>
              </div>

              {walletsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {supportedWallets.map((wallet) => {
                    const connected = wallets.find(w => w.walletType === wallet.id && w.isConnected);
                    return (
                      <div
                        key={wallet.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{wallet.icon}</span>
                          <div>
                            <p className="text-foreground font-medium">{wallet.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {connected ? (
                                <span className="text-primary flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {connected.address.slice(0, 6)}...{connected.address.slice(-4)}
                                </span>
                              ) : (
                                'Not connected'
                              )}
                            </p>
                          </div>
                        </div>
                        <Button
                          className="btn-primary"
                          size="sm"
                          onClick={() => !connected && connectWallet(wallet.id)}
                          disabled={!!connecting || !!connected}
                        >
                          {connected ? 'Connected' : connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dashboard Visibility */}
            <div className="card-terminal p-4">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Dashboard Visibility</h3>
              </div>

              <div className="space-y-3">
                {Object.entries(visibility).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <Switch
                      checked={value}
                      onCheckedChange={() => toggleVisibility(key as keyof typeof visibility)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Alert Settings */}
            <div className="card-terminal p-4">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Alert Settings</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Profit Threshold (%)</label>
                  <Input
                    type="number"
                    value={alertSettings.profitThreshold}
                    onChange={(e) =>
                      setAlertSettings({ ...alertSettings, profitThreshold: Number(e.target.value) })
                    }
                    className="bg-secondary border-border"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Push Notifications</span>
                    <Switch
                      checked={alertSettings.pushNotifications}
                      onCheckedChange={(checked) =>
                        setAlertSettings({ ...alertSettings, pushNotifications: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Email Alerts</span>
                    <Switch
                      checked={alertSettings.emailAlerts}
                      onCheckedChange={(checked) =>
                        setAlertSettings({ ...alertSettings, emailAlerts: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">Sound Alerts</span>
                    <Switch
                      checked={alertSettings.soundAlerts}
                      onCheckedChange={(checked) =>
                        setAlertSettings({ ...alertSettings, soundAlerts: checked })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Quick Actions</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="h-16 flex-col gap-2">
                    {resetting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                    <span className="text-xs">Reset Demo</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Demo Account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset your virtual balance to $5,000 and clear all demo trades, bot history, and backtests. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetDemo}>Reset Account</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" className="h-16 flex-col gap-2">
                <FlaskConical className="w-5 h-5" />
                <span className="text-xs">Sandbox Mode</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col gap-2">
                <FileText className="w-5 h-5" />
                <span className="text-xs">Audit Log</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col gap-2">
                <RefreshCw className="w-5 h-5" />
                <span className="text-xs">Bug Scan</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col gap-2">
                <Eye className="w-5 h-5" />
                <span className="text-xs">View All</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Current Virtual Balance: <span className="text-primary font-mono">${virtualBalance.toLocaleString()}</span>
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
