// Production Error Logger with Sentry Integration
import { captureException as sentryCaptureException, captureMessage as sentryCaptureMessage, addBreadcrumb } from './sentry';
import { supabase } from '@/integrations/supabase/client';

interface ErrorLog {
  id: string;
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  componentStack?: string;
}

const MAX_ERRORS = 100;
const STORAGE_KEY = 'arb_terminal_error_logs';

class ErrorLogger {
  private static instance: ErrorLogger;

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  private getStoredErrors(): ErrorLog[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private storeErrors(errors: ErrorLog[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(errors.slice(0, MAX_ERRORS)));
    } catch {
      console.warn('Failed to store error logs');
    }
  }

  log(level: ErrorLog['level'], message: string, error?: Error, context?: Record<string, unknown>): void {
    const errorLog: ErrorLog = {
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      level,
      message,
      stack: error?.stack,
      context,
    };

    // Console output with styling
    const styles = {
      error: 'color: #ef4444; font-weight: bold;',
      warning: 'color: #f59e0b; font-weight: bold;',
      info: 'color: #3b82f6; font-weight: bold;',
    };

    console.group(`%c[${level.toUpperCase()}] ${message}`, styles[level]);
    console.log('Timestamp:', errorLog.timestamp);
    if (error?.stack) console.log('Stack:', error.stack);
    if (context) console.log('Context:', context);
    console.groupEnd();

    // Store in localStorage
    const errors = this.getStoredErrors();
    errors.unshift(errorLog);
    this.storeErrors(errors);

    // Add breadcrumb for debugging trail
    addBreadcrumb({
      message,
      category: 'error-logger',
      level: level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info',
      data: context,
    });

    // Log to database in production
    this.logToDatabase(level, message, error?.stack, context);
  }

  private async logToDatabase(
    level: 'error' | 'warning' | 'info',
    message: string,
    stack?: string,
    context?: Record<string, unknown>
  ): Promise<void> {
    // Only log in production to avoid noise
    if (import.meta.env.DEV) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Use type assertion since error_logs table was just created
      await (supabase.from('error_logs') as any).insert({
        user_id: user?.id || null,
        level,
        message: message.slice(0, 5000),
        stack: stack?.slice(0, 10000) || null,
        context: context || null,
        page_url: typeof window !== 'undefined' ? window.location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    } catch {
      // Silently fail - don't create infinite loop
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log('error', message, error, context);
    
    // Also send to Sentry for production monitoring
    if (error) {
      sentryCaptureException(error, context);
    } else {
      sentryCaptureMessage(message, 'error');
    }
  }

  warning(message: string, context?: Record<string, unknown>): void {
    this.log('warning', message, undefined, context);
    sentryCaptureMessage(message, 'warning');
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, undefined, context);
  }

  getErrors(): ErrorLog[] {
    return this.getStoredErrors();
  }

  clearErrors(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    this.error(error.message, error, context);
  }
}

export const errorLogger = ErrorLogger.getInstance();

// Helper functions for easy access
export function getErrorLogs(): ErrorLog[] {
  return errorLogger.getErrors();
}

export function clearErrorLogs(): void {
  errorLogger.clearErrors();
}

export type { ErrorLog };
