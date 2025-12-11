import { useState } from 'react';
import { airdropData } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Gift, Search, Bell, CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Airdrops() {
  const [walletAddress, setWalletAddress] = useState('');
  const [airdrops] = useState(airdropData);

  const eligibleCount = airdrops.filter((a) => a.status === 'claimable').length;

  const getStatusBadge = (status: string, eligibility: string) => {
    switch (status) {
      case 'claimable':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
            <CheckCircle className="w-3 h-3" />
            {eligibility}
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3" />
            {eligibility}
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30">
            <XCircle className="w-3 h-3" />
            {eligibility}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Airdrop Discovery</h1>
          <span className="live-indicator">{eligibleCount} Eligible</span>
        </div>
      </div>

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

      {/* Airdrops Table */}
      <div className="card-terminal overflow-x-auto">
        <table className="table-terminal">
          <thead>
            <tr className="bg-secondary/50">
              <th>Project</th>
              <th>Token</th>
              <th>Network</th>
              <th>Eligibility</th>
              <th>Potential Value</th>
              <th>Claim Deadline</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {airdrops.map((airdrop) => (
              <tr key={airdrop.id} className="hover:bg-secondary/30">
                <td className="font-medium text-foreground">{airdrop.project}</td>
                <td className="text-muted-foreground">{airdrop.token}</td>
                <td className="text-muted-foreground">{airdrop.network}</td>
                <td>{getStatusBadge(airdrop.status, airdrop.eligibility)}</td>
                <td className="font-mono text-primary">
                  ${airdrop.potentialValue.toLocaleString()}
                </td>
                <td className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {airdrop.claimDeadline}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {airdrop.status === 'claimable' && (
                      <Button size="sm" className="btn-primary h-7 px-4">
                        Claim
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground">
                      <Bell className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
