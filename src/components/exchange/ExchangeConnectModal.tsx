import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface ExchangeConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exchange: {
    name: string;
    color: string;
    requiresPassphrase?: boolean;
  } | null;
  onConnected: () => void;
}

const PERMISSIONS = [
  { id: 'read', label: 'Read Balance', description: 'View your account balance' },
  { id: 'trade', label: 'Trading', description: 'Execute trades on your behalf' },
  { id: 'withdraw', label: 'Withdraw', description: 'Withdraw funds (not recommended)' },
];

export function ExchangeConnectModal({ open, onOpenChange, exchange, onConnected }: ExchangeConnectModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['read', 'trade']);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; balances?: unknown[]; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const requiresPassphrase = exchange?.name === 'KuCoin' || exchange?.name === 'OKX';

  const handleTestConnection = async () => {
    if (!apiKey || !apiSecret) {
      toast({ title: 'Error', description: 'Please enter both API key and secret', variant: 'destructive' });
      return;
    }

    if (requiresPassphrase && !passphrase) {
      toast({ title: 'Error', description: `${exchange?.name} requires a passphrase`, variant: 'destructive' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-exchange-connection', {
        body: {
          exchange: exchange?.name,
          apiKey,
          apiSecret,
          passphrase: requiresPassphrase ? passphrase : undefined,
        }
      });

      if (error) throw error;

      setTestResult(data);

      if (data.success) {
        toast({ 
          title: 'Connection Successful', 
          description: `API verified for ${exchange?.name}. Found ${data.balances?.length || 0} assets.` 
        });
      } else {
        toast({ 
          title: 'Connection Failed', 
          description: data.error || 'Invalid API credentials',
          variant: 'destructive' 
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({ success: false, error: message });
      toast({ title: 'Connection Failed', description: message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async () => {
    if (!user || !exchange) return;
    if (!testResult?.success) {
      toast({ title: 'Test Required', description: 'Please test your connection first', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      // Encrypt API key and secret
      const { data: encryptedData, error: encryptError } = await supabase.functions.invoke('encrypt-api-key', {
        body: {
          apiKey,
          apiSecret,
          passphrase: requiresPassphrase ? passphrase : undefined,
        }
      });

      if (encryptError) throw encryptError;

      // Store connection with encrypted credentials
      const { error } = await supabase
        .from('exchange_connections')
        .upsert({
          user_id: user.id,
          exchange_name: exchange.name,
          api_key_hash: btoa(apiKey.slice(0, 4) + '****' + apiKey.slice(-4)),
          encrypted_api_key: encryptedData.encryptedApiKey,
          encrypted_api_secret: encryptedData.encryptedSecret,
          encrypted_passphrase: encryptedData.encryptedPassphrase,
          encryption_iv: encryptedData.iv,
          is_connected: true,
          permissions: selectedPermissions,
          last_verified_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,exchange_name',
        });

      if (error) throw error;

      toast({ title: 'Exchange Connected', description: `${exchange.name} has been connected successfully` });
      onConnected();
      onOpenChange(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error connecting exchange:', error);
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    setTestResult(null);
    setSelectedPermissions(['read', 'trade']);
  };

  const togglePermission = (permission: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permission) 
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full"
              style={{ backgroundColor: exchange?.color || '#00ff88' }}
            />
            Connect {exchange?.name}
          </DialogTitle>
          <DialogDescription>
            Enter your API credentials to connect your exchange account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Security Notice */}
          <div className="flex items-start gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
            <Shield className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Your credentials are secure</p>
              <p className="text-muted-foreground">API keys are encrypted with AES-256-GCM and never stored in plain text.</p>
            </div>
          </div>

          {/* API Key */}
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="mt-1.5 font-mono bg-muted/50"
            />
          </div>

          {/* API Secret */}
          <div>
            <Label htmlFor="apiSecret">API Secret</Label>
            <div className="relative mt-1.5">
              <Input
                id="apiSecret"
                type={showSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your API secret"
                className="font-mono bg-muted/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Passphrase (for KuCoin/OKX) */}
          {requiresPassphrase && (
            <div>
              <Label htmlFor="passphrase">API Passphrase</Label>
              <div className="relative mt-1.5">
                <Input
                  id="passphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={`Enter your ${exchange?.name} passphrase`}
                  className="font-mono bg-muted/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {exchange?.name} requires an API passphrase set during key creation.
              </p>
            </div>
          )}

          {/* Permissions */}
          <div>
            <Label className="mb-2 block">API Permissions</Label>
            <div className="space-y-2">
              {PERMISSIONS.map((perm) => (
                <div
                  key={perm.id}
                  className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                    perm.id === 'withdraw' ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                  }`}
                >
                  <Checkbox
                    id={perm.id}
                    checked={selectedPermissions.includes(perm.id)}
                    onCheckedChange={() => togglePermission(perm.id)}
                  />
                  <div className="flex-1">
                    <label htmlFor={perm.id} className="text-sm font-medium cursor-pointer">
                      {perm.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  </div>
                  {perm.id === 'withdraw' && (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              testResult.success ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
            }`}>
              {testResult.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Connection verified - {testResult.balances?.length || 0} assets found
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  <span className="text-sm font-medium">{testResult.error || 'Connection failed'}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleTestConnection}
            disabled={testing || !apiKey || !apiSecret || (requiresPassphrase && !passphrase)}
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
          <Button
            className="flex-1 btn-primary"
            onClick={handleConnect}
            disabled={loading || !testResult?.success}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Exchange'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
