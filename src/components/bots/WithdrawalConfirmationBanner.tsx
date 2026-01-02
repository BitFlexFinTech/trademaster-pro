import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowUpRight, 
  CheckCircle, 
  Clock, 
  ExternalLink, 
  Loader2, 
  XCircle,
  Copy,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

interface WithdrawalStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  network: string;
  txHash?: string;
  walletAddress: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

interface WithdrawalConfirmationBannerProps {
  withdrawal: WithdrawalStatus;
  onDismiss?: () => void;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20',
    label: 'Pending',
    progress: 25,
  },
  processing: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    label: 'Processing',
    progress: 60,
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10 border-green-500/20',
    label: 'Completed',
    progress: 100,
  },
  failed: {
    icon: XCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10 border-destructive/20',
    label: 'Failed',
    progress: 0,
  },
};

const EXPLORER_URLS: Record<string, string> = {
  TRC20: 'https://tronscan.org/#/transaction/',
  ERC20: 'https://etherscan.io/tx/',
  BEP20: 'https://bscscan.com/tx/',
  POLYGON: 'https://polygonscan.com/tx/',
  ARBITRUM: 'https://arbiscan.io/tx/',
  OPTIMISM: 'https://optimistic.etherscan.io/tx/',
};

export function WithdrawalConfirmationBanner({ 
  withdrawal, 
  onDismiss 
}: WithdrawalConfirmationBannerProps) {
  const [copied, setCopied] = useState(false);
  const config = STATUS_CONFIG[withdrawal.status];
  const StatusIcon = config.icon;

  const explorerUrl = withdrawal.txHash 
    ? `${EXPLORER_URLS[withdrawal.network] || ''}${withdrawal.txHash}`
    : null;

  const handleCopyTxHash = () => {
    if (withdrawal.txHash) {
      navigator.clipboard.writeText(withdrawal.txHash);
      setCopied(true);
      toast.success('Transaction hash copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Card className={`border ${config.bgColor} p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className={`p-2 rounded-full ${config.bgColor}`}>
            <StatusIcon className={`h-5 w-5 ${config.color} ${withdrawal.status === 'processing' ? 'animate-spin' : ''}`} />
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">Profit Withdrawal</h4>
              <Badge variant="outline" className={config.color}>
                {config.label}
              </Badge>
              <Badge variant="secondary">{withdrawal.network}</Badge>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Amount: </span>
                <span className="font-mono font-medium text-green-500">
                  ${withdrawal.amount.toFixed(2)} {withdrawal.currency}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">To: </span>
                <span className="font-mono text-xs">
                  {truncateAddress(withdrawal.walletAddress)}
                </span>
              </div>
            </div>

            {withdrawal.status !== 'pending' && (
              <Progress value={config.progress} className="h-1.5" />
            )}

            {withdrawal.txHash && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">TX:</span>
                <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                  {truncateHash(withdrawal.txHash)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={handleCopyTxHash}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-0.5"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {withdrawal.error && (
              <p className="text-xs text-destructive">
                Error: {withdrawal.error}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Started: {new Date(withdrawal.createdAt).toLocaleTimeString()}</span>
              {withdrawal.completedAt && (
                <span>Completed: {new Date(withdrawal.completedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </div>

        {(withdrawal.status === 'completed' || withdrawal.status === 'failed') && onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </Card>
  );
}

// Hook to simulate/manage withdrawal status updates
export function useWithdrawalStatus(initialStatus?: WithdrawalStatus) {
  const [status, setStatus] = useState<WithdrawalStatus | null>(initialStatus || null);

  useEffect(() => {
    if (!status || status.status === 'completed' || status.status === 'failed') {
      return;
    }

    // Simulate status progression
    const timer = setTimeout(() => {
      if (status.status === 'pending') {
        setStatus(prev => prev ? { ...prev, status: 'processing' } : null);
      } else if (status.status === 'processing') {
        setStatus(prev => prev ? {
          ...prev,
          status: 'completed',
          completedAt: new Date().toISOString(),
          txHash: '0x' + Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2),
        } : null);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [status?.status]);

  return { status, setStatus };
}
