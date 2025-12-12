import { useState } from 'react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { useAirdrops } from '@/hooks/useAirdrops';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Search, Bell, Wallet, CheckCircle, Clock, XCircle, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function Airdrops() {
  const [walletAddress, setWalletAddress] = useState('');
  const { wallets, supportedWallets, connectWallet, disconnectWallet, connecting, loading } = useWalletConnect();
  const { airdrops, loading: checkingAirdrops, lastChecked, checkEligibility, clearResults } = useAirdrops();

  const connectedWallets = wallets.filter(w => w.isConnected);

  const handleCheckEligibility = () => {
    if (walletAddress) {
      checkEligibility(walletAddress);
    } else if (connectedWallets.length > 0) {
      checkEligibility(connectedWallets[0].address);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'eligible':
        return { icon: CheckCircle, color: 'text-primary', bg: 'bg-primary/10', label: 'Eligible' };
      case 'claimed':
        return { icon: CheckCircle, color: 'text-muted-foreground', bg: 'bg-muted/30', label: 'Claimed' };
      case 'pending':
        return { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Pending' };
      default:
        return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Not Eligible' };
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Airdrop Discovery</h1>
          <span className="live-indicator">{connectedWallets.length} Wallets</span>
        </div>
        {lastChecked && (
          <span className="text-xs text-muted-foreground">
            Last checked: {formatDistanceToNow(new Date(lastChecked), { addSuffix: true })}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-4">
          {/* Wallet Input */}
          <div className="card-terminal p-4">
            <div className="flex items-center gap-4">
              <Input
                type="text"
                placeholder="Enter wallet address (Ethereum, Solana, etc.)"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="flex-1 bg-secondary border-border"
              />
              <Button 
                className="btn-primary gap-2" 
                onClick={handleCheckEligibility}
                disabled={checkingAirdrops || (!walletAddress && connectedWallets.length === 0)}
              >
                {checkingAirdrops ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Check Eligibility
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Supports Ethereum, Solana, Polygon, Arbitrum, Optimism, and more
            </p>
          </div>

          {/* Airdrop Results */}
          {airdrops.length > 0 && (
            <div className="card-terminal p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Airdrop Eligibility</h3>
                  <Badge variant="default" className="bg-primary">
                    {airdrops.filter(a => a.status === 'eligible').length} Eligible
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={clearResults}>
                  Clear
                </Button>
              </div>

              <div className="space-y-2">
                {airdrops.map((airdrop) => {
                  const config = getStatusConfig(airdrop.status);
                  const Icon = config.icon;
                  
                  return (
                    <div
                      key={airdrop.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border transition-colors',
                        airdrop.status === 'eligible' ? 'border-primary bg-primary/5' : 'border-border bg-secondary/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', config.bg)}>
                          <Icon className={cn('w-4 h-4', config.color)} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{airdrop.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{airdrop.protocol}</span>
                            <span>•</span>
                            <span>{airdrop.chain}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={cn('font-mono font-bold', airdrop.status === 'eligible' ? 'text-primary' : 'text-muted-foreground')}>
                            {airdrop.estimatedValue}
                          </p>
                          <Badge variant="outline" className={cn('text-[10px]', config.color)}>
                            {config.label}
                          </Badge>
                        </div>
                        {airdrop.claimUrl && (
                          <Button
                            size="sm"
                            className="btn-primary gap-1"
                            onClick={() => window.open(airdrop.claimUrl!, '_blank')}
                          >
                            Claim
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Connect Wallets Section */}
          <div className="card-terminal p-4">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Connect DeFi Wallets</h3>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {supportedWallets.map((wallet) => {
                  const connected = wallets.find(w => w.walletType === wallet.id && w.isConnected);
                  return (
                    <div
                      key={wallet.id}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                        connected
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50 hover:border-primary/50'
                      )}
                    >
                      <span className="text-2xl">{wallet.icon}</span>
                      <span className="text-sm text-foreground font-medium">{wallet.name}</span>
                      <span className="text-xs text-muted-foreground">{wallet.chains.join(', ')}</span>
                      {connected ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-primary flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Connected
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive"
                            onClick={() => disconnectWallet(connected.id)}
                          >
                            Disconnect
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="btn-primary h-7 px-4 text-xs"
                          onClick={() => connectWallet(wallet.id)}
                          disabled={!!connecting}
                        >
                          {connecting === wallet.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Connected Wallets */}
          {connectedWallets.length > 0 && (
            <div className="card-terminal p-4">
              <h3 className="font-semibold text-foreground mb-4">Connected Wallets</h3>
              <div className="space-y-3">
                {connectedWallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <div>
                        <p className="text-foreground font-medium">{wallet.walletType}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{wallet.chain}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setWalletAddress(wallet.address);
                          checkEligibility(wallet.address);
                        }}
                      >
                        Check Airdrops
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {connectedWallets.length === 0 && airdrops.length === 0 && !loading && (
            <div className="card-terminal p-8 text-center">
              <Gift className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Wallets Connected</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Connect your DeFi wallets above to check airdrop eligibility across multiple protocols.
              </p>
              <p className="text-xs text-muted-foreground">
                We support MetaMask, Phantom, WalletConnect, and Coinbase Wallet
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
