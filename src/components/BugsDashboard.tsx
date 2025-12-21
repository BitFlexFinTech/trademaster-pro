import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bug, Search, Zap, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Trash2, DollarSign, Wrench, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBalanceReconciliation } from '@/hooks/useBalanceReconciliation';
import { ProfitAuditLogViewer } from '@/components/bugs/ProfitAuditLogViewer';
import { useIssueSync } from '@/hooks/useIssueSync';

interface BugEntry {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  location: string;
  description: string;
  status: 'SCANNING' | 'DETECTED' | 'FIXING' | 'FIXED' | 'DEPLOYED' | 'FAILED';
  currentPhase: string;
  rootCause?: string;
  fixStrategy?: string;
  userReported?: boolean;
}

interface SystemStatus {
  currentPhase: string;
  phaseProgress: number;
  totalBugsFound: number;
  bugsFixed: number;
  criticalBugs: number;
  highBugs: number;
  mediumBugs: number;
  lowBugs: number;
  isScanning: boolean;
  lastUpdate: string;
  currentAction: string;
}

export default function BugsDashboard() {
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [problemInput, setProblemInput] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);

  // Use shared issue sync hook - syncs with Debugger page
  const {
    scanResult,
    isScanning,
    fixingIssues,
    isFixingAll,
    displayedIssues,
    activeIssueCount,
    fixedIssueCount,
    fixableIssueCount,
    handleScan,
    handleAutoFix,
    handleFixAll,
    canAutoFix,
  } = useIssueSync();

  // Balance reconciliation hook
  const { 
    reconciliation, 
    orphanTrades,
    loading: reconciliationLoading, 
    cleaningUp, 
    fetchReconciliation, 
    cleanupOrphanTrades 
  } = useBalanceReconciliation();

  // Convert issues to BugEntry format for display
  const bugs: BugEntry[] = displayedIssues.map(issue => ({
    id: issue.id,
    timestamp: issue.lastOccurrence || new Date().toLocaleTimeString(),
    severity: issue.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
    category: issue.category,
    location: issue.affectedExchanges?.join(', ') || 'System',
    description: issue.description,
    status: issue.fixed ? 'FIXED' : 'DETECTED',
    currentPhase: issue.fixed ? 'Resolved' : 'Active',
    rootCause: issue.impact,
    userReported: false,
  }));

  const status: SystemStatus = {
    currentPhase: isScanning ? 'Scanning...' : 'Ready',
    phaseProgress: isScanning ? 50 : 100,
    totalBugsFound: scanResult?.totalCount || 0,
    bugsFixed: fixedIssueCount,
    criticalBugs: scanResult?.criticalCount || 0,
    highBugs: scanResult?.highCount || 0,
    mediumBugs: scanResult?.mediumCount || 0,
    lowBugs: scanResult?.issues.filter(i => i.severity === 'info').length || 0,
    isScanning,
    lastUpdate: scanResult?.lastScanAt ? new Date(scanResult.lastScanAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
    currentAction: isScanning ? 'Analyzing database...' : 'Ready for action',
  };

  const handleScanAndFix = async () => {
    toast.info('🐛 Starting comprehensive bug scan & fix...');
    
    // First scan
    await handleScan();
    
    // Then fix all fixable issues
    if (fixableIssueCount > 0) {
      await handleFixAll();
    }
    
    toast.success('✅ Scan and fix complete!');
  };

  const handleReportProblem = async () => {
    if (!problemInput.trim()) {
      toast.error('Please describe the problem');
      return;
    }
    
    setIsInvestigating(true);
    toast.info(`🔍 Investigating: "${problemInput}"`);
    
    // Trigger a scan to look for related issues
    await handleScan();
    
    setProblemInput('');
    setIsInvestigating(false);
    toast.success('Investigation complete - see results above');
  };

  const filteredBugs = filter === 'ALL' 
    ? bugs 
    : bugs.filter(bug => bug.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'CRITICAL': return 'bg-destructive text-destructive-foreground';
      case 'HIGH': return 'bg-orange-500 text-white';
      case 'MEDIUM': return 'bg-yellow-500 text-black';
      case 'LOW': return 'bg-blue-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'SCANNING': return <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />;
      case 'DETECTED': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'FIXING': return <Clock className="w-4 h-4 animate-pulse text-orange-400" />;
      case 'FIXED': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'DEPLOYED': return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'FAILED': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-red-600/20 border-purple-500/30">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold flex items-center justify-center gap-3">
            <Bug className="w-10 h-10" />
            BUGS Dashboard
            <Bug className="w-10 h-10" />
          </CardTitle>
          <p className="text-muted-foreground">
            Real-Time Bug Detection & Auto-Fix System
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Problem Report Input */}
          <div className="bg-card/50 rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Report a Problem
            </h3>
            <div className="flex gap-2">
              <Input
                value={problemInput}
                onChange={(e) => setProblemInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleReportProblem()}
                placeholder="e.g., 'Bot closing with $0.00 profit' or 'Trades not syncing'"
                disabled={isInvestigating}
                className="flex-1"
              />
              <Button 
                onClick={handleReportProblem}
                disabled={isInvestigating || !problemInput.trim()}
              >
                {isInvestigating ? 'Investigating...' : 'Find & Fix'}
              </Button>
            </div>
          </div>
          
          {/* Big Scan & Fix Button */}
          <div className="flex justify-center gap-4">
            <Button
              size="lg"
              onClick={handleScanAndFix}
              disabled={isScanning || isFixingAll}
              className="text-xl px-8 py-6 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
            >
              {isScanning || isFixingAll ? (
                <>
                  <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                  {isFixingAll ? 'FIXING...' : 'SCANNING...'}
                </>
              ) : (
                <>
                  <Zap className="w-6 h-6 mr-2" />
                  SCAN & FIX ALL
                  <Bug className="w-6 h-6 ml-2" />
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleScan}
              disabled={isScanning}
            >
              <RefreshCw className={`w-5 h-5 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
              Rescan Only
            </Button>
          </div>
          
          {/* Issue counts */}
          {scanResult && (
            <div className="flex justify-center gap-4 text-sm">
              <span className="text-red-400">{scanResult.criticalCount} Critical</span>
              <span className="text-orange-400">{scanResult.highCount} High</span>
              <span className="text-yellow-400">{scanResult.mediumCount} Medium</span>
              <span className="text-green-400">{fixedIssueCount} Fixed</span>
              {fixableIssueCount > 0 && (
                <span className="text-blue-400">{fixableIssueCount} Auto-Fixable</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance Reconciliation Section */}
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-orange-400" />
            Balance Reconciliation
            {reconciliation?.hasSignificantMismatch && (
              <Badge variant="destructive" className="ml-2">Mismatch Detected</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reconciliationLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Checking balances...
            </div>
          ) : !reconciliation ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h3 className="font-semibold text-green-500 mb-2">All Clear!</h3>
              <p className="text-muted-foreground text-sm mb-4">No open positions to reconcile. Your balances are synced.</p>
              <Button variant="outline" size="sm" onClick={fetchReconciliation}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Check Again
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-lg p-3 border">
                  <div className="text-sm text-muted-foreground">Expected Value</div>
                  <div className="text-xl font-bold">${reconciliation.totalExpectedValue.toFixed(2)}</div>
                </div>
                <div className="bg-card rounded-lg p-3 border">
                  <div className="text-sm text-muted-foreground">Actual Value</div>
                  <div className="text-xl font-bold">${reconciliation.totalActualValue.toFixed(2)}</div>
                </div>
                <div className={`rounded-lg p-3 border ${reconciliation.hasSignificantMismatch ? 'bg-destructive/10 border-destructive/30' : 'bg-card'}`}>
                  <div className="text-sm text-muted-foreground">Discrepancy</div>
                  <div className={`text-xl font-bold ${reconciliation.hasSignificantMismatch ? 'text-destructive' : ''}`}>
                    {reconciliation.discrepancyPercent.toFixed(1)}%
                  </div>
                </div>
                <div className={`rounded-lg p-3 border ${reconciliation.orphanTradeCount > 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-card'}`}>
                  <div className="text-sm text-muted-foreground">Orphan Trades</div>
                  <div className={`text-xl font-bold ${reconciliation.orphanTradeCount > 0 ? 'text-orange-400' : ''}`}>
                    {reconciliation.orphanTradeCount}
                  </div>
                </div>
              </div>

              {/* Position Discrepancies */}
              {reconciliation.discrepancies.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Position Breakdown</h4>
                  <div className="space-y-2">
                    {reconciliation.discrepancies.map((d) => (
                      <div key={d.asset} className="flex items-center justify-between bg-card/50 rounded p-2 text-sm">
                        <span className="font-medium">{d.asset}</span>
                        <div className="flex items-center gap-4">
                          <span>Expected: {d.expectedQty.toFixed(6)} (${d.expectedValue.toFixed(2)})</span>
                          <span>Actual: {d.actualQty.toFixed(6)} (${d.actualValue.toFixed(2)})</span>
                          <span className={d.discrepancyPercent > 50 ? 'text-destructive' : 'text-muted-foreground'}>
                            {d.discrepancyPercent.toFixed(1)}% off
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orphan Trades List */}
              {orphanTrades.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-orange-400">Orphan Trades (No Exchange Position)</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {orphanTrades.map((trade) => (
                      <div key={trade.id} className="flex items-center justify-between bg-orange-500/10 rounded p-2 text-sm border border-orange-500/20">
                        <div>
                          <span className="font-medium">{trade.pair}</span>
                          <span className="text-muted-foreground ml-2">${trade.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-muted-foreground">Entry: ${trade.entryPrice.toFixed(4)}</span>
                          <span className="text-muted-foreground">Current: ${trade.currentPrice.toFixed(4)}</span>
                          <span className={trade.estimatedPnL >= 0 ? 'text-green-400' : 'text-destructive'}>
                            Est. P&L: ${trade.estimatedPnL.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchReconciliation}
                  disabled={reconciliationLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${reconciliationLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                
                {reconciliation.orphanTradeCount > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cleanupOrphanTrades}
                    disabled={cleaningUp}
                  >
                    {cleaningUp ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    {cleaningUp ? 'Cleaning up...' : `Cleanup ${reconciliation.orphanTradeCount} Orphan Trades`}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
              <div className="text-destructive text-sm font-semibold">CRITICAL</div>
              <div className="text-2xl font-bold">{status.criticalBugs}</div>
            </div>
            <div className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
              <div className="text-orange-500 text-sm font-semibold">HIGH</div>
              <div className="text-2xl font-bold">{status.highBugs}</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/30">
              <div className="text-yellow-500 text-sm font-semibold">MEDIUM</div>
              <div className="text-2xl font-bold">{status.mediumBugs}</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
              <div className="text-blue-500 text-sm font-semibold">LOW</div>
              <div className="text-2xl font-bold">{status.lowBugs}</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Phase:</span>
              <span className="font-medium">{status.currentPhase}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Action:</span>
              <span className="font-mono text-xs text-primary">{status.currentAction}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${status.phaseProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Found: {status.totalBugsFound}</span>
              <span className="text-green-500">Fixed: {status.bugsFixed}</span>
              <span>Last Update: {status.lastUpdate}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(f => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Bug List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {filteredBugs.length === 0 ? (
            <Card className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {status.isScanning ? 'Scanning for bugs...' : 'No bugs detected. Report a problem or run a full scan.'}
              </p>
            </Card>
          ) : (
            filteredBugs.map(bug => (
              <Card 
                key={bug.id} 
                className={bug.userReported ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : ''}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {bug.userReported && (
                        <Badge variant="outline" className="border-cyan-500 text-cyan-500">
                          👤 USER REPORTED
                        </Badge>
                      )}
                      <Badge className={getSeverityColor(bug.severity)}>
                        {bug.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{bug.id}</span>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(bug.status)}
                        <span className="text-xs">{bug.status}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{bug.timestamp}</span>
                  </div>
                  
                  <h3 className="font-medium mb-2">{bug.description}</h3>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Category:</span>
                      <span className="ml-2 text-purple-400">{bug.category}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Location:</span>
                      <span className="ml-2 font-mono text-xs text-blue-400">{bug.location}</span>
                    </div>
                  </div>
                  
                  {bug.rootCause && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-sm">
                      <span className="text-muted-foreground">Root Cause:</span>
                      <span className="ml-2">{bug.rootCause}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Profit Audit Log Viewer */}
      <ProfitAuditLogViewer />
    </div>
  );
}
