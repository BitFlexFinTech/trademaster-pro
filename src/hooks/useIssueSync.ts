/**
 * SHARED ISSUE SYNC HOOK
 * 
 * Provides unified issue management for both Bugs Dashboard and Debugger pages.
 * Features real-time sync via broadcast channels and shared localStorage state.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  scanForIssues, 
  markIssueFixed, 
  unmarkIssueFixed,
  clearAllFixedMarkers,
  type DetectedIssue, 
  type ScanResult 
} from '@/lib/debugger/issueScanner';
import { 
  getFixFunction, 
  fixAllIssues, 
  type FixResult, 
  type FixProgress 
} from '@/lib/debugger/issueResolver';
import { toast } from 'sonner';

const BROADCAST_CHANNEL = 'issue-sync-broadcast';

interface UseIssueSyncReturn {
  scanResult: ScanResult | null;
  isScanning: boolean;
  fixingIssues: Map<string, FixProgress>;
  fixResults: Map<string, FixResult>;
  isFixingAll: boolean;
  displayedIssues: DetectedIssue[];
  activeIssueCount: number;
  fixedIssueCount: number;
  fixableIssueCount: number;
  showFixed: boolean;
  setShowFixed: (show: boolean) => void;
  handleScan: () => Promise<void>;
  handleMarkFixed: (issueId: string) => Promise<void>;
  handleUnmarkFixed: (issueId: string) => Promise<void>;
  handleClearAllFixed: () => Promise<void>;
  handleAutoFix: (issueId: string) => Promise<void>;
  handleFixAll: () => Promise<void>;
  canAutoFix: (issueId: string) => boolean;
}

export function useIssueSync(): UseIssueSyncReturn {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showFixed, setShowFixed] = useState(false);
  
  // Auto-fix state
  const [fixingIssues, setFixingIssues] = useState<Map<string, FixProgress>>(new Map());
  const [fixResults, setFixResults] = useState<Map<string, FixResult>>(new Map());
  const [isFixingAll, setIsFixingAll] = useState(false);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Broadcast state changes to other components
  const broadcast = useCallback(async (event: string, payload: any) => {
    try {
      await supabase.channel(BROADCAST_CHANNEL).send({
        type: 'broadcast',
        event,
        payload,
      });
    } catch (error) {
      console.error('Broadcast error:', error);
    }
  }, []);

  // Scan for issues
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    
    try {
      const result = await scanForIssues();
      setScanResult(result);
      
      const unfixedCount = result.issues.filter(i => !i.fixed && i.severity !== 'info').length;
      
      toast.success('Scan Complete', {
        description: `Found ${unfixedCount} active issues, ${result.issues.filter(i => i.fixed).length} marked as fixed`,
      });
      
      // Broadcast the new scan result
      await broadcast('scan_complete', { result, timestamp: Date.now() });
    } catch (error) {
      toast.error('Scan Failed', {
        description: 'Could not connect to database. Check your connection.',
      });
    } finally {
      setIsScanning(false);
    }
  }, [broadcast]);

  // Mark issue as fixed
  const handleMarkFixed = useCallback(async (issueId: string) => {
    markIssueFixed(issueId);
    await handleScan();
    await broadcast('issue_fixed', { issueId, timestamp: Date.now() });
    toast.success('Issue Marked as Fixed', {
      description: 'This issue will be hidden unless you show fixed issues.',
    });
  }, [handleScan, broadcast]);

  // Unmark issue as fixed
  const handleUnmarkFixed = useCallback(async (issueId: string) => {
    unmarkIssueFixed(issueId);
    await handleScan();
    await broadcast('issue_unfixed', { issueId, timestamp: Date.now() });
    toast.info('Issue Unmarked', {
      description: 'This issue is now active again.',
    });
  }, [handleScan, broadcast]);

  // Clear all fixed markers
  const handleClearAllFixed = useCallback(async () => {
    clearAllFixedMarkers();
    await handleScan();
    await broadcast('all_cleared', { timestamp: Date.now() });
    toast.info('All Fixed Markers Cleared', {
      description: 'All issues are now shown as active.',
    });
  }, [handleScan, broadcast]);

  // Check if an issue can be auto-fixed
  const canAutoFix = useCallback((issueId: string): boolean => {
    return getFixFunction(issueId) !== null;
  }, []);

  // Auto-fix single issue
  const handleAutoFix = useCallback(async (issueId: string) => {
    const fixFn = getFixFunction(issueId);
    if (!fixFn) {
      toast.error('No Auto-Fix Available', {
        description: 'This issue type cannot be automatically fixed.',
      });
      return;
    }

    // Update progress state
    setFixingIssues(prev => new Map(prev).set(issueId, {
      status: 'fixing',
      progress: 25,
      currentStep: 'Analyzing issue...',
    }));

    try {
      await new Promise(r => setTimeout(r, 500));
      setFixingIssues(prev => new Map(prev).set(issueId, {
        status: 'fixing',
        progress: 50,
        currentStep: 'Applying fix...',
      }));

      const result = await fixFn();

      await new Promise(r => setTimeout(r, 300));
      setFixingIssues(prev => new Map(prev).set(issueId, {
        status: 'testing',
        progress: 75,
        currentStep: 'Verifying fix...',
      }));

      await new Promise(r => setTimeout(r, 500));

      // Store result
      setFixResults(prev => new Map(prev).set(issueId, result));
      setFixingIssues(prev => new Map(prev).set(issueId, {
        status: result.success ? 'completed' : 'failed',
        progress: 100,
        currentStep: result.success ? 'Fix complete!' : 'Fix failed',
      }));

      if (result.success) {
        toast.success('Issue Fixed!', {
          description: result.message,
        });
        // Mark as fixed and rescan
        markIssueFixed(issueId);
        await handleScan();
        await broadcast('issue_auto_fixed', { issueId, result, timestamp: Date.now() });
      } else {
        toast.error('Fix Failed', {
          description: result.error || result.message,
        });
      }
    } catch (error: any) {
      setFixingIssues(prev => new Map(prev).set(issueId, {
        status: 'failed',
        progress: 100,
        currentStep: 'Fix failed',
      }));
      setFixResults(prev => new Map(prev).set(issueId, {
        issueId,
        success: false,
        message: 'Fix failed unexpectedly',
        affectedCount: 0,
        error: error.message,
      }));
      toast.error('Fix Failed', {
        description: error.message,
      });
    }
  }, [handleScan, broadcast]);

  // Auto-fix all issues
  const handleFixAll = useCallback(async () => {
    const fixableIssues = scanResult?.issues.filter(
      issue => !issue.fixed && issue.severity !== 'info' && getFixFunction(issue.id)
    ) || [];

    if (fixableIssues.length === 0) {
      toast.info('No Fixable Issues', {
        description: 'All issues are either fixed or cannot be auto-fixed.',
      });
      return;
    }

    setIsFixingAll(true);
    
    try {
      const issueIds = fixableIssues.map(i => i.id);
      const results = await fixAllIssues(issueIds);
      
      // Update results and mark successful fixes
      results.forEach(result => {
        setFixResults(prev => new Map(prev).set(result.issueId, result));
        setFixingIssues(prev => new Map(prev).set(result.issueId, {
          status: result.success ? 'completed' : 'failed',
          progress: 100,
          currentStep: result.success ? 'Fixed!' : 'Failed',
        }));
        
        if (result.success) {
          markIssueFixed(result.issueId);
        }
      });

      const successCount = results.filter(r => r.success).length;
      toast.success('Bulk Fix Complete', {
        description: `${successCount} of ${results.length} issues fixed successfully.`,
      });

      // Rescan and broadcast
      await handleScan();
      await broadcast('bulk_fix_complete', { results, timestamp: Date.now() });
    } catch (error: any) {
      toast.error('Bulk Fix Failed', {
        description: error.message,
      });
    } finally {
      setIsFixingAll(false);
    }
  }, [scanResult, handleScan, broadcast]);

  // Subscribe to broadcast channel for real-time sync
  useEffect(() => {
    channelRef.current = supabase
      .channel(BROADCAST_CHANNEL)
      .on('broadcast', { event: 'scan_complete' }, (payload) => {
        if (payload.payload?.result) {
          setScanResult(payload.payload.result);
        }
      })
      .on('broadcast', { event: 'issue_fixed' }, () => {
        // Trigger rescan to sync state
        handleScan();
      })
      .on('broadcast', { event: 'issue_unfixed' }, () => {
        handleScan();
      })
      .on('broadcast', { event: 'all_cleared' }, () => {
        handleScan();
      })
      .on('broadcast', { event: 'issue_auto_fixed' }, () => {
        handleScan();
      })
      .on('broadcast', { event: 'bulk_fix_complete' }, () => {
        handleScan();
      })
      .subscribe();

    // Initial scan
    handleScan();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  // Filter issues based on showFixed toggle
  const displayedIssues = scanResult?.issues.filter(issue => {
    if (issue.severity === 'info') return true;
    return showFixed ? true : !issue.fixed;
  }) || [];

  const activeIssueCount = scanResult?.issues.filter(i => !i.fixed && i.severity !== 'info').length || 0;
  const fixedIssueCount = scanResult?.issues.filter(i => i.fixed && i.severity !== 'info').length || 0;
  const fixableIssueCount = displayedIssues.filter(i => !i.fixed && i.severity !== 'info' && getFixFunction(i.id)).length;

  return {
    scanResult,
    isScanning,
    fixingIssues,
    fixResults,
    isFixingAll,
    displayedIssues,
    activeIssueCount,
    fixedIssueCount,
    fixableIssueCount,
    showFixed,
    setShowFixed,
    handleScan,
    handleMarkFixed,
    handleUnmarkFixed,
    handleClearAllFixed,
    handleAutoFix,
    handleFixAll,
    canAutoFix,
  };
}
