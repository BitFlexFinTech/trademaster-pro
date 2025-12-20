import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { AlertTriangle, Search, RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface StuckTrade {
  id: string;
  pair: string;
  direction: string;
  entry_price: number;
  amount: number;
  exchange_name: string | null;
  created_at: string;
  ageHours: number;
}

interface DiagnosticResult {
  tradeId: string;
  symbol: string;
  credentialFound: boolean;
  ocoStatus: string | null;
  balanceAvailable: number | null;
  currentPrice: number | null;
  unrealizedPnL: number | null;
  lastError: string | null;
}

export function StuckTradesBanner() {
  const { user } = useAuth();
  const [stuckTrades, setStuckTrades] = useState<StuckTrade[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);

  const fetchStuckTrades = async () => {
    if (!user) return;
    
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .lt('created_at', fourHoursAgo)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch stuck trades:', error);
      return;
    }
    
    const tradesWithAge = (data || []).map(trade => ({
      ...trade,
      ageHours: (Date.now() - new Date(trade.created_at).getTime()) / (60 * 60 * 1000)
    }));
    
    setStuckTrades(tradesWithAge);
  };

  useEffect(() => {
    fetchStuckTrades();
    const interval = setInterval(fetchStuckTrades, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  const handleDiagnose = async (trade: StuckTrade) => {
    setDiagnosing(true);
    setDiagnosticResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: { 
          diagnoseTradeId: trade.id 
        }
      });
      
      if (error) throw error;
      
      setDiagnosticResult(data);
      setShowDiagnostics(true);
    } catch (err) {
      console.error('Diagnose error:', err);
      toast.error('Failed to diagnose trade');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleForceSync = async () => {
    setDiagnosing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-trade-status', {
        body: { checkOpenPositions: true, profitThreshold: 0.0001 }
      });
      
      if (error) throw error;
      
      const closed = data?.closedPositions || 0;
      if (closed > 0) {
        toast.success(`${closed} position(s) synced`);
        fetchStuckTrades();
      } else {
        toast.info('No positions ready to close');
      }
    } catch (err) {
      console.error('Force sync error:', err);
      toast.error('Failed to sync positions');
    } finally {
      setDiagnosing(false);
    }
  };

  if (stuckTrades.length === 0) {
    return null;
  }

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          {stuckTrades.length} Position(s) Stuck Open &gt; 4 Hours
          <Badge variant="destructive" className="text-[10px]">
            Needs Review
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2">
          <div className="flex flex-wrap gap-2 mb-3">
            {stuckTrades.slice(0, 5).map(trade => (
              <Badge 
                key={trade.id} 
                variant="outline" 
                className="text-[10px] border-destructive/50"
              >
                {trade.pair} ({trade.ageHours.toFixed(1)}h)
              </Badge>
            ))}
            {stuckTrades.length > 5 && (
              <Badge variant="secondary" className="text-[10px]">
                +{stuckTrades.length - 5} more
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleDiagnose(stuckTrades[0])}
              disabled={diagnosing}
              className="h-7 text-xs"
            >
              {diagnosing ? (
                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Search className="w-3 h-3 mr-1" />
              )}
              Diagnose Oldest
            </Button>
            
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={handleForceSync}
              disabled={diagnosing}
              className="h-7 text-xs"
            >
              <RefreshCw className={cn("w-3 h-3 mr-1", diagnosing && "animate-spin")} />
              Force Sync All
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Diagnostics Modal */}
      <Dialog open={showDiagnostics} onOpenChange={setShowDiagnostics}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-4 h-4 text-primary" />
              Trade Diagnostics
            </DialogTitle>
            <DialogDescription>
              Detailed status check for stuck position
            </DialogDescription>
          </DialogHeader>
          
          {diagnosticResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Symbol */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Symbol</span>
                  <span className="text-sm font-medium">{diagnosticResult.symbol || '--'}</span>
                </div>
                
                {/* Credentials */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Credentials</span>
                  <div className="flex items-center gap-1">
                    {diagnosticResult.credentialFound ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span className="text-sm text-primary font-medium">Found</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-destructive" />
                        <span className="text-sm text-destructive font-medium">Missing</span>
                      </>
                    )}
                  </div>
                </div>
                
                {/* OCO Status */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">OCO Status</span>
                  <Badge variant="outline" className="text-xs">
                    {diagnosticResult.ocoStatus || 'No OCO'}
                  </Badge>
                </div>
                
                {/* Balance */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Balance Available</span>
                  <span className="text-sm font-mono">
                    {diagnosticResult.balanceAvailable !== null 
                      ? diagnosticResult.balanceAvailable.toFixed(6)
                      : '--'
                    }
                  </span>
                </div>
                
                {/* Current Price */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Current Price</span>
                  <span className="text-sm font-mono">
                    ${diagnosticResult.currentPrice?.toFixed(2) || '--'}
                  </span>
                </div>
                
                {/* Unrealized P&L */}
                <div className="bg-secondary/30 rounded p-3">
                  <span className="text-xs text-muted-foreground block mb-1">Unrealized P&L</span>
                  <span className={cn(
                    "text-sm font-mono font-medium",
                    (diagnosticResult.unrealizedPnL || 0) >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    ${diagnosticResult.unrealizedPnL?.toFixed(3) || '--'}
                  </span>
                </div>
              </div>
              
              {diagnosticResult.lastError && (
                <div className="bg-destructive/10 rounded p-3 border border-destructive/30">
                  <span className="text-xs text-destructive font-medium block mb-1">Last Error</span>
                  <span className="text-xs text-destructive/80">{diagnosticResult.lastError}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
