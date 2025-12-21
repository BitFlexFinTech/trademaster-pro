/**
 * TRADING BOT ISSUE SCANNER
 * 
 * Scans the database for real trading issues and provides actionable insights.
 * Now connects to profit_audit_log and trades tables for real bug detection.
 */

import { supabase } from '@/integrations/supabase/client';

export interface DetectedIssue {
  id: string;
  title: string;
  description: string;
  impact: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  category: string;
  count: number;
  firstOccurrence?: string;
  lastOccurrence?: string;
  affectedPairs?: string[];
  affectedExchanges?: string[];
  fixed: boolean;
  fixedAt?: string;
}

export interface ScanResult {
  issues: DetectedIssue[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  infoCount: number;
  totalCount: number;
  scannedTables: string[];
  scanTime: number;
  lastScanAt: string;
}

// Storage key for manually fixed issues
const FIXED_ISSUES_KEY = 'debugger_fixed_issues';

/**
 * Get list of manually fixed issue IDs from localStorage
 */
export function getFixedIssues(): Record<string, string> {
  try {
    const stored = localStorage.getItem(FIXED_ISSUES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Mark an issue as fixed
 */
export function markIssueFixed(issueId: string): void {
  const fixed = getFixedIssues();
  fixed[issueId] = new Date().toISOString();
  localStorage.setItem(FIXED_ISSUES_KEY, JSON.stringify(fixed));
}

/**
 * Unmark an issue as fixed
 */
export function unmarkIssueFixed(issueId: string): void {
  const fixed = getFixedIssues();
  delete fixed[issueId];
  localStorage.setItem(FIXED_ISSUES_KEY, JSON.stringify(fixed));
}

/**
 * Clear all fixed issue markers
 */
export function clearAllFixedMarkers(): void {
  localStorage.removeItem(FIXED_ISSUES_KEY);
}

/**
 * Scan for real issues in the database
 */
export async function scanForIssues(): Promise<ScanResult> {
  const startTime = Date.now();
  const issues: DetectedIssue[] = [];
  const fixedIssues = getFixedIssues();
  
  try {
    // 1. Check for failed profit-take attempts
    const { data: failedProfitTakes } = await supabase
      .from('profit_audit_log')
      .select('*')
      .eq('action', 'profit_take')
      .eq('success', false)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (failedProfitTakes && failedProfitTakes.length > 0) {
      const affectedPairs = [...new Set(failedProfitTakes.map(t => t.symbol))];
      const affectedExchanges = [...new Set(failedProfitTakes.map(t => t.exchange))];
      const issueId = 'failed-profit-takes';
      
      issues.push({
        id: issueId,
        title: 'Failed Profit-Take Attempts',
        description: `${failedProfitTakes.length} trades failed to take profit. Check for OCO conflicts or insufficient balance.`,
        impact: 'Trades may be closing without capturing actual profit.',
        severity: failedProfitTakes.length > 10 ? 'critical' : 'high',
        category: 'Profit Taking',
        count: failedProfitTakes.length,
        firstOccurrence: failedProfitTakes[failedProfitTakes.length - 1]?.created_at,
        lastOccurrence: failedProfitTakes[0]?.created_at,
        affectedPairs,
        affectedExchanges,
        fixed: !!fixedIssues[issueId],
        fixedAt: fixedIssues[issueId],
      });
    }
    
    // 2. Check for $0 profit trades (closed trades with no profit)
    const { data: zeroProfitTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'closed')
      .or('profit_loss.is.null,profit_loss.eq.0')
      .order('closed_at', { ascending: false })
      .limit(100);
    
    if (zeroProfitTrades && zeroProfitTrades.length > 0) {
      const affectedPairs = [...new Set(zeroProfitTrades.map(t => t.pair))];
      const issueId = 'zero-profit-trades';
      
      issues.push({
        id: issueId,
        title: 'Zero Profit Trade Closures',
        description: `${zeroProfitTrades.length} trades closed with $0 or null profit. Entry/exit prices may not be captured correctly.`,
        impact: 'Trades are closing but profit is not being recorded.',
        severity: zeroProfitTrades.length > 5 ? 'critical' : 'high',
        category: 'Profit Calculation',
        count: zeroProfitTrades.length,
        firstOccurrence: zeroProfitTrades[zeroProfitTrades.length - 1]?.closed_at,
        lastOccurrence: zeroProfitTrades[0]?.closed_at,
        affectedPairs,
        fixed: !!fixedIssues[issueId],
        fixedAt: fixedIssues[issueId],
      });
    }
    
    // 3. Check for trades stuck in 'open' status for too long (>1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: stuckTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'open')
      .lt('created_at', oneHourAgo)
      .limit(50);
    
    if (stuckTrades && stuckTrades.length > 0) {
      const affectedPairs = [...new Set(stuckTrades.map(t => t.pair))];
      const issueId = 'stuck-open-trades';
      
      issues.push({
        id: issueId,
        title: 'Stuck Open Trades',
        description: `${stuckTrades.length} trades have been open for >1 hour without closing.`,
        impact: 'Capital is locked in trades that may no longer have exchange positions.',
        severity: stuckTrades.length > 3 ? 'high' : 'medium',
        category: 'Trade Lifecycle',
        count: stuckTrades.length,
        affectedPairs,
        fixed: !!fixedIssues[issueId],
        fixedAt: fixedIssues[issueId],
      });
    }
    
    // 4. Check for error entries in audit log
    const { data: errorLogs } = await supabase
      .from('profit_audit_log')
      .select('*')
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (errorLogs && errorLogs.length > 0) {
      const recentErrors = errorLogs.filter(e => {
        const logTime = new Date(e.created_at).getTime();
        const now = Date.now();
        return now - logTime < 24 * 60 * 60 * 1000; // Last 24 hours
      });
      
      if (recentErrors.length > 0) {
        const affectedExchanges = [...new Set(recentErrors.map(e => e.exchange))];
        const issueId = 'recent-error-logs';
        
        issues.push({
          id: issueId,
          title: 'Recent Trading Errors',
          description: `${recentErrors.length} errors in the last 24 hours. Common: ${recentErrors[0]?.error_message?.slice(0, 50)}...`,
          impact: 'Trades may be failing silently without user notification.',
          severity: recentErrors.length > 10 ? 'high' : 'medium',
          category: 'Error Handling',
          count: recentErrors.length,
          lastOccurrence: recentErrors[0]?.created_at,
          affectedExchanges,
          fixed: !!fixedIssues[issueId],
          fixedAt: fixedIssues[issueId],
        });
      }
    }
    
    // 5. Check for trades with missing entry price
    const { data: missingEntryPrice } = await supabase
      .from('trades')
      .select('*')
      .or('entry_price.is.null,entry_price.eq.0')
      .limit(50);
    
    if (missingEntryPrice && missingEntryPrice.length > 0) {
      const issueId = 'missing-entry-price';
      
      issues.push({
        id: issueId,
        title: 'Missing Entry Prices',
        description: `${missingEntryPrice.length} trades have no entry price recorded.`,
        impact: 'Profit cannot be calculated without entry price.',
        severity: 'critical',
        category: 'Data Integrity',
        count: missingEntryPrice.length,
        fixed: !!fixedIssues[issueId],
        fixedAt: fixedIssues[issueId],
      });
    }
    
    // 6. Check for balance-related failures
    const { data: balanceFailures } = await supabase
      .from('profit_audit_log')
      .select('*')
      .ilike('error_message', '%balance%')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (balanceFailures && balanceFailures.length > 0) {
      const recentFailures = balanceFailures.filter(e => {
        const logTime = new Date(e.created_at).getTime();
        return Date.now() - logTime < 24 * 60 * 60 * 1000;
      });
      
      if (recentFailures.length > 0) {
        const issueId = 'insufficient-balance';
        
        issues.push({
          id: issueId,
          title: 'Insufficient Balance Errors',
          description: `${recentFailures.length} trades failed due to insufficient balance in the last 24 hours.`,
          impact: 'Bot cannot execute trades when balance is too low.',
          severity: recentFailures.length > 5 ? 'critical' : 'high',
          category: 'Balance',
          count: recentFailures.length,
          lastOccurrence: recentFailures[0]?.created_at,
          fixed: !!fixedIssues[issueId],
          fixedAt: fixedIssues[issueId],
        });
      }
    }
    
    // 7. Check for consecutive losses (5+ losses in a row for same pair)
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'closed')
      .not('profit_loss', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(200);
    
    if (recentTrades && recentTrades.length > 0) {
      // Group by pair and check for consecutive losses
      const pairGroups: Record<string, typeof recentTrades> = {};
      recentTrades.forEach(t => {
        if (!pairGroups[t.pair]) pairGroups[t.pair] = [];
        pairGroups[t.pair].push(t);
      });
      
      const pairsWithStreaks: string[] = [];
      for (const [pair, trades] of Object.entries(pairGroups)) {
        let consecutiveLosses = 0;
        for (const trade of trades) {
          if ((trade.profit_loss ?? 0) < 0) {
            consecutiveLosses++;
            if (consecutiveLosses >= 5) {
              pairsWithStreaks.push(pair);
              break;
            }
          } else {
            break; // Reset on first win
          }
        }
      }
      
      if (pairsWithStreaks.length > 0) {
        const issueId = 'consecutive-loss-streaks';
        
        issues.push({
          id: issueId,
          title: 'Consecutive Loss Streaks',
          description: `${pairsWithStreaks.length} pair(s) have 5+ consecutive losses: ${pairsWithStreaks.join(', ')}`,
          impact: 'Bot may be blocked from trading these pairs due to loss protection.',
          severity: 'high',
          category: 'Risk Management',
          count: pairsWithStreaks.length,
          affectedPairs: pairsWithStreaks,
          fixed: !!fixedIssues[issueId],
          fixedAt: fixedIssues[issueId],
        });
      }
    }
    
    // 8. Check for successful profit takes (positive indicator)
    const { data: successfulProfitTakes } = await supabase
      .from('profit_audit_log')
      .select('*')
      .eq('action', 'profit_take_success')
      .eq('success', true)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (successfulProfitTakes && successfulProfitTakes.length > 0) {
      const issueId = 'successful-profit-takes';
      
      issues.push({
        id: issueId,
        title: 'Successful Profit Takes',
        description: `${successfulProfitTakes.length} trades successfully captured profit.`,
        impact: 'System is working correctly for these trades.',
        severity: 'info',
        category: 'System Health',
        count: successfulProfitTakes.length,
        lastOccurrence: successfulProfitTakes[0]?.created_at,
        fixed: true, // Info items are always "fixed"
      });
    }

  } catch (error) {
    console.error('Error scanning for issues:', error);
  }
  
  // Count unfixed issues by severity
  const unfixedIssues = issues.filter(i => !i.fixed);
  const criticalCount = unfixedIssues.filter(i => i.severity === 'critical').length;
  const highCount = unfixedIssues.filter(i => i.severity === 'high').length;
  const mediumCount = unfixedIssues.filter(i => i.severity === 'medium').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;
  
  return {
    issues,
    criticalCount,
    highCount,
    mediumCount,
    infoCount,
    totalCount: criticalCount + highCount + mediumCount,
    scannedTables: ['trades', 'profit_audit_log'],
    scanTime: Date.now() - startTime,
    lastScanAt: new Date().toISOString(),
  };
}

/**
 * Quick scan - just returns counts without full details
 */
export async function quickScanCounts(): Promise<{ critical: number; high: number; medium: number }> {
  const result = await scanForIssues();
  return {
    critical: result.criticalCount,
    high: result.highCount,
    medium: result.mediumCount,
  };
}
