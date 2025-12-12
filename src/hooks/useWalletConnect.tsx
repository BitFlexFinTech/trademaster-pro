import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface WalletConnection {
  id: string;
  walletType: string;
  address: string;
  chain: string | null;
  isConnected: boolean;
  connectedAt: string;
}

const SUPPORTED_WALLETS = [
  { id: 'metamask', name: 'MetaMask', icon: '🦊', chains: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism'] },
  { id: 'phantom', name: 'Phantom', icon: '👻', chains: ['Solana'] },
  { id: 'walletconnect', name: 'WalletConnect', icon: '🔗', chains: ['Multi-chain'] },
  { id: 'coinbase', name: 'Coinbase Wallet', icon: '💰', chains: ['Ethereum', 'Base'] },
];

export function useWalletConnect() {
  const { user } = useAuth();
  const [wallets, setWallets] = useState<WalletConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchWallets = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wallet_connections')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      const mapped: WalletConnection[] = (data || []).map(w => ({
        id: w.id,
        walletType: w.wallet_type,
        address: w.address,
        chain: w.chain,
        isConnected: w.is_connected || false,
        connectedAt: w.connected_at || '',
      }));

      setWallets(mapped);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const connectWallet = async (walletType: string) => {
    if (!user) {
      toast.error('Please login to connect wallets');
      return null;
    }

    setConnecting(walletType);

    try {
      // Check if wallet provider exists
      let address = '';
      let chain = '';

      if (walletType === 'metamask') {
        if (typeof window !== 'undefined' && (window as any).ethereum) {
          const accounts = await (window as any).ethereum.request({ 
            method: 'eth_requestAccounts' 
          });
          address = accounts[0];
          chain = 'Ethereum';
        } else {
          toast.error('MetaMask not installed');
          return null;
        }
      } else if (walletType === 'phantom') {
        if (typeof window !== 'undefined' && (window as any).solana?.isPhantom) {
          const resp = await (window as any).solana.connect();
          address = resp.publicKey.toString();
          chain = 'Solana';
        } else {
          toast.error('Phantom not installed');
          return null;
        }
      } else {
        // Simulate for other wallets
        address = `0x${Math.random().toString(16).slice(2, 42)}`;
        chain = SUPPORTED_WALLETS.find(w => w.id === walletType)?.chains[0] || 'Unknown';
      }

      // Save to database
      const { data, error } = await supabase
        .from('wallet_connections')
        .insert({
          user_id: user.id,
          wallet_type: walletType,
          address,
          chain,
          is_connected: true,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(`${SUPPORTED_WALLETS.find(w => w.id === walletType)?.name} connected`);
      fetchWallets();
      return data;
    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      if (error.code === 4001) {
        toast.error('Connection rejected by user');
      } else {
        toast.error('Failed to connect wallet');
      }
      return null;
    } finally {
      setConnecting(null);
    }
  };

  const disconnectWallet = async (walletId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('wallet_connections')
        .delete()
        .eq('id', walletId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Wallet disconnected');
      fetchWallets();
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  return { 
    wallets, 
    supportedWallets: SUPPORTED_WALLETS,
    loading, 
    connecting,
    connectWallet, 
    disconnectWallet,
    refetch: fetchWallets 
  };
}
