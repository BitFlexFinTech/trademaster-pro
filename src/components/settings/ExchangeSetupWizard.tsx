import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, AlertTriangle, ArrowRight, ExternalLink, Loader2, Shield, Zap, Wallet, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ExchangeCapabilities {
  spotEnabled: boolean;
  futuresEnabled: boolean;
  marginEnabled: boolean;
  permissions: string[];
  spotBalance: number;
  futuresBalance: number;
  fundingBalance: number;
}

interface WalletBalances {
  spot: number;
  futures: number;
  funding: number;
  total: number;
}

type ExchangeType = 'binance' | 'okx' | 'bybit';

const EXCHANGE_INFO: Record<ExchangeType, {
  name: string;
  logo: string;
  futuresGuide: string;
  apiGuide: string;
  requiredPermissions: string[];
}> = {
  binance: {
    name: 'Binance',
    logo: '🟡',
    futuresGuide: 'https://www.binance.com/en/support/faq/how-to-open-a-binance-futures-account',
    apiGuide: 'https://www.binance.com/en/support/faq/how-to-create-api-keys',
    requiredPermissions: ['Enable Reading', 'Enable Spot Trading', 'Enable Futures'],
  },
  okx: {
    name: 'OKX',
    logo: '⚫',
    futuresGuide: 'https://www.okx.com/help/how-do-i-enable-futures-trading',
    apiGuide: 'https://www.okx.com/help/how-do-i-create-an-api-key',
    requiredPermissions: ['Read', 'Trade', 'Withdraw (optional)'],
  },
  bybit: {
    name: 'Bybit',
    logo: '🟠',
    futuresGuide: 'https://www.bybit.com/en-US/help-center/bybitHC_Article?id=360039749613',
    apiGuide: 'https://www.bybit.com/en-US/help-center/bybitHC_Article?id=360039749613',
    requiredPermissions: ['Read', 'Contract Trading', 'Wallet'],
  },
};

const STEPS = [
  { id: 1, title: 'Select Exchange', description: 'Choose your exchange' },
  { id: 2, title: 'Enter API Keys', description: 'Add credentials' },
  { id: 3, title: 'Check Permissions', description: 'Validate API key' },
  { id: 4, title: 'Enable Futures', description: 'Setup futures trading' },
  { id: 5, title: 'Verify Balance', description: 'Check wallet balance' },
  { id: 6, title: 'Complete', description: 'Ready to trade!' },
];

export function ExchangeSetupWizard({ open, onOpenChange, onComplete }: ExchangeSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [capabilities, setCapabilities] = useState<ExchangeCapabilities | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [hasExistingKeys, setHasExistingKeys] = useState(false);
  
  // API key entry state
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  
  // Wallet transfer state
  const [walletBalances, setWalletBalances] = useState<WalletBalances | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [sourceWallet, setSourceWallet] = useState<'funding' | 'spot'>('funding');
  const [isTransferring, setIsTransferring] = useState(false);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [canTransfer, setCanTransfer] = useState(false);

  const handleSelectExchange = async (exchange: ExchangeType) => {
    setSelectedExchange(exchange);
    setCapabilities(null);
    setCheckError(null);
    setApiKey('');
    setApiSecret('');
    setPassphrase('');
    
    // Check if credentials already exist
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: connection } = await supabase
        .from('exchange_connections')
        .select('encrypted_api_key')
        .eq('user_id', user.id)
        .ilike('exchange_name', exchange)
        .single();
      
      setHasExistingKeys(!!connection?.encrypted_api_key);
    }
    
    setCurrentStep(2);
  };

  const handleSaveApiKeys = async () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      setCheckError('API Key and Secret are required');
      return;
    }
    
    setIsSavingKeys(true);
    setCheckError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckError('Please log in first');
        return;
      }
      
      // Use encrypt-api-key edge function to securely store credentials
      const { data, error } = await supabase.functions.invoke('encrypt-api-key', {
        body: {
          exchange: selectedExchange,
          apiKey,
          apiSecret,
          passphrase: passphrase || undefined,
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setHasExistingKeys(true);
        toast.success('API keys saved securely');
        setCurrentStep(3); // Proceed to check permissions
      } else {
        setCheckError(data?.error || 'Failed to save API keys');
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Failed to save keys');
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleCheckPermissions = async () => {
    if (!selectedExchange) return;
    
    setIsChecking(true);
    setCheckError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckError('Please log in to check exchange permissions');
        return;
      }

      // Check for existing credentials (case-insensitive)
      const { data: connection } = await supabase
        .from('exchange_connections')
        .select('encrypted_api_key, encrypted_api_secret, encrypted_passphrase, encryption_iv')
        .eq('user_id', user.id)
        .ilike('exchange_name', selectedExchange)
        .single();

      if (!connection?.encrypted_api_key) {
        setCheckError(`No API credentials found. Please enter your API keys.`);
        setCurrentStep(2); // Go back to key entry
        return;
      }

      // Use binance-futures-positions to check capabilities (it handles decryption)
      const { data, error } = await supabase.functions.invoke('binance-futures-positions', {
        body: { checkCapabilities: true, exchange: selectedExchange }
      });
      
      if (error) throw error;
      
      if (data?.success || data?.positions !== undefined) {
        setCapabilities({
          spotEnabled: true,
          futuresEnabled: data?.futuresEnabled ?? (data?.positions !== undefined),
          marginEnabled: data?.marginEnabled ?? false,
          permissions: data?.permissions ?? ['Read', 'Trade'],
          spotBalance: data?.spotBalance ?? 0,
          futuresBalance: data?.futuresBalance ?? data?.totalBalance ?? 0,
          fundingBalance: data?.fundingBalance ?? 0,
        });
        
        // Auto-advance based on capabilities
        const futuresBalance = data?.futuresBalance ?? data?.totalBalance ?? 0;
        if ((data?.futuresEnabled || data?.positions !== undefined) && futuresBalance > 10) {
          setCurrentStep(6); // All good!
        } else if (data?.futuresEnabled || data?.positions !== undefined) {
          setCurrentStep(5); // Need to transfer balance
        } else {
          setCurrentStep(4); // Need to enable futures
        }
      } else {
        setCheckError(data?.error || 'Failed to check permissions. Make sure your API key has futures permissions.');
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsChecking(false);
    }
  };

  const handleComplete = () => {
    toast.success('Exchange setup complete!', {
      description: `${selectedExchange?.toUpperCase()} is ready for bidirectional trading`,
    });
    onComplete?.();
    onOpenChange(false);
    setCurrentStep(1);
    setSelectedExchange(null);
    setCapabilities(null);
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the exchange you want to configure for futures/leverage trading:
      </p>
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(EXCHANGE_INFO) as ExchangeType[]).map((key) => {
          const exchange = EXCHANGE_INFO[key];
          return (
            <Button
              key={key}
              variant="outline"
              className={cn(
                "h-20 flex flex-col gap-1",
                selectedExchange === key && "border-primary bg-primary/10"
              )}
              onClick={() => handleSelectExchange(key)}
            >
              <span className="text-2xl">{exchange.logo}</span>
              <span className="text-sm font-medium">{exchange.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      {hasExistingKeys ? (
        <>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              API credentials found for {selectedExchange?.toUpperCase()}
            </p>
          </div>
          <Button onClick={() => setCurrentStep(3)} className="w-full">
            Continue to Check Permissions
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <Button variant="outline" onClick={() => setHasExistingKeys(false)} className="w-full">
            Enter New API Keys
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Enter your {selectedExchange?.toUpperCase()} API credentials. Your keys are encrypted and stored securely.
          </p>
          
          {selectedExchange && (
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href={EXCHANGE_INFO[selectedExchange].apiGuide} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                How to create API key on {EXCHANGE_INFO[selectedExchange].name}
              </a>
            </Button>
          )}
          
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiSecret">API Secret *</Label>
              <Input
                id="apiSecret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter your API secret"
              />
            </div>
            
            {(selectedExchange === 'okx') && (
              <div className="space-y-2">
                <Label htmlFor="passphrase">Passphrase</Label>
                <Input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter your passphrase (OKX only)"
                />
              </div>
            )}
          </div>
          
          {checkError && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {checkError}
              </p>
            </div>
          )}
          
          <Button 
            onClick={handleSaveApiKeys} 
            disabled={isSavingKeys || !apiKey || !apiSecret} 
            className="w-full"
          >
            {isSavingKeys ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Key className="h-4 w-4 mr-2" />
                Save API Keys
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We'll check if your {selectedExchange?.toUpperCase()} API key has the required permissions:
      </p>
      
      {selectedExchange && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Required Permissions
            </h4>
            <ul className="space-y-1">
              {EXCHANGE_INFO[selectedExchange].requiredPermissions.map((perm, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {perm}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      {checkError && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {checkError}
          </p>
        </div>
      )}
      
      <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
        {isChecking ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            Check API Permissions
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );

  const renderStep4_EnableFutures = () => (
    <div className="space-y-4">
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Futures trading is not enabled on your {selectedExchange?.toUpperCase()} account
        </p>
      </div>
      
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h4 className="font-medium">How to enable futures:</h4>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">1.</span>
              Log into {selectedExchange?.toUpperCase()} on web or app
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">2.</span>
              Go to Derivatives/Futures section
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">3.</span>
              Complete the futures trading quiz
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">4.</span>
              Update your API key with futures permissions
            </li>
          </ol>
          
          {selectedExchange && (
            <Button variant="outline" className="w-full" asChild>
              <a href={EXCHANGE_INFO[selectedExchange].futuresGuide} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open {EXCHANGE_INFO[selectedExchange].name} Futures Guide
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
      
      <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
        {isChecking ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Re-checking...
          </>
        ) : (
          <>
            I've Enabled Futures - Check Again
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );

  const renderStep5_VerifyBalance = () => {
    // Fetch wallet balances on mount
    const fetchBalances = async () => {
      if (selectedExchange !== 'binance' || isLoadingBalances) return;
      
      setIsLoadingBalances(true);
      try {
        // Check transfer permission
        const { data: permData } = await supabase.functions.invoke('binance-wallet-transfer', {
          body: { action: 'checkTransferPermission' }
        });
        setCanTransfer(permData?.canTransfer ?? false);
        
        // Get all wallet balances
        const { data, error } = await supabase.functions.invoke('binance-wallet-transfer', {
          body: { action: 'getBalances' }
        });
        
        if (data?.success) {
          setWalletBalances(data.balances);
        }
      } catch (e) {
        console.error('Failed to fetch balances:', e);
      } finally {
        setIsLoadingBalances(false);
      }
    };
    
    // Fetch on step load
    if (!walletBalances && !isLoadingBalances && selectedExchange === 'binance') {
      fetchBalances();
    }
    
    const handleTransfer = async () => {
      if (!transferAmount || parseFloat(transferAmount) <= 0) {
        toast.error('Please enter a valid amount');
        return;
      }
      
      setIsTransferring(true);
      try {
        const transferType = sourceWallet === 'funding' ? 'FUNDING_UMFUTURE' : 'MAIN_UMFUTURE';
        const { data, error } = await supabase.functions.invoke('binance-wallet-transfer', {
          body: {
            action: 'transfer',
            fromType: transferType,
            asset: 'USDT',
            amount: parseFloat(transferAmount),
          }
        });
        
        if (data?.success) {
          toast.success(`Transferred $${transferAmount} to Futures wallet`);
          setTransferAmount('');
          // Refresh balances
          const { data: newBalances } = await supabase.functions.invoke('binance-wallet-transfer', {
            body: { action: 'getBalances' }
          });
          if (newBalances?.success) {
            setWalletBalances(newBalances.balances);
          }
          // Check if we can proceed
          if ((newBalances?.balances?.futures ?? 0) >= 10) {
            setCurrentStep(6);
          }
        } else {
          toast.error(data?.error || 'Transfer failed');
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Transfer failed');
      } finally {
        setIsTransferring(false);
      }
    };
    
    const maxTransfer = sourceWallet === 'funding' 
      ? walletBalances?.funding ?? 0 
      : walletBalances?.spot ?? 0;
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <Check className="h-5 w-5 text-emerald-500" />
          <span className="text-sm">Futures trading enabled!</span>
        </div>
        
        {/* Wallet Balances */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Wallet Balances
              {isLoadingBalances && <Loader2 className="h-3 w-3 animate-spin" />}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Spot Wallet</span>
                <span className="font-mono font-bold">${walletBalances?.spot?.toFixed(2) ?? '0.00'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Funding Wallet</span>
                <span className="font-mono font-bold">${walletBalances?.funding?.toFixed(2) ?? '0.00'}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm text-muted-foreground">Futures Wallet</span>
                <span className={cn(
                  "font-mono font-bold",
                  (walletBalances?.futures ?? 0) < 10 ? "text-amber-500" : "text-emerald-500"
                )}>
                  ${walletBalances?.futures?.toFixed(2) ?? '0.00'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Transfer Form - Only for Binance */}
        {selectedExchange === 'binance' && canTransfer && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h4 className="font-medium">Transfer to Futures</h4>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sourceWallet === 'funding' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceWallet('funding')}
                  className="text-xs"
                >
                  From Funding
                </Button>
                <Button
                  variant={sourceWallet === 'spot' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSourceWallet('spot')}
                  className="text-xs"
                >
                  From Spot
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Amount (USDT)"
                  className="flex-1"
                  min={0}
                  max={maxTransfer}
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setTransferAmount(maxTransfer.toFixed(2))}
                >
                  MAX
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Available: ${maxTransfer.toFixed(2)} {sourceWallet === 'funding' ? '(Funding)' : '(Spot)'}
              </p>
              
              <Button 
                onClick={handleTransfer} 
                disabled={isTransferring || !transferAmount || parseFloat(transferAmount) <= 0}
                className="w-full"
              >
                {isTransferring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    Transfer ${transferAmount || '0'} to Futures
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
        
        {selectedExchange === 'binance' && !canTransfer && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              API key doesn't have Universal Transfer permission. Please enable it in Binance API settings.
            </p>
          </div>
        )}
        
        {(walletBalances?.futures ?? 0) < 10 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Transfer at least $10 USDT to your Futures wallet to start trading
            </p>
          </div>
        )}
        
        <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Checking Balance...
            </>
          ) : (walletBalances?.futures ?? 0) >= 10 ? (
            <>
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          ) : (
            <>
              I've Transferred Funds - Check Again
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    );
  };

  const renderStep6_Complete = () => (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Check className="h-8 w-8 text-emerald-500" />
      </div>
      
      <h3 className="text-lg font-bold">Setup Complete!</h3>
      <p className="text-sm text-muted-foreground">
        Your {selectedExchange?.toUpperCase()} account is ready for bidirectional trading.
      </p>
      
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Spot Trading: Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Futures Trading: Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Futures Balance: ${capabilities?.futuresBalance.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">LONG & SHORT trades enabled</span>
          </div>
        </CardContent>
      </Card>
      
      <Button onClick={handleComplete} className="w-full">
        Start Trading
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Exchange Futures Setup
          </DialogTitle>
          <DialogDescription>
            Configure your exchange for bidirectional trading (LONG & SHORT)
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Steps */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex-1 flex items-center">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                currentStep >= step.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <Check className="h-3 w-3" /> : step.id}
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-1",
                  currentStep > step.id ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
        
        {/* Step Content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4_EnableFutures()}
        {currentStep === 5 && renderStep5_VerifyBalance()}
        {currentStep === 6 && renderStep6_Complete()}
      </DialogContent>
    </Dialog>
  );
}
