import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface ConnectedExchange {
  name: string;
  isConnected: boolean;
  lastVerified: string | null;
}

export function useConnectedExchanges() {
  const { user } = useAuth();
  const [connectedExchanges, setConnectedExchanges] = useState<ConnectedExchange[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('exchange_connections')
        .select('exchange_name, is_connected, last_verified_at')
        .eq('user_id', user.id)
        .eq('is_connected', true);

      if (error) throw error;

      const exchanges = (data || []).map(conn => ({
        name: conn.exchange_name,
        isConnected: conn.is_connected || false,
        lastVerified: conn.last_verified_at,
      }));

      setConnectedExchanges(exchanges);
    } catch (err) {
      console.error('Failed to fetch connected exchanges:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Get just the exchange names for easy filtering
  const connectedExchangeNames = connectedExchanges.map(e => e.name);

  return {
    connectedExchanges,
    connectedExchangeNames,
    loading,
    refetch: fetchConnections,
    hasConnections: connectedExchanges.length > 0,
  };
}
