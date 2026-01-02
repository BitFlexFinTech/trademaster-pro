import { useState, useCallback, useEffect } from 'react';

export interface Notification {
  id: string;
  type: 'warning' | 'error' | 'success' | 'info';
  title: string;
  message: string;
  autoDismiss?: boolean;
  duration?: number;
  dismissable?: boolean;
}

interface NotificationState {
  notifications: Notification[];
  dismissedIds: Set<string>;
}

const MAX_NOTIFICATIONS = 5;
const DEFAULT_DURATION = 10000; // 10 seconds

// Session storage key for dismissed notifications
const DISMISSED_KEY = 'greenback-dismissed-notifications';

// Load dismissed IDs from session storage
const loadDismissedIds = (): Set<string> => {
  try {
    const stored = sessionStorage.getItem(DISMISSED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

// Save dismissed IDs to session storage
const saveDismissedIds = (ids: Set<string>) => {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
};

// Global state for notifications (singleton pattern)
let globalState: NotificationState = {
  notifications: [],
  dismissedIds: loadDismissedIds(),
};
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach(listener => listener());
};

export function useNotificationStack() {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const notify = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = `${notification.type}-${notification.title}-${Date.now()}`;
    
    // Skip if already dismissed in this session
    if (globalState.dismissedIds.has(id.split('-').slice(0, -1).join('-'))) {
      return;
    }

    const newNotification: Notification = {
      ...notification,
      id,
      autoDismiss: notification.autoDismiss ?? true,
      duration: notification.duration ?? DEFAULT_DURATION,
      dismissable: notification.dismissable ?? true,
    };

    globalState = {
      ...globalState,
      notifications: [newNotification, ...globalState.notifications].slice(0, MAX_NOTIFICATIONS),
    };
    notifyListeners();

    // Auto-dismiss after duration
    if (newNotification.autoDismiss && newNotification.duration) {
      setTimeout(() => {
        dismiss(id);
      }, newNotification.duration);
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    // Extract base ID (without timestamp) for session persistence
    const baseId = id.split('-').slice(0, -1).join('-');
    
    const newDismissedIds = new Set(globalState.dismissedIds);
    newDismissedIds.add(baseId);
    saveDismissedIds(newDismissedIds);

    globalState = {
      ...globalState,
      notifications: globalState.notifications.filter(n => n.id !== id),
      dismissedIds: newDismissedIds,
    };
    notifyListeners();
  }, []);

  const dismissAll = useCallback(() => {
    const newDismissedIds = new Set(globalState.dismissedIds);
    globalState.notifications.forEach(n => {
      const baseId = n.id.split('-').slice(0, -1).join('-');
      newDismissedIds.add(baseId);
    });
    saveDismissedIds(newDismissedIds);

    globalState = {
      ...globalState,
      notifications: [],
      dismissedIds: newDismissedIds,
    };
    notifyListeners();
  }, []);

  const clearDismissedHistory = useCallback(() => {
    sessionStorage.removeItem(DISMISSED_KEY);
    globalState = {
      ...globalState,
      dismissedIds: new Set(),
    };
    notifyListeners();
  }, []);

  return {
    notifications: globalState.notifications,
    notify,
    dismiss,
    dismissAll,
    clearDismissedHistory,
  };
}
