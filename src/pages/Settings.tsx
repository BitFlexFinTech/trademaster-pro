import { exchangeConnections } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, Link, AlertTriangle } from 'lucide-react';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Exchange Settings</h1>
      </div>

      {/* Exchange Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exchangeConnections.map((exchange) => (
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
              <div>
                <h3 className="font-semibold text-foreground">{exchange.name}</h3>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${exchange.connected ? 'bg-primary' : 'bg-muted-foreground'}`} />
                  {exchange.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>

            <Button className="w-full btn-primary gap-2">
              <Link className="w-4 h-4" />
              Connect
            </Button>
          </div>
        ))}
      </div>

      {/* Security Notice */}
      <div className="card-terminal p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-foreground mb-1">Security Notice</h3>
            <p className="text-sm text-muted-foreground">
              API keys are encrypted with AES-256 before storage. We recommend using read-only keys or keys with limited trading permissions. Never share your API secrets with anyone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
