import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Shield, AlertTriangle, TrendingUp, TrendingDown, 
  Activity, DollarSign, Gauge, RefreshCw, Radio
} from 'lucide-react';
import { useJarvisFuturesPositions } from '@/hooks/useJarvisFuturesPositions';
import { useRiskAnalysis } from '@/hooks/useRiskAnalysis';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PositionRisk {
  symbol: string;
  exchange: string;
  size: number;
  liquidationDistance: number;
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
  unrealizedPnL: number;
  leverage: number;
}

export function RealTimeRiskDashboard() {
  const { 
    longPosition, 
    shortPosition, 
    marginBalance, 
    availableBalance,
    isLoading,
    refetch 
  } = useJarvisFuturesPositions();
  
  const { riskData } = useRiskAnalysis();
  const { settings } = useJarvisSettings();

  // Calculate total exposure
  const longExposure = longPosition ? Math.abs(longPosition.positionAmt * longPosition.entryPrice) : 0;
  const shortExposure = shortPosition ? Math.abs(shortPosition.positionAmt * shortPosition.entryPrice) : 0;
  const totalExposure = longExposure + shortExposure;

  // Calculate margin usage
  const usedMargin = marginBalance && availableBalance 
    ? ((marginBalance - availableBalance) / marginBalance) * 100 
    : 0;

  // Get positions with risk levels
  const positions: PositionRisk[] = [];
  
  if (longPosition) {
    const riskLevel = longPosition.liquidationDistance > 25 ? 'SAFE' :
                      longPosition.liquidationDistance > 20 ? 'WARNING' : 'CRITICAL';
    positions.push({
      symbol: longPosition.symbol,
      exchange: 'Binance',
      size: Math.abs(longPosition.positionAmt * longPosition.entryPrice),
      liquidationDistance: longPosition.liquidationDistance,
      riskLevel,
      unrealizedPnL: longPosition.unrealizedProfit,
      leverage: longPosition.leverage,
    });
  }

  if (shortPosition) {
    const riskLevel = shortPosition.liquidationDistance > 25 ? 'SAFE' :
                      shortPosition.liquidationDistance > 20 ? 'WARNING' : 'CRITICAL';
    positions.push({
      symbol: shortPosition.symbol,
      exchange: 'Binance',
      size: Math.abs(shortPosition.positionAmt * shortPosition.entryPrice),
      liquidationDistance: shortPosition.liquidationDistance,
      riskLevel,
      unrealizedPnL: shortPosition.unrealizedProfit,
      leverage: shortPosition.leverage,
    });
  }

  const totalUnrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const hasCriticalPositions = positions.some(p => p.riskLevel === 'CRITICAL');
  const hasWarningPositions = positions.some(p => p.riskLevel === 'WARNING');

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'SAFE': return '🟢';
      case 'WARNING': return '🟡';
      case 'CRITICAL': return '🔴';
      default: return '⚪';
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'SAFE': return 'text-emerald-400 border-emerald-500/50';
      case 'WARNING': return 'text-amber-400 border-amber-500/50';
      case 'CRITICAL': return 'text-red-400 border-red-500/50';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Real-Time Risk Monitor
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                hasCriticalPositions ? "text-red-400 border-red-500/50 animate-pulse" :
                hasWarningPositions ? "text-amber-400 border-amber-500/50" :
                "text-emerald-400 border-emerald-500/50"
              )}
            >
              <Radio className="h-3 w-3 mr-1" />
              LIVE
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refetch}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
              <DollarSign className="h-3 w-3" />
              TOTAL EXPOSURE
            </div>
            <div className="text-lg font-bold text-slate-200">
              ${totalExposure.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
              <Gauge className="h-3 w-3" />
              MARGIN USAGE
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-lg font-bold",
                usedMargin > 80 ? "text-red-400" :
                usedMargin > 60 ? "text-amber-400" : "text-emerald-400"
              )}>
                {usedMargin.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={usedMargin} 
              className="h-1.5 mt-1 bg-slate-800"
            />
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Activity className="h-3 w-3" />
              UNREALIZED P&L
            </div>
            <span className={cn(
              "text-lg font-bold",
              totalUnrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400"
            )}>
              {totalUnrealizedPnL >= 0 ? '+' : ''}${totalUnrealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Positions Table */}
        {positions.length > 0 ? (
          <div>
            <div className="text-[10px] text-slate-500 mb-2">POSITIONS</div>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {positions.map((position, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "p-3 rounded-lg border transition-all",
                      position.riskLevel === 'CRITICAL' ? "border-red-500/50 bg-red-500/5" :
                      position.riskLevel === 'WARNING' ? "border-amber-500/50 bg-amber-500/5" :
                      "border-slate-800 bg-slate-900/50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {position.unrealizedPnL >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-semibold text-sm text-slate-200">
                          {position.symbol}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {position.leverage}x
                        </Badge>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px]", getRiskColor(position.riskLevel))}>
                        {getRiskIcon(position.riskLevel)} {position.riskLevel}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Size:</span>
                        <span className="text-slate-300 ml-1">${position.size.toFixed(0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Liq Dist:</span>
                        <span className={cn(
                          "ml-1",
                          position.liquidationDistance > 25 ? "text-emerald-400" :
                          position.liquidationDistance > 20 ? "text-amber-400" : "text-red-400"
                        )}>
                          {position.liquidationDistance.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">P&L:</span>
                        <span className={cn(
                          "ml-1",
                          position.unrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Liquidation Distance Bar */}
                    <div className="mt-2">
                      <Progress 
                        value={Math.min(100, 100 - position.liquidationDistance)} 
                        className={cn(
                          "h-1.5 bg-slate-800",
                          position.riskLevel === 'CRITICAL' && "animate-pulse"
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No open positions
          </div>
        )}

        {/* Warning Banner */}
        {hasCriticalPositions && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-xs text-red-400">
              Critical liquidation risk detected! Consider reducing position size.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}