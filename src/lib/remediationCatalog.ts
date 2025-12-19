/**
 * Remediation Catalog - Structured logging for trading issues
 * Phase 6: Track, log, and retry trading issue remediations
 */

type IssueType = 
  | 'liquidity_gap'
  | 'min_notional_fail'
  | 'slippage_spike'
  | 'margin_limit'
  | 'borrow_fee_impact'
  | 'rate_limit_429'
  | 'connection_lost'
  | 'order_rejected'
  | 'insufficient_balance'
  | 'spread_too_wide';

type RemediationAction =
  | 'reduce_size'
  | 'taker_fallback'
  | 'adjust_tp'
  | 'increase_size'
  | 'recompute_tp_sl'
  | 'skip_symbol'
  | 'switch_exchange'
  | 'wait_cooloff'
  | 'retry_with_backoff'
  | 'cancel_order'
  | 'market_exit';

interface RemediationLog {
  id: string;
  timestamp: Date;
  issue: IssueType;
  exchange: string;
  symbol: string;
  direction: 'long' | 'short';
  originalParams: {
    positionSize: number;
    entryPrice: number;
    targetTP: number;
    targetSL: number;
  };
  remediatedParams?: {
    positionSize: number;
    targetTP: number;
    targetSL: number;
  };
  actions: RemediationAction[];
  status: 'pending' | 'retrying' | 'pass' | 'fail';
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  resolvedAt?: Date;
}

interface CatalogStats {
  totalIssues: number;
  resolvedIssues: number;
  failedIssues: number;
  issuesByType: Record<IssueType, number>;
  avgRetries: number;
  resolutionRate: number;
}

class RemediationCatalog {
  private logs: Map<string, RemediationLog> = new Map();
  private maxLogsToKeep = 500;
  private persistenceKey = 'remediation-catalog';

  constructor() {
    this.restoreFromStorage();
  }

  /**
   * Generate unique log ID
   */
  private generateId(): string {
    return `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Log a new issue and start remediation
   */
  logIssue(params: {
    issue: IssueType;
    exchange: string;
    symbol: string;
    direction: 'long' | 'short';
    originalParams: RemediationLog['originalParams'];
    errorMessage?: string;
  }): string {
    const id = this.generateId();
    
    const log: RemediationLog = {
      id,
      timestamp: new Date(),
      issue: params.issue,
      exchange: params.exchange,
      symbol: params.symbol,
      direction: params.direction,
      originalParams: params.originalParams,
      actions: [],
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      errorMessage: params.errorMessage,
    };

    this.logs.set(id, log);
    this.pruneOldLogs();
    this.persistToStorage();

    console.log(`[Remediation] Issue logged: ${params.issue} on ${params.exchange} ${params.symbol}`, log);
    return id;
  }

  /**
   * Apply a remediation action
   */
  applyRemediation(
    logId: string,
    action: RemediationAction,
    newParams?: Partial<RemediationLog['remediatedParams']>
  ): RemediationLog | null {
    const log = this.logs.get(logId);
    if (!log) return null;

    log.actions.push(action);
    log.status = 'retrying';
    log.retryCount++;

    if (newParams) {
      log.remediatedParams = {
        positionSize: newParams.positionSize ?? log.originalParams.positionSize,
        targetTP: newParams.targetTP ?? log.originalParams.targetTP,
        targetSL: newParams.targetSL ?? log.originalParams.targetSL,
      };
    }

    this.persistToStorage();

    console.log(`[Remediation] Action applied: ${action} for ${logId}`, log);
    return log;
  }

  /**
   * Mark issue as resolved
   */
  resolveIssue(logId: string) {
    const log = this.logs.get(logId);
    if (!log) return;

    log.status = 'pass';
    log.resolvedAt = new Date();
    this.persistToStorage();

    console.log(`[Remediation] Issue resolved: ${logId} after ${log.retryCount} retries`);
  }

  /**
   * Mark issue as failed
   */
  failIssue(logId: string, errorMessage?: string) {
    const log = this.logs.get(logId);
    if (!log) return;

    log.status = 'fail';
    log.resolvedAt = new Date();
    if (errorMessage) {
      log.errorMessage = errorMessage;
    }
    this.persistToStorage();

    console.error(`[Remediation] Issue failed: ${logId}`, log);
  }

  /**
   * Get recommended remediation actions for an issue type
   */
  getRecommendedActions(issue: IssueType, direction: 'long' | 'short'): RemediationAction[] {
    const actions: Record<IssueType, RemediationAction[]> = {
      liquidity_gap: ['reduce_size', 'taker_fallback', 'adjust_tp'],
      min_notional_fail: ['increase_size', 'recompute_tp_sl'],
      slippage_spike: ['cancel_order', 'reduce_size', 'retry_with_backoff'],
      margin_limit: direction === 'short' 
        ? ['reduce_size', 'recompute_tp_sl', 'skip_symbol']
        : ['reduce_size', 'recompute_tp_sl'],
      borrow_fee_impact: ['adjust_tp', 'reduce_size'],
      rate_limit_429: ['wait_cooloff', 'retry_with_backoff'],
      connection_lost: ['switch_exchange', 'retry_with_backoff'],
      order_rejected: ['reduce_size', 'adjust_tp', 'skip_symbol'],
      insufficient_balance: ['reduce_size', 'skip_symbol'],
      spread_too_wide: ['wait_cooloff', 'skip_symbol'],
    };

    return actions[issue] || ['skip_symbol'];
  }

  /**
   * Execute automatic remediation for an issue
   */
  async executeRemediation(
    logId: string,
    executeAction: (action: RemediationAction, params: RemediationLog['remediatedParams']) => Promise<boolean>
  ): Promise<boolean> {
    const log = this.logs.get(logId);
    if (!log) return false;

    const recommendedActions = this.getRecommendedActions(log.issue, log.direction);

    for (const action of recommendedActions) {
      if (log.retryCount >= log.maxRetries) {
        this.failIssue(logId, 'Max retries exceeded');
        return false;
      }

      const params = this.calculateRemediatedParams(log, action);
      this.applyRemediation(logId, action, params);

      try {
        const success = await executeAction(action, params);
        if (success) {
          this.resolveIssue(logId);
          return true;
        }
      } catch (error: any) {
        console.error(`[Remediation] Action ${action} failed:`, error);
      }
    }

    this.failIssue(logId, 'All remediation actions exhausted');
    return false;
  }

  /**
   * Calculate remediated parameters based on action
   */
  private calculateRemediatedParams(
    log: RemediationLog,
    action: RemediationAction
  ): RemediationLog['remediatedParams'] {
    const { positionSize, entryPrice, targetTP, targetSL } = log.originalParams;

    switch (action) {
      case 'reduce_size':
        return {
          positionSize: positionSize * 0.5,
          targetTP,
          targetSL,
        };

      case 'increase_size':
        return {
          positionSize: positionSize * 1.5,
          targetTP,
          targetSL,
        };

      case 'adjust_tp':
        // Increase TP distance by 20%
        const tpDistance = Math.abs(targetTP - entryPrice);
        const newTP = log.direction === 'long'
          ? entryPrice + tpDistance * 1.2
          : entryPrice - tpDistance * 1.2;
        return {
          positionSize,
          targetTP: newTP,
          targetSL,
        };

      case 'recompute_tp_sl':
        // Recalculate with 1:2 risk/reward
        const newSLDistance = positionSize * 0.01 / positionSize; // 1% risk
        const newTPDistance = newSLDistance * 2; // 2:1 reward
        return {
          positionSize,
          targetTP: log.direction === 'long'
            ? entryPrice * (1 + newTPDistance)
            : entryPrice * (1 - newTPDistance),
          targetSL: log.direction === 'long'
            ? entryPrice * (1 - newSLDistance)
            : entryPrice * (1 + newSLDistance),
        };

      default:
        return { positionSize, targetTP, targetSL };
    }
  }

  /**
   * Get statistics about remediations
   */
  getStats(): CatalogStats {
    const logs = Array.from(this.logs.values());
    
    const issuesByType = {} as Record<IssueType, number>;
    let totalRetries = 0;

    logs.forEach(log => {
      issuesByType[log.issue] = (issuesByType[log.issue] || 0) + 1;
      totalRetries += log.retryCount;
    });

    const resolved = logs.filter(l => l.status === 'pass').length;
    const failed = logs.filter(l => l.status === 'fail').length;

    return {
      totalIssues: logs.length,
      resolvedIssues: resolved,
      failedIssues: failed,
      issuesByType,
      avgRetries: logs.length > 0 ? totalRetries / logs.length : 0,
      resolutionRate: logs.length > 0 ? (resolved / logs.length) * 100 : 0,
    };
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit: number = 20): RemediationLog[] {
    return Array.from(this.logs.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Prune old logs to keep memory usage in check
   */
  private pruneOldLogs() {
    if (this.logs.size <= this.maxLogsToKeep) return;

    const sortedLogs = Array.from(this.logs.entries())
      .sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime());

    // Keep only the most recent logs
    const toRemove = sortedLogs.slice(this.maxLogsToKeep);
    toRemove.forEach(([id]) => this.logs.delete(id));
  }

  /**
   * Persist to localStorage
   */
  private persistToStorage() {
    try {
      const serialized = Array.from(this.logs.entries());
      localStorage.setItem(this.persistenceKey, JSON.stringify(serialized));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Restore from localStorage
   */
  private restoreFromStorage() {
    try {
      const saved = localStorage.getItem(this.persistenceKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.logs = new Map(parsed.map(([id, log]: [string, any]) => [
          id,
          { ...log, timestamp: new Date(log.timestamp), resolvedAt: log.resolvedAt ? new Date(log.resolvedAt) : undefined }
        ]));
      }
    } catch (e) {
      // Ignore restore errors
    }
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs.clear();
    localStorage.removeItem(this.persistenceKey);
  }
}

// Singleton instance
export const remediationCatalog = new RemediationCatalog();
