import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Airdrop {
  id: string;
  protocol: string;
  name: string;
  status: 'eligible' | 'claimed' | 'not_eligible' | 'pending';
  estimatedValue: string;
  deadline: string | null;
  chain: string;
  claimUrl: string | null;
}

export function useAirdrops() {
  const [airdrops, setAirdrops] = useState<Airdrop[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const checkEligibility = useCallback(async (walletAddress: string) => {
    if (!walletAddress || walletAddress.length < 10) {
      toast.error('Please enter a valid wallet address');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-airdrops', {
        body: { walletAddress },
      });

      if (error) throw error;

      setAirdrops(data.airdrops || []);
      setLastChecked(new Date().toISOString());
      
      const eligibleCount = (data.airdrops || []).filter(
        (a: Airdrop) => a.status === 'eligible'
      ).length;
      
      if (eligibleCount > 0) {
        toast.success(`Found ${eligibleCount} eligible airdrop(s)!`);
      } else {
        toast.info('No eligible airdrops found for this wallet');
      }
    } catch (error) {
      console.error('Error checking airdrops:', error);
      toast.error('Failed to check airdrop eligibility');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setAirdrops([]);
    setLastChecked(null);
  }, []);

  return {
    airdrops,
    loading,
    lastChecked,
    checkEligibility,
    clearResults,
  };
}
