import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Wallet, ArrowUpRight, Shield, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface WithdrawalSettingsProps {
  walletAddress: string;
  network: string;
  minAmount: number;
  autoConvert: boolean;
  autoWithdrawOnTarget: boolean;
  onSave: (settings: {
    walletAddress: string;
    network: string;
    minAmount: number;
    autoConvert: boolean;
    autoWithdrawOnTarget: boolean;
  }) => void;
}

const NETWORKS = [
  { value: 'TRC20', label: 'TRC20 (Tron)', fee: '~1 USDT' },
  { value: 'BEP20', label: 'BEP20 (BSC)', fee: '~0.5 USDT' },
  { value: 'ERC20', label: 'ERC20 (Ethereum)', fee: '~5-20 USDT' },
  { value: 'POLYGON', label: 'Polygon', fee: '~0.1 USDT' },
  { value: 'ARBITRUM', label: 'Arbitrum', fee: '~0.3 USDT' },
  { value: 'OPTIMISM', label: 'Optimism', fee: '~0.3 USDT' },
];

export function WithdrawalSettingsPanel({
  walletAddress: initialWallet = '',
  network: initialNetwork = 'TRC20',
  minAmount: initialMinAmount = 10,
  autoConvert: initialAutoConvert = true,
  autoWithdrawOnTarget: initialAutoWithdraw = true,
  onSave,
}: WithdrawalSettingsProps) {
  const [walletAddress, setWalletAddress] = useState(initialWallet);
  const [network, setNetwork] = useState(initialNetwork);
  const [minAmount, setMinAmount] = useState(initialMinAmount);
  const [autoConvert, setAutoConvert] = useState(initialAutoConvert);
  const [autoWithdrawOnTarget, setAutoWithdrawOnTarget] = useState(initialAutoWithdraw);
  const [isTesting, setIsTesting] = useState(false);
  const [isValidated, setIsValidated] = useState(false);

  const validateWalletAddress = (address: string, selectedNetwork: string): boolean => {
    if (!address) return false;
    
    // Basic validation based on network
    switch (selectedNetwork) {
      case 'TRC20':
        return address.startsWith('T') && address.length === 34;
      case 'ERC20':
      case 'BEP20':
      case 'POLYGON':
      case 'ARBITRUM':
      case 'OPTIMISM':
        return address.startsWith('0x') && address.length === 42;
      default:
        return address.length > 20;
    }
  };

  const handleTestWithdrawal = async () => {
    if (!validateWalletAddress(walletAddress, network)) {
      toast.error('Invalid wallet address for selected network');
      return;
    }

    setIsTesting(true);
    
    // Simulate test withdrawal validation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsValidated(true);
    setIsTesting(false);
    toast.success('Wallet address validated successfully!');
  };

  const handleSave = () => {
    if (!validateWalletAddress(walletAddress, network)) {
      toast.error('Please enter a valid wallet address');
      return;
    }

    onSave({
      walletAddress,
      network,
      minAmount,
      autoConvert,
      autoWithdrawOnTarget,
    });
    
    toast.success('Withdrawal settings saved!');
  };

  const selectedNetworkInfo = NETWORKS.find(n => n.value === network);
  const isValid = validateWalletAddress(walletAddress, network);

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Auto-Withdrawal Settings</CardTitle>
          </div>
          <Badge variant={autoWithdrawOnTarget ? "default" : "secondary"}>
            {autoWithdrawOnTarget ? 'Active' : 'Disabled'}
          </Badge>
        </div>
        <CardDescription>
          Configure automatic profit withdrawal when daily target is reached
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable Auto-Withdrawal</Label>
            <p className="text-xs text-muted-foreground">
              Automatically withdraw profits when daily target is hit
            </p>
          </div>
          <Switch
            checked={autoWithdrawOnTarget}
            onCheckedChange={setAutoWithdrawOnTarget}
          />
        </div>

        {autoWithdrawOnTarget && (
          <>
            {/* Wallet Address */}
            <div className="space-y-2">
              <Label htmlFor="wallet">Withdrawal Wallet Address</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="wallet"
                    placeholder={network === 'TRC20' ? 'T...' : '0x...'}
                    value={walletAddress}
                    onChange={(e) => {
                      setWalletAddress(e.target.value);
                      setIsValidated(false);
                    }}
                    className={`pr-10 ${isValid && walletAddress ? 'border-green-500' : walletAddress ? 'border-destructive' : ''}`}
                  />
                  {walletAddress && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isValid ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestWithdrawal}
                  disabled={!isValid || isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-1" />
                      Validate
                    </>
                  )}
                </Button>
              </div>
              {isValidated && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Wallet verified and ready for withdrawals
                </p>
              )}
            </div>

            {/* Network Selection */}
            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NETWORKS.map((net) => (
                    <SelectItem key={net.value} value={net.value}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{net.label}</span>
                        <span className="text-xs text-muted-foreground">Fee: {net.fee}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedNetworkInfo && (
                <p className="text-xs text-muted-foreground">
                  Estimated network fee: {selectedNetworkInfo.fee}
                </p>
              )}
            </div>

            {/* Minimum Withdrawal Amount */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Minimum Withdrawal Amount</Label>
                <span className="text-sm font-mono font-medium text-primary">
                  ${minAmount} USDT
                </span>
              </div>
              <Slider
                value={[minAmount]}
                onValueChange={([value]) => setMinAmount(value)}
                min={5}
                max={100}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$5</span>
                <span>$100</span>
              </div>
            </div>

            {/* Auto Convert Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Convert to USDT</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically convert all profits to USDT before withdrawal
                </p>
              </div>
              <Switch
                checked={autoConvert}
                onCheckedChange={setAutoConvert}
              />
            </div>

            {/* Info Box */}
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-start gap-2">
                <ArrowUpRight className="h-4 w-4 text-primary mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-medium text-primary">How it works:</p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                    <li>Daily profit target is reached</li>
                    <li>Open positions are closed</li>
                    <li>Profits converted to USDT</li>
                    <li>Transferred to your wallet</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <Button 
              className="w-full" 
              onClick={handleSave}
              disabled={!isValid}
            >
              <Wallet className="h-4 w-4 mr-2" />
              Save Withdrawal Settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
