import { useState } from 'react';
import { demoAccountData } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';

export default function DemoAccount() {
  const [visibility, setVisibility] = useState(demoAccountData.visibility);
  const [alertSettings, setAlertSettings] = useState(demoAccountData.alertSettings);

  const toggleVisibility = (key: keyof typeof visibility) => {
    setVisibility({ ...visibility, [key]: !visibility[key] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <User className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Trader Demo Account</h1>
        <span className="bg-primary/20 text-primary text-xs px-2 py-1 rounded">
          Control Center
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Connections */}
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 mb-4">
            <Link className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">API Connections</h3>
          </div>

          <div className="space-y-3">
            {demoAccountData.apiConnections.map((api) => (
              <div
                key={api.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{api.icon}</span>
                  <div>
                    <p className="text-foreground font-medium">{api.name}</p>
                    <p className={`text-xs ${api.connected ? 'text-primary' : 'text-muted-foreground'}`}>
                      {api.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <Button
                  variant={api.connected ? 'outline' : 'default'}
                  size="sm"
                  className={api.connected ? '' : 'btn-primary'}
                >
                  {api.connected ? 'Manage' : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* DeFi Wallets */}
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">DeFi Wallets</h3>
          </div>

          <div className="space-y-3">
            {demoAccountData.defiWallets.map((wallet) => (
              <div
                key={wallet.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{wallet.icon}</span>
                  <div>
                    <p className="text-foreground font-medium">{wallet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {wallet.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <Button className="btn-primary" size="sm">
                  Connect
                </Button>
              </div>
            ))}
          </div>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      </div>
    </div>
  );
}
