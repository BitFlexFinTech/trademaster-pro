import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Check, 
  X, 
  AlertTriangle, 
  FileCode, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Bug,
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  Trash2,
  RotateCcw,
  Info,
  Wrench,
  Zap
} from 'lucide-react';
import { useIssueSync } from '@/hooks/useIssueSync';
import { type DetectedIssue } from '@/lib/debugger/issueScanner';
import { toast } from 'sonner';

export default function Debugger() {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  // Use shared issue sync hook - syncs with BugsDashboard
  const {
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
  } = useIssueSync();

  const toggleIssue = (id: string) => {
    setExpandedIssues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityBorder = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-4 border-l-red-500';
      case 'high': return 'border-l-4 border-l-orange-500';
      case 'medium': return 'border-l-4 border-l-yellow-500';
      case 'info': return 'border-l-4 border-l-blue-500';
      default: return '';
    }
  };


  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Bug className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Trading Bot Debugger</h1>
            <p className="text-muted-foreground">
              Real-time detection and auto-fix of trading issues
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {fixableIssueCount > 0 && (
            <Button 
              variant="default"
              size="sm"
              onClick={handleFixAll}
              disabled={isFixingAll || isScanning}
              className="bg-green-600 hover:bg-green-700"
            >
              {isFixingAll ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-1" />
              )}
              Fix All ({fixableIssueCount})
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowFixed(!showFixed)}
          >
            {showFixed ? 'Hide Fixed' : 'Show Fixed'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleClearAllFixed}
            disabled={fixedIssueCount === 0}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset All
          </Button>
          <Button 
            variant="outline" 
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Rescan
          </Button>
        </div>
      </div>

      {/* Scanning indicator */}
      {isScanning && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Scanning database for issues...</span>
                </div>
                <Progress value={50} className="h-2 animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {scanResult && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-3xl font-bold text-red-400">{scanResult.criticalCount}</p>
                </div>
                <XCircle className="w-10 h-10 text-red-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">High</p>
                  <p className="text-3xl font-bold text-orange-400">{scanResult.highCount}</p>
                </div>
                <AlertTriangle className="w-10 h-10 text-orange-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Medium</p>
                  <p className="text-3xl font-bold text-yellow-400">{scanResult.mediumCount}</p>
                </div>
                <Info className="w-10 h-10 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Fixed</p>
                  <p className="text-3xl font-bold text-green-400">{fixedIssueCount}</p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tables Scanned</p>
                  <p className="text-3xl font-bold text-blue-400">{scanResult.scannedTables.length}</p>
                </div>
                <Database className="w-10 h-10 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Issues List */}
      {scanResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              {showFixed ? 'All Issues' : 'Active Issues'} ({displayedIssues.length})
            </h2>
            {activeIssueCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {activeIssueCount} Need Attention
              </Badge>
            )}
          </div>
          
          {displayedIssues.length === 0 ? (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-green-400">All Clear!</h3>
                <p className="text-muted-foreground">No active issues detected in the database.</p>
              </CardContent>
            </Card>
          ) : (
            displayedIssues.map((issue) => {
              const fixProgress = fixingIssues.get(issue.id);
              const fixResult = fixResults.get(issue.id);
              const issueCanAutoFix = canAutoFix(issue.id);
              const isFixing = fixProgress?.status === 'fixing' || fixProgress?.status === 'testing';

              return (
                <Collapsible
                  key={issue.id}
                  open={expandedIssues.has(issue.id)}
                  onOpenChange={() => toggleIssue(issue.id)}
                >
                  <Card className={`${getSeverityBorder(issue.severity)} ${issue.fixed ? 'opacity-60' : ''}`}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {expandedIssues.has(issue.id) ? (
                              <ChevronDown className="w-5 h-5 mt-0.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-5 h-5 mt-0.5 text-muted-foreground" />
                            )}
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Badge className={getSeverityColor(issue.severity)}>
                                  {issue.severity.toUpperCase()}
                                </Badge>
                                <Badge variant="outline">{issue.category}</Badge>
                                <Badge variant="secondary">{issue.count} occurrence(s)</Badge>
                                {issue.fixed && (
                                  <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                                    <Check className="w-3 h-3 mr-1" />
                                    FIXED
                                  </Badge>
                                )}
                                {issueCanAutoFix && !issue.fixed && (
                                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                                    <Wrench className="w-3 h-3 mr-1" />
                                    AUTO-FIXABLE
                                  </Badge>
                                )}
                              </div>
                              <CardTitle className="text-base">{issue.title}</CardTitle>
                              <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                            </div>
                          </div>
                          
                          {/* Action buttons */}
                          {issue.severity !== 'info' && (
                            <div onClick={(e) => e.stopPropagation()} className="flex gap-2">
                              {/* Auto-Fix button */}
                              {issueCanAutoFix && !issue.fixed && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAutoFix(issue.id)}
                                  disabled={isFixing}
                                  className="text-blue-400 border-blue-500/50 hover:bg-blue-500/10"
                                >
                                  {isFixing ? (
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  ) : (
                                    <Wrench className="w-4 h-4 mr-1" />
                                  )}
                                  Auto Fix
                                </Button>
                              )}
                              
                              {/* Mark Fixed / Unfix button */}
                              {issue.fixed ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnmarkFixed(issue.id)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <RotateCcw className="w-4 h-4 mr-1" />
                                  Unfix
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMarkFixed(issue.id)}
                                  className="text-green-400 border-green-500/50 hover:bg-green-500/10"
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Mark Fixed
                                </Button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Fix Progress Bar */}
                        {fixProgress && fixProgress.status !== 'pending' && (
                          <div className="mt-3 ml-8">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground">{fixProgress.currentStep}</span>
                              <span className={
                                fixProgress.status === 'completed' ? 'text-green-400' :
                                fixProgress.status === 'failed' ? 'text-red-400' :
                                'text-blue-400'
                              }>
                                {fixProgress.progress}%
                              </span>
                            </div>
                            <Progress 
                              value={fixProgress.progress} 
                              className={`h-1.5 ${
                                fixProgress.status === 'completed' ? '[&>div]:bg-green-500' :
                                fixProgress.status === 'failed' ? '[&>div]:bg-red-500' :
                                ''
                              }`}
                            />
                          </div>
                        )}
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        {/* Fix Result Report */}
                        {fixResult && (
                          <div className={`p-3 rounded-lg border ${
                            fixResult.success 
                              ? 'bg-green-500/10 border-green-500/30' 
                              : 'bg-red-500/10 border-red-500/30'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              {fixResult.success ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-400" />
                              )}
                              <span className={`font-medium ${fixResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                {fixResult.success ? 'Fix Report' : 'Fix Failed'}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{fixResult.message}</p>
                            {fixResult.affectedCount > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Affected records: {fixResult.affectedCount}
                              </p>
                            )}
                            {fixResult.error && (
                              <p className="text-xs text-red-400 mt-1">Error: {fixResult.error}</p>
                            )}
                          </div>
                        )}

                        {/* Impact */}
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-sm font-medium text-destructive mb-1">Impact:</p>
                          <p className="text-sm text-muted-foreground">{issue.impact}</p>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {issue.affectedPairs && issue.affectedPairs.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground mb-1">Affected Pairs</p>
                              <p className="text-sm font-medium">{issue.affectedPairs.join(', ')}</p>
                            </div>
                          )}
                          {issue.affectedExchanges && issue.affectedExchanges.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground mb-1">Exchanges</p>
                              <p className="text-sm font-medium">{issue.affectedExchanges.join(', ')}</p>
                            </div>
                          )}
                          {issue.lastOccurrence && (
                            <div className="bg-muted/50 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground mb-1">Last Seen</p>
                              <p className="text-sm font-medium">
                                {new Date(issue.lastOccurrence).toLocaleString()}
                              </p>
                            </div>
                          )}
                          {issue.fixedAt && (
                            <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                              <p className="text-xs text-green-400 mb-1">Marked Fixed</p>
                              <p className="text-sm font-medium text-green-300">
                                {new Date(issue.fixedAt).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>
      )}

      {/* Scan Info */}
      {scanResult && (
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Scan time: {scanResult.scanTime}ms</span>
              <span>•</span>
              <span>Tables scanned: {scanResult.scannedTables.join(', ')}</span>
              <span>•</span>
              <span>Last scan: {new Date(scanResult.lastScanAt).toLocaleTimeString()}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}