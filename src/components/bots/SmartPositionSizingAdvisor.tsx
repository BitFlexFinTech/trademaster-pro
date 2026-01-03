import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Shield,
  Zap,
  Target,
  DollarSign,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRiskAdjustedPositionSizing } from '@/hooks/useRiskAdjustedPositionSizing';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';

interface SizingScenario {
  label: string;
  size: number;
  eta: string;
  risk: 'low' | 'medium' | 'high';
  description: string;
}

export function SmartPositionSizingAdvisor({ 
  mode = 'spot',
  accountBalance = 1000 
}: { 
  mode?: 'spot' | 'leverage';
  accountBalance?: number;
}) {
  const { recommendation, riskMetrics, isLoading, targetProfit } = useRiskAdjustedPositionSizing(mode);
  const { tickersMap, isConnected } = useBinanceWebSocket();
  const { analytics } = useTradeAnalytics(7); // Last 7 days for recent performance

  // Get real-time BTC volatility from WebSocket
  const liveVolatility = useMemo(() => {
    const btcTicker = tickersMap.get('BTCUSDT');
    if (!btcTicker) return riskMetrics.recentVolatility;
    
    // Use 24h price change as volatility proxy
    const change24h = Math.abs(btcTicker.priceChangePercent || 0);
    return change24h / 24; // Hourly volatility estimate
  }, [tickersMap, riskMetrics.recentVolatility]);

  // Calculate scenarios based on recommendation
  const scenarios = useMemo<SizingScenario[]>(() => {
    const baseSize = recommendation.adjustedSize;
    const avgTime = riskMetrics.avgTradeTime;
    
    return [
      {
        label: 'Conservative',
        size: Math.round(baseSize * 0.7),
        eta: `~${Math.round(avgTime * 1.4)} min`,
        risk: 'low',
        description: 'Lower risk, slower but safer gains',
      },
      {
        label: 'Recommended',
        size: Math.round(baseSize),
        eta: `~${Math.round(avgTime)} min`,
        risk: 'medium',
        description: 'Optimal balance of speed and safety',
      },
      {
        label: 'Aggressive',
        size: Math.round(baseSize * 1.3),
        eta: `~${Math.round(avgTime * 0.7)} min`,
        risk: 'high',
        description: 'Faster but higher exposure',
      },
    ];
  }, [recommendation, riskMetrics]);

  // Calculate account usage percentage
  const accountUsagePct = useMemo(() => {
    return (recommendation.adjustedSize / accountBalance) * 100;
  }, [recommendation, accountBalance]);

  // Recent performance bonus/penalty
  const performanceModifier = useMemo(() => {
    if (analytics.overallWinRate >= 85) return { label: '↑ High win rate bonus', value: 10 };
    if (analytics.overallWinRate >= 75) return { label: '→ Good performance', value: 0 };
    if (analytics.overallWinRate >= 60) return { label: '↓ Below target', value: -10 };
    return { label: '↓↓ Reduce sizing', value: -20 };
  }, [analytics]);

  if (isLoading) {
    return (
      <Card className="card-glass animate-pulse">
        <CardContent className="p-4 h-[300px]" />
      </Card>
    );
  }

  return (
    <Card className="card-glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Smart Position Advisor</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            Balance: ${accountBalance.toLocaleString()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 space-y-4">
        {/* Main Recommendation */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Recommended Size</span>
            <Badge variant="default" className="text-sm font-mono font-bold">
              ${recommendation.adjustedSize}
            </Badge>
          </div>
          
          <div className="text-[10px] text-muted-foreground mb-2">
            💡 {recommendation.reasoning}
          </div>
          
          {/* Account Usage */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Account Usage</span>
              <span className={cn(
                "font-medium",
                accountUsagePct > 50 ? "text-destructive" : 
                accountUsagePct > 30 ? "text-yellow-500" : "text-primary"
              )}>
                {accountUsagePct.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={Math.min(100, accountUsagePct)} 
              className="h-1.5"
            />
          </div>
        </div>

        {/* Live Market Data */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-secondary/30">
            <div className="text-[10px] text-muted-foreground">Volatility</div>
            <div className="text-sm font-mono font-semibold">
              {(liveVolatility * 100).toFixed(2)}%
            </div>
            <div className={cn(
              "text-[9px]",
              liveVolatility > 0.5 ? "text-destructive" : 
              liveVolatility < 0.3 ? "text-primary" : "text-muted-foreground"
            )}>
              {liveVolatility > 0.5 ? 'High' : liveVolatility < 0.3 ? 'Low' : 'Normal'}
            </div>
          </div>
          
          <div className="p-2 rounded bg-secondary/30">
            <div className="text-[10px] text-muted-foreground">Win Rate</div>
            <div className="text-sm font-mono font-semibold">
              {(riskMetrics.winRate * 100).toFixed(0)}%
            </div>
            <div className={cn(
              "text-[9px]",
              performanceModifier.value > 0 ? "text-primary" : 
              performanceModifier.value < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {performanceModifier.label}
            </div>
          </div>
          
          <div className="p-2 rounded bg-secondary/30">
            <div className="text-[10px] text-muted-foreground">Drawdown</div>
            <div className="text-sm font-mono font-semibold">
              {riskMetrics.currentDrawdown.toFixed(1)}%
            </div>
            <div className={cn(
              "text-[9px]",
              riskMetrics.currentDrawdown > 10 ? "text-destructive" : 
              riskMetrics.currentDrawdown > 5 ? "text-yellow-500" : "text-primary"
            )}>
              {riskMetrics.currentDrawdown > 10 ? 'High risk' : 
               riskMetrics.currentDrawdown > 5 ? 'Caution' : 'Healthy'}
            </div>
          </div>
        </div>

        {/* Sizing Scenarios */}
        <div>
          <div className="text-xs font-medium mb-2 flex items-center gap-2">
            <Target className="w-3 h-3" />
            Sizing Scenarios for ${targetProfit} target
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            {scenarios.map((scenario, idx) => (
              <div 
                key={scenario.label}
                className={cn(
                  "p-2 rounded-lg border text-center transition-all",
                  idx === 1 
                    ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30" 
                    : "bg-secondary/30 border-border hover:border-primary/30"
                )}
              >
                <div className="text-[10px] text-muted-foreground mb-1">
                  {scenario.label}
                </div>
                <div className="text-lg font-bold font-mono">
                  ${scenario.size}
                </div>
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground my-1">
                  <Clock className="w-2.5 h-2.5" />
                  {scenario.eta}
                </div>
                <Badge 
                  variant={
                    scenario.risk === 'low' ? 'outline' : 
                    scenario.risk === 'medium' ? 'default' : 'destructive'
                  }
                  className="text-[8px] px-1.5 py-0"
                >
                  {scenario.risk === 'low' && <Shield className="w-2 h-2 mr-0.5" />}
                  {scenario.risk === 'medium' && <Target className="w-2 h-2 mr-0.5" />}
                  {scenario.risk === 'high' && <Zap className="w-2 h-2 mr-0.5" />}
                  {scenario.risk}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Alerts */}
        {(riskMetrics.currentDrawdown > 5 || riskMetrics.winRate < 0.7) && (
          <div className={cn(
            "p-2 rounded-lg border flex items-start gap-2 text-xs",
            riskMetrics.currentDrawdown > 10 
              ? "bg-destructive/10 border-destructive/30" 
              : "bg-yellow-500/10 border-yellow-500/30"
          )}>
            <AlertTriangle className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              riskMetrics.currentDrawdown > 10 ? "text-destructive" : "text-yellow-500"
            )} />
            <div>
              <div className="font-medium">
                {riskMetrics.currentDrawdown > 10 
                  ? 'High Drawdown Alert' 
                  : 'Performance Notice'}
              </div>
              <div className="text-muted-foreground text-[10px] mt-0.5">
                {riskMetrics.currentDrawdown > 10 
                  ? `Position size reduced by ${((1 - recommendation.riskMultiplier) * 100).toFixed(0)}% due to ${riskMetrics.currentDrawdown.toFixed(1)}% drawdown`
                  : riskMetrics.winRate < 0.7 
                    ? `Win rate ${(riskMetrics.winRate * 100).toFixed(0)}% below target. Consider reducing position size.`
                    : 'Monitor closely and maintain discipline.'}
              </div>
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t">
          <span>Real-time data: {isConnected ? '🟢 Connected' : '🔴 Offline'}</span>
          <span>Risk Level: 
            <span className={cn(
              "ml-1 font-medium",
              recommendation.riskLevel === 'low' ? "text-primary" :
              recommendation.riskLevel === 'medium' ? "text-yellow-500" : "text-destructive"
            )}>
              {recommendation.riskLevel.toUpperCase()}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
