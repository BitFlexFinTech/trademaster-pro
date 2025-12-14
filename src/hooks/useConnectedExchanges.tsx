import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface ConnectedExchange {
  name: string;
  isConnected: boolean;
  lastVerified: string | null;
  hasApiCredentials: boolean; // NEW: Check if API credentials are properly configured
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
        .select('exchange_name, is_connected, last_verified_at, encrypted_api_key, encrypted_api_secret, encryption_iv')
        .eq('user_id', user.id)
        .eq('is_connected', true);

      if (error) throw error;

      const exchanges = (data || []).map(conn => ({
        name: conn.exchange_name,
        isConnected: conn.is_connected || false,
        lastVerified: conn.last_verified_at,
        // Check if all required API credentials are present
        hasApiCredentials: !!(conn.encrypted_api_key && conn.encrypted_api_secret && conn.encryption_iv),
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
  
  // Get exchanges with valid API credentials (ready for live trading)
  const readyForLiveTrading = connectedExchanges.filter(e => e.hasApiCredentials);
  const readyExchangeNames = readyForLiveTrading.map(e => e.name);
  
  // Get exchanges that need re-connection (missing credentials)
  const needsReconnection = connectedExchanges.filter(e => !e.hasApiCredentials);

  return {
    connectedExchanges,
    connectedExchangeNames,
    readyForLiveTrading,
    readyExchangeNames,
    needsReconnection,
    loading,
    refetch: fetchConnections,
    hasConnections: connectedExchanges.length > 0,
    hasValidCredentials: readyForLiveTrading.length > 0,
  };
}
