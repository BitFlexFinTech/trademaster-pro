import { useState } from 'react';
import { useWalletConnect } from '@/hooks/useWalletConnect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Search, Bell, Wallet, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function Airdrops() {
  const [walletAddress, setWalletAddress] = useState('');
  const { wallets, supportedWallets, connectWallet, connecting, loading } = useWalletConnect();

  const connectedWallets = wallets.filter(w => w.isConnected);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Airdrop Discovery</h1>
          <span className="live-indicator">{connectedWallets.length} Wallets</span>
        </div>
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
              <Button className="btn-primary gap-2">
                <Search className="w-4 h-4" />
                Check Eligibility
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Supports Ethereum, Solana, Polygon, Arbitrum, Optimism, and more
            </p>
          </div>

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
                        <span className="text-xs text-primary flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Connected
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="btn-primary h-7 px-4 text-xs"
                          onClick={() => connectWallet(wallet.id)}
                          disabled={!!connecting}
                        >
                          {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
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
                    <span className="text-xs text-muted-foreground">{wallet.chain}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {connectedWallets.length === 0 && !loading && (
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
