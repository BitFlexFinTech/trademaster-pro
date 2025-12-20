import { useState, useEffect } from 'react';
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
  Wrench,
  Bug,
  Loader2,
  CheckCircle2,
  XCircle,
  Shield
} from 'lucide-react';
import { scanForIssues, applyAllFixes, type DetectedIssue, type ScanResult } from '@/lib/debugger/issueScanner';
import { toast } from 'sonner';

export default function Debugger() {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [fixProgress, setFixProgress] = useState(0);
  const [fixResults, setFixResults] = useState<string[]>([]);

  // Auto-scan on mount
  useEffect(() => {
    handleScan();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setFixResults([]);
    
    // Simulate scanning delay for UX
    await new Promise(r => setTimeout(r, 500));
    
    const result = scanForIssues();
    setScanResult(result);
    setIsScanning(false);
    
    toast.success('Scan Complete', {
      description: `Found ${result.totalCount} unfixed issues (${result.issues.length} total scanned)`,
    });
  };

  const handleFixAll = async () => {
    if (!scanResult) return;
    
    setIsFixing(true);
    setFixProgress(0);
    setFixResults([]);
    
    const totalIssues = scanResult.issues.length;
    
    // Animate progress
    for (let i = 0; i <= totalIssues; i++) {
      await new Promise(r => setTimeout(r, 200));
      setFixProgress((i / totalIssues) * 100);
    }
    
    const result = applyAllFixes();
    setFixResults(result.details);
    
    // Re-scan after fixes
    await handleScan();
    setIsFixing(false);
    
    if (result.failed === 0) {
      toast.success('All Issues Fixed!', {
        description: `${result.applied} fixes verified successfully.`,
      });
    } else {
      toast.warning('Some Issues Remain', {
        description: `${result.applied} fixed, ${result.failed} need attention.`,
      });
    }
  };

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
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityBorder = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-4 border-l-red-500';
      case 'high': return 'border-l-4 border-l-orange-500';
      case 'medium': return 'border-l-4 border-l-yellow-500';
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
              Automatic detection and fixing of profit calculation issues
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleScan}
            disabled={isScanning || isFixing}
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Rescan
          </Button>
          <Button 
            onClick={handleFixAll}
            disabled={isScanning || isFixing || !scanResult}
            className="bg-green-600 hover:bg-green-700"
          >
            {isFixing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Fixing...
              </>
            ) : (
              <>
                <Wrench className="w-4 h-4 mr-2" />
                Verify All Fixes ({scanResult?.issues.length || 0})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Fix Progress */}
      {isFixing && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Verifying fixes...</span>
                  <span className="text-sm text-muted-foreground">{Math.round(fixProgress)}%</span>
                </div>
                <Progress value={fixProgress} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {scanResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Fixed</p>
                  <p className="text-3xl font-bold text-green-400">
                    {scanResult.issues.filter(i => i.fixed).length}
                  </p>
                </div>
                <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Scanned Files</p>
                  <p className="text-3xl font-bold text-blue-400">{scanResult.scannedFiles.length}</p>
                </div>
                <FileCode className="w-10 h-10 text-blue-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fix Results */}
      {fixResults.length > 0 && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              Fix Verification Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-40">
              <div className="space-y-1 font-mono text-sm">
                {fixResults.map((result, idx) => (
                  <div key={idx} className={result.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
                    {result}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Issues List */}
      {scanResult && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Detected Issues ({scanResult.issues.length})
          </h2>
          
          {scanResult.issues.map((issue) => (
            <Collapsible
              key={issue.id}
              open={expandedIssues.has(issue.id)}
              onOpenChange={() => toggleIssue(issue.id)}
            >
              <Card className={`${getSeverityBorder(issue.severity)} ${issue.fixed ? 'opacity-75' : ''}`}>
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
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={getSeverityColor(issue.severity)}>
                              {issue.severity.toUpperCase()}
                            </Badge>
                            {issue.fixed && (
                              <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                                <Check className="w-3 h-3 mr-1" />
                                FIXED
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base">{issue.title}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {issue.locations.length} location(s)
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-4">
                    {/* Impact */}
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <p className="text-sm font-medium text-destructive mb-1">Impact:</p>
                      <p className="text-sm text-muted-foreground">{issue.impact}</p>
                    </div>

                    {/* Locations */}
                    <div>
                      <p className="text-sm font-medium mb-2">Found in:</p>
                      <div className="space-y-1">
                        {issue.locations.map((loc, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm font-mono bg-muted/50 p-2 rounded">
                            <FileCode className="w-4 h-4 text-muted-foreground" />
                            <span className="text-primary">{loc.file}</span>
                            <span className="text-muted-foreground">- line {loc.line}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fix Applied */}
                    {issue.fixed && issue.fixApplied && (
                      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <p className="text-sm font-medium text-green-400 mb-1">Fix Applied:</p>
                        <p className="text-sm text-muted-foreground">{issue.fixApplied}</p>
                      </div>
                    )}

                    {/* Side-by-side code comparison */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <X className="w-4 h-4 text-red-400" />
                          Broken Code
                        </p>
                        <ScrollArea className="h-48">
                          <pre className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-sm overflow-x-auto">
                            <code className="text-red-200">{issue.brokenCode}</code>
                          </pre>
                        </ScrollArea>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-400" />
                          Fixed Code
                        </p>
                        <ScrollArea className="h-48">
                          <pre className="p-4 rounded-lg bg-green-950/30 border border-green-900/50 text-sm overflow-x-auto">
                            <code className="text-green-200">{issue.fixedCode}</code>
                          </pre>
                        </ScrollArea>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Scan Info */}
      {scanResult && (
        <Card className="bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Scan time: {scanResult.scanTime}ms</span>
              <span>•</span>
              <span>Files scanned: {scanResult.scannedFiles.join(', ')}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
