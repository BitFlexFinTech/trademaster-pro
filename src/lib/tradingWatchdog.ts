/**
 * Trading Watchdog - Continuous monitoring and auto-recovery system
 * Phase 2: Heartbeat monitoring, auto-restart, connection tracking
 */

import { toast } from 'sonner';

interface WatchdogConfig {
  heartbeatIntervalMs: number;
  maxStallTimeMs: number;
  autoRestartOnCrash: boolean;
  maxConsecutiveErrors: number;
}

interface ModuleStatus {
  name: string;
  lastHeartbeat: number;
  isHealthy: boolean;
  consecutiveErrors: number;
  restartCount: number;
}

interface ConnectionStatus {
  exchange: string;
  isConnected: boolean;
  lastCheck: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

interface WatchdogState {
  isActive: boolean;
  modules: Map<string, ModuleStatus>;
  connections: Map<string, ConnectionStatus>;
  lastCheckTime: number;
  onRestart?: (moduleName: string) => void;
  onConnectionLost?: (exchange: string) => void;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  heartbeatIntervalMs: 5000,
  maxStallTimeMs: 15000,
  autoRestartOnCrash: true,
  maxConsecutiveErrors: 5,
};

class TradingWatchdog {
  private config: WatchdogConfig;
  private state: WatchdogState;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private persistenceKey = 'trading-watchdog-state';

  constructor(config: Partial<WatchdogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isActive: false,
      modules: new Map(),
      connections: new Map(),
      lastCheckTime: Date.now(),
    };
    
    // Restore state from localStorage on init
    this.restoreState();
  }

  /**
   * Start the watchdog monitoring
   */
  start(callbacks?: {
    onRestart?: (moduleName: string) => void;
    onConnectionLost?: (exchange: string) => void;
  }) {
    if (this.state.isActive) return;
    
    this.state.isActive = true;
    this.state.onRestart = callbacks?.onRestart;
    this.state.onConnectionLost = callbacks?.onConnectionLost;
    
    this.heartbeatInterval = setInterval(() => {
      this.checkHealth();
    }, this.config.heartbeatIntervalMs);
    
    console.log('[Watchdog] Started monitoring');
  }

  /**
   * Stop the watchdog
   */
  stop() {
    this.state.isActive = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.persistState();
    console.log('[Watchdog] Stopped monitoring');
  }

  /**
   * Register a module for monitoring
   */
  registerModule(name: string) {
    this.state.modules.set(name, {
      name,
      lastHeartbeat: Date.now(),
      isHealthy: true,
      consecutiveErrors: 0,
      restartCount: 0,
    });
    console.log(`[Watchdog] Registered module: ${name}`);
  }

  /**
   * Unregister a module
   */
  unregisterModule(name: string) {
    this.state.modules.delete(name);
  }

  /**
   * Send heartbeat from a module
   */
  heartbeat(moduleName: string) {
    const module = this.state.modules.get(moduleName);
    if (module) {
      module.lastHeartbeat = Date.now();
      module.isHealthy = true;
      module.consecutiveErrors = 0;
    }
  }

  /**
   * Report an error from a module
   */
  reportError(moduleName: string, error: Error | string) {
    const module = this.state.modules.get(moduleName);
    if (module) {
      module.consecutiveErrors++;
      if (module.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        module.isHealthy = false;
        console.error(`[Watchdog] Module ${moduleName} marked unhealthy after ${module.consecutiveErrors} errors`);
      }
    }
    console.error(`[Watchdog] Error in ${moduleName}:`, error);
  }

  /**
   * Report success from a module
   */
  reportSuccess(moduleName: string) {
    const module = this.state.modules.get(moduleName);
    if (module) {
      module.consecutiveErrors = 0;
      module.lastHeartbeat = Date.now();
    }
  }

  /**
   * Register an exchange connection for monitoring
   */
  registerConnection(exchange: string) {
    this.state.connections.set(exchange, {
      exchange,
      isConnected: true,
      lastCheck: Date.now(),
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
    });
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(exchange: string, isConnected: boolean) {
    const conn = this.state.connections.get(exchange);
    if (conn) {
      const wasConnected = conn.isConnected;
      conn.isConnected = isConnected;
      conn.lastCheck = Date.now();
      
      if (!isConnected && wasConnected) {
        conn.reconnectAttempts++;
        console.warn(`[Watchdog] Connection lost to ${exchange}, attempt ${conn.reconnectAttempts}`);
        this.state.onConnectionLost?.(exchange);
      } else if (isConnected && !wasConnected) {
        conn.reconnectAttempts = 0;
        console.log(`[Watchdog] Connection restored to ${exchange}`);
      }
    }
  }

  /**
   * Check health of all modules and connections
   */
  private checkHealth() {
    const now = Date.now();
    this.state.lastCheckTime = now;

    // Check module health
    for (const [name, module] of this.state.modules) {
      const timeSinceHeartbeat = now - module.lastHeartbeat;
      
      if (timeSinceHeartbeat > this.config.maxStallTimeMs) {
        console.warn(`[Watchdog] Module ${name} stalled for ${timeSinceHeartbeat}ms`);
        module.isHealthy = false;
        
        if (this.config.autoRestartOnCrash) {
          this.attemptRestart(name);
        }
      }
    }

    // Persist state periodically
    this.persistState();
  }

  /**
   * Attempt to restart a stalled module
   */
  private attemptRestart(moduleName: string) {
    const module = this.state.modules.get(moduleName);
    if (!module) return;

    module.restartCount++;
    module.lastHeartbeat = Date.now(); // Reset timer to prevent immediate re-trigger
    
    console.log(`[Watchdog] Attempting restart of ${moduleName} (attempt ${module.restartCount})`);
    
    toast.warning(`Restarting ${moduleName}`, {
      description: `Module stalled, auto-restarting (attempt ${module.restartCount})`,
    });
    
    this.state.onRestart?.(moduleName);
  }

  /**
   * Get current watchdog status
   */
  getStatus(): {
    isActive: boolean;
    modules: Array<ModuleStatus>;
    connections: Array<ConnectionStatus>;
    overallHealth: 'healthy' | 'degraded' | 'critical';
  } {
    const modules = Array.from(this.state.modules.values());
    const connections = Array.from(this.state.connections.values());
    
    const unhealthyModules = modules.filter(m => !m.isHealthy).length;
    const disconnectedExchanges = connections.filter(c => !c.isConnected).length;
    
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (unhealthyModules > 0 || disconnectedExchanges > 0) {
      overallHealth = 'degraded';
    }
    if (unhealthyModules >= modules.length / 2 || disconnectedExchanges >= connections.length / 2) {
      overallHealth = 'critical';
    }

    return {
      isActive: this.state.isActive,
      modules,
      connections,
      overallHealth,
    };
  }

  /**
   * Persist state to localStorage for crash recovery
   */
  private persistState() {
    try {
      const serialized = {
        lastCheckTime: this.state.lastCheckTime,
        modules: Array.from(this.state.modules.entries()),
        connections: Array.from(this.state.connections.entries()),
      };
      localStorage.setItem(this.persistenceKey, JSON.stringify(serialized));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Restore state from localStorage
   */
  private restoreState() {
    try {
      const saved = localStorage.getItem(this.persistenceKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Only restore if state is less than 5 minutes old
        if (Date.now() - parsed.lastCheckTime < 300000) {
          this.state.modules = new Map(parsed.modules);
          this.state.connections = new Map(parsed.connections);
          console.log('[Watchdog] Restored state from previous session');
        }
      }
    } catch (e) {
      // Ignore restore errors
    }
  }

  /**
   * Clear persisted state
   */
  clearState() {
    localStorage.removeItem(this.persistenceKey);
    this.state.modules.clear();
    this.state.connections.clear();
  }
}

// Singleton instance
export const tradingWatchdog = new TradingWatchdog();
