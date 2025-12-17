// Sentry Configuration for Production Error Monitoring
// This module initializes Sentry for error tracking in production

interface SentryConfig {
  dsn: string | undefined;
  environment: string;
  release?: string;
}

let sentryInitialized = false;

// Initialize Sentry - only in production when DSN is provided
export function initSentry(): void {
  if (sentryInitialized) return;
  
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  // Only initialize if DSN is provided and we're in production
  if (!dsn) {
    console.log('[Sentry] No DSN configured, error reporting disabled');
    return;
  }
  
  if (import.meta.env.DEV) {
    console.log('[Sentry] Development mode, skipping initialization');
    return;
  }
  
  console.log('[Sentry] Initializing error tracking...');
  sentryInitialized = true;
  
  // Store config for later use
  (window as any).__sentryConfig = {
    dsn,
    environment: import.meta.env.MODE || 'production',
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',
  };
  
  // Set up global error handler
  window.addEventListener('error', (event) => {
    captureException(event.error, {
      type: 'window.onerror',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
  
  // Set up unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, {
      type: 'unhandledrejection',
    });
  });
  
  console.log('[Sentry] Error tracking initialized');
}

// Capture an exception and send to Sentry
export function captureException(error: Error | unknown, context?: Record<string, unknown>): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  // Log to console in development
  if (import.meta.env.DEV) {
    console.error('[Sentry] Would capture exception:', errorObj, context);
    return;
  }
  
  // In production, we'd send to Sentry
  // For now, log to database via edge function
  logErrorToDatabase(errorObj, 'error', context);
}

// Capture a message with severity level
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (import.meta.env.DEV) {
    console.log(`[Sentry] Would capture message (${level}):`, message);
    return;
  }
  
  logErrorToDatabase(new Error(message), level, { messageOnly: true });
}

// Set user context for error tracking
export function setUser(user: { id: string; email?: string } | null): void {
  (window as any).__sentryUser = user;
}

// Add breadcrumb for debugging
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  const breadcrumbs: any[] = (window as any).__sentryBreadcrumbs || [];
  breadcrumbs.push({
    ...breadcrumb,
    timestamp: Date.now(),
  });
  // Keep last 50 breadcrumbs
  (window as any).__sentryBreadcrumbs = breadcrumbs.slice(-50);
}

// Log error to database
async function logErrorToDatabase(
  error: Error,
  level: 'info' | 'warning' | 'error',
  context?: Record<string, unknown>
): Promise<void> {
  try {
    const user = (window as any).__sentryUser;
    const breadcrumbs = (window as any).__sentryBreadcrumbs || [];
    
    // Use Supabase client to log error
    const { supabase } = await import('@/integrations/supabase/client');
    
    await supabase.from('error_logs').insert({
      user_id: user?.id,
      level,
      message: error.message,
      stack: error.stack,
      context: {
        ...context,
        breadcrumbs: breadcrumbs.slice(-10),
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    });
  } catch (err) {
    console.error('[Sentry] Failed to log error to database:', err);
  }
}

// Export check for initialization status
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}
