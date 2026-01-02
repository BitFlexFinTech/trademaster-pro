import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, Filter, Download, Trash2, Play, Pause, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';

type LogLevel = 'trade' | 'hold' | 'block' | 'error' | 'info';
type LogFilter = 'all' | LogLevel;

interface ActivityLog {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  pair?: string;
  direction?: 'long' | 'short';
  pnl?: number;
  reason?: string;
}

const MAX_LOGS = 100;

const levelConfig: Record<LogLevel, { color: string; icon: React.ReactNode; label: string }> = {
  trade: { color: 'text-profit', icon: <CheckCircle2 className="w-3 h-3" />, label: 'TRADE' },
  hold: { color: 'text-blue-400', icon: <Clock className="w-3 h-3" />, label: 'HOLD' },
  block: { color: 'text-yellow-400', icon: <AlertTriangle className="w-3 h-3" />, label: 'BLOCK' },
  error: { color: 'text-loss', icon: <XCircle className="w-3 h-3" />, label: 'ERROR' },
  info: { color: 'text-muted-foreground', icon: <Terminal className="w-3 h-3" />, label: 'INFO' },
};

interface ActivityTerminalProps {
  className?: string;
  maxHeight?: number;
}

export function ActivityTerminal({ className, maxHeight = 400 }: ActivityTerminalProps) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Add a log entry
  const addLog = useCallback((log: Omit<ActivityLog, 'id' | 'timestamp'>) => {
    if (isPaused) return;
    
    setLogs(prev => {
      const newLog: ActivityLog = {
        ...log,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };
      const updated = [newLog, ...prev].slice(0, MAX_LOGS);
      return updated;
    });
  }, [isPaused]);

  // Subscribe to trades and audit logs
  useEffect(() => {
    if (!user) return;

    // Subscribe to new trades
    const tradesChannel = supabase
      .channel('activity-terminal-trades')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        if (trade.status === 'open') {
          addLog({
            level: 'info',
            message: `Position opened: ${trade.pair} ${trade.direction?.toUpperCase()}`,
            pair: trade.pair,
            direction: trade.direction,
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        const oldTrade = payload.old as any;
        
        // Trade closed
        if (trade.status === 'closed' && oldTrade.status === 'open') {
          const pnl = trade.profit_loss || 0;
          addLog({
            level: pnl >= 1 ? 'trade' : pnl > 0 ? 'info' : 'error',
            message: pnl >= 1 
              ? `✅ $1 TARGET HIT: ${trade.pair} ${trade.direction?.toUpperCase()} → $${pnl.toFixed(2)}`
              : `Trade closed: ${trade.pair} → $${pnl.toFixed(2)}`,
            pair: trade.pair,
            direction: trade.direction,
            pnl,
          });
        }
        
        // Holding for profit
        if (trade.holding_for_profit && !oldTrade.holding_for_profit) {
          addLog({
            level: 'hold',
            message: `⏳ HOLDING FOR $1: ${trade.pair} ${trade.direction?.toUpperCase()} - waiting for profit target`,
            pair: trade.pair,
            direction: trade.direction,
          });
        }
      })
      .subscribe();

    // Subscribe to profit audit logs
    const auditChannel = supabase
      .channel('activity-terminal-audit')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'profit_audit_log',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const audit = payload.new as any;
        
        if (audit.action === 'trade_blocked') {
          addLog({
            level: 'block',
            message: `🚫 BLOCKED: ${audit.symbol} - ${audit.error_message || 'Protection triggered'}`,
            pair: audit.symbol,
            reason: audit.error_message,
          });
        } else if (audit.action === 'consecutive_loss_protection') {
          addLog({
            level: 'block',
            message: `⚠️ CONSECUTIVE LOSS PROTECTION: ${audit.symbol} - ${audit.error_message}`,
            pair: audit.symbol,
            reason: audit.error_message,
          });
        } else if (!audit.success && audit.error_message) {
          addLog({
            level: 'error',
            message: `❌ ${audit.action}: ${audit.symbol} - ${audit.error_message}`,
            pair: audit.symbol,
            reason: audit.error_message,
          });
        } else if (audit.action === 'holding_for_profit') {
          addLog({
            level: 'hold',
            message: `⏳ ${audit.symbol}: Net P&L $${audit.net_pnl?.toFixed(4)} < $1.00 - HOLDING`,
            pair: audit.symbol,
            pnl: audit.net_pnl,
          });
        }
      })
      .subscribe();

    // Initial log
    addLog({
      level: 'info',
      message: '🚀 Activity Terminal connected - monitoring trades in real-time',
    });

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(auditChannel);
    };
  }, [user, addLog]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Filter logs
  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.level === filter);

  // Export logs to clipboard
  const exportLogs = useCallback(() => {
    const text = filteredLogs
      .map(log => `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
  }, [filteredLogs]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog({ level: 'info', message: '🧹 Logs cleared' });
  }, [addLog]);

  const filterButtons: { value: LogFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: logs.length },
    { value: 'trade', label: 'Trades', count: logs.filter(l => l.level === 'trade').length },
    { value: 'hold', label: 'Holds', count: logs.filter(l => l.level === 'hold').length },
    { value: 'block', label: 'Blocks', count: logs.filter(l => l.level === 'block').length },
    { value: 'error', label: 'Errors', count: logs.filter(l => l.level === 'error').length },
  ];

  return (
    <div className={cn("card-terminal border border-border/50 rounded-lg overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-xs font-mono font-semibold">Activity Terminal</span>
          <Badge variant="outline" className="text-[10px] h-4">
            {filteredLogs.length} logs
          </Badge>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={exportLogs}
            title="Copy to clipboard"
          >
            <Download className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearLogs}
            title="Clear logs"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1 p-2 border-b border-border/30 bg-background/50 overflow-x-auto">
        {filterButtons.map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-mono transition-colors whitespace-nowrap",
              filter === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1" style={{ maxHeight: maxHeight }} ref={scrollRef}>
        <div className="p-2 space-y-1 font-mono text-[11px]">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
              <p>Waiting for activity...</p>
            </div>
          ) : (
            <>
              {filteredLogs.map(log => {
                const config = levelConfig[log.level];
                return (
                  <div
                    key={log.id}
                    className={cn(
                      "flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/30 transition-colors",
                      log.level === 'trade' && "bg-profit/5",
                      log.level === 'error' && "bg-loss/5",
                      log.level === 'block' && "bg-yellow-500/5",
                      log.level === 'hold' && "bg-blue-500/5"
                    )}
                  >
                    <span className="text-muted-foreground whitespace-nowrap">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className={cn("flex items-center gap-1 font-bold", config.color)}>
                      {config.icon}
                      {config.label}
                    </span>
                    <span className="text-foreground flex-1">{log.message}</span>
                    {log.pnl !== undefined && (
                      <span className={cn(
                        "font-bold",
                        log.pnl >= 0 ? "text-profit" : "text-loss"
                      )}>
                        ${log.pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Status bar */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-border/30 bg-muted/20 text-[10px] text-muted-foreground">
        <span>
          {isPaused ? '⏸️ Paused' : '🔴 Live'}
        </span>
        <span>
          $1 Profit Target Strategy Active
        </span>
      </div>
    </div>
  );
}
