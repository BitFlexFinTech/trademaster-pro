import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Alert {
  id: string;
  alertType: string;
  title: string;
  message: string | null;
  data: any;
  isRead: boolean;
  createdAt: string;
}

export function useAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const mappedAlerts: Alert[] = (data || []).map(a => ({
        id: a.id,
        alertType: a.alert_type,
        title: a.title,
        message: a.message,
        data: a.data,
        isRead: a.is_read || false,
        createdAt: a.created_at,
      }));

      setAlerts(mappedAlerts);
      setUnreadCount(mappedAlerts.filter(a => !a.isRead).length);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markAsRead = async (alertId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: true })
        .eq('id', alertId)
        .eq('user_id', user.id);

      if (error) throw error;

      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, isRead: true } : a
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('alerts')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark notifications as read');
    }
  };

  const deleteAlert = async (alertId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('alerts')
        .delete()
        .eq('id', alertId)
        .eq('user_id', user.id);

      if (error) throw error;

      const alertToDelete = alerts.find(a => a.id === alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      if (alertToDelete && !alertToDelete.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Error deleting alert:', error);
      toast.error('Failed to delete notification');
    }
  };

  const deleteAllAlerts = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('alerts')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setAlerts([]);
      setUnreadCount(0);
      toast.success('All notifications deleted');
    } catch (error) {
      console.error('Error deleting all alerts:', error);
      toast.error('Failed to delete notifications');
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('alerts-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newAlert: Alert = {
            id: payload.new.id,
            alertType: payload.new.alert_type,
            title: payload.new.title,
            message: payload.new.message,
            data: payload.new.data,
            isRead: payload.new.is_read || false,
            createdAt: payload.new.created_at,
          };
          setAlerts(prev => [newAlert, ...prev]);
          if (!newAlert.isRead) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteAlert,
    deleteAllAlerts,
    refetch: fetchAlerts,
  };
}
