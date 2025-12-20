import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBalanceReconciliation } from '@/hooks/useBalanceReconciliation';

export function BalanceReconciliationBanner() {
  const { 
    reconciliation, 
    loading, 
    cleaningUp, 
    fetchReconciliation, 
    cleanupOrphanTrades 
  } = useBalanceReconciliation();

  if (!reconciliation?.hasSignificantMismatch && !reconciliation?.orphanTradeCount) {
    return null;
  }

  return (
    <Card className="border-orange-500/50 bg-orange-500/10">
      <CardContent className="py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-orange-300">Balance Mismatch Detected</p>
              <p className="text-sm text-muted-foreground">
                {reconciliation.orphanTradeCount} orphan trades expect ${reconciliation.totalExpectedValue.toFixed(2)}, 
                actual balance is ~${reconciliation.totalActualValue.toFixed(2)} 
                ({reconciliation.discrepancyPercent.toFixed(1)}% discrepancy)
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReconciliation}
              disabled={loading}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1">Refresh</span>
            </Button>
            
            {reconciliation.orphanTradeCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={cleanupOrphanTrades}
                disabled={cleaningUp}
              >
                {cleaningUp ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span className="ml-1">
                  {cleaningUp ? 'Cleaning...' : `Cleanup ${reconciliation.orphanTradeCount} Orphans`}
                </span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
