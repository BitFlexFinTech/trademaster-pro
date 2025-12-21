import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Zap,
  Shield,
  RefreshCw,
  StopCircle,
  Brain,
  Wallet
} from 'lucide-react';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useJarvisSentinels } from '@/hooks/useJarvisSentinels';
import { useJarvisFuturesPositions } from '@/hooks/useJarvisFuturesPositions';
import { useJarvisAIAdvisor } from '@/hooks/useJarvisAIAdvisor';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useEmergencyKillSwitch } from '@/hooks/useEmergencyKillSwitch';
import { cn } from '@/lib/utils';

export function JarvisEngineDashboard() {
  const [symbol] = useState('BTCUSDT');
  
  const { regime, ema200, currentPrice, deviation, adaptiveTarget, isLoading: regimeLoading } = useJarvisRegime(symbol);
  const { rate, liquidation, alerts } = useJarvisSentinels();
  const { longPosition, shortPosition, marginBalance, availableBalance, isLoading: positionsLoading, refetch } = useJarvisFuturesPositions();
  const { suggestions, currentAnalysis, isLoading: advisorLoading } = useJarvisAIAdvisor(symbol);
  const { settings } = useJarvisSettings();
  
  const currentPnL = (longPosition?.unrealizedProfit ?? 0) + (shortPosition?.unrealizedProfit ?? 0);
  const { killStatus, triggerKill, isKilling } = useEmergencyKillSwitch({ currentPnL });

  const getRegimeIcon = () => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-4 w-4" />;
      case 'BEAR': return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'BULL': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'BEAR': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    }
  };

  const getRateColor = () => {
    if (rate.load < 50) return 'bg-emerald-500';
    if (rate.load < 80) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getLiquidationColor = (distance: number | null) => {
    if (!distance) return 'bg-muted';
    if (distance > 25) return 'bg-emerald-500';
    if (distance > 22) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <Card className="bg-slate-950 border-slate-800 font-mono text-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-semibold">JARVIS ENGINE: 24/7</span>
          </div>
          <Badge variant="outline" className="text-emerald-400 border-emerald-500/50 bg-emerald-500/10">
            <Activity className="h-3 w-3 mr-1" />
            ACTIVE
          </Badge>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={cn("border", getRegimeColor())}>
            {getRegimeIcon()}
            <span className="ml-1">{regime}</span>
          </Badge>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refetch}
            className="h-7 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Section - Balance & Positions */}
        <div className="lg:col-span-7 space-y-4">
          {/* Balance Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                <Wallet className="h-3 w-3" />
                MARGIN BALANCE
              </div>
              <div className="text-lg font-bold text-slate-200">
                ${marginBalance?.toFixed(2) ?? '---'}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">AVAILABLE</div>
              <div className="text-lg font-bold text-slate-200">
                ${availableBalance?.toFixed(2) ?? '---'}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">UNREALIZED P&L</div>
              <div className={cn("text-lg font-bold", currentPnL >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">ADAPTIVE TARGET</div>
              <div className="text-lg font-bold text-cyan-400">
                ${adaptiveTarget.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Positions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* LONG Position */}
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">LONG</span>
                </div>
                {longPosition && (
                  <Badge variant="outline" className="text-xs border-slate-700">
                    {longPosition.leverage}x
                  </Badge>
                )}
              </div>
              
              {longPosition ? (
                <div className="space-y-2">
                  <div className="text-slate-400 text-xs">{longPosition.symbol}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Entry:</span>
                      <span className="text-slate-300 ml-1">${longPosition.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Size:</span>
                      <span className="text-slate-300 ml-1">{longPosition.positionAmt}</span>
                    </div>
                  </div>
                  <div className={cn("font-bold", longPosition.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    P&L: {longPosition.unrealizedProfit >= 0 ? '+' : ''}${longPosition.unrealizedProfit.toFixed(2)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Liq: ${longPosition.liquidationPrice.toFixed(2)}</span>
                      <span className={cn(
                        longPosition.liquidationDistance > 25 ? 'text-emerald-400' :
                        longPosition.liquidationDistance > 22 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {longPosition.liquidationDistance.toFixed(1)}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(100, (100 - longPosition.liquidationDistance))} 
                      className="h-1.5 bg-slate-800"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-slate-600 text-xs">No LONG position</div>
              )}
            </div>

            {/* SHORT Position */}
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-red-400 font-semibold">SHORT</span>
                </div>
                {shortPosition && (
                  <Badge variant="outline" className="text-xs border-slate-700">
                    {shortPosition.leverage}x
                  </Badge>
                )}
              </div>
              
              {shortPosition ? (
                <div className="space-y-2">
                  <div className="text-slate-400 text-xs">{shortPosition.symbol}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Entry:</span>
                      <span className="text-slate-300 ml-1">${shortPosition.entryPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Size:</span>
                      <span className="text-slate-300 ml-1">{Math.abs(shortPosition.positionAmt)}</span>
                    </div>
                  </div>
                  <div className={cn("font-bold", shortPosition.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    P&L: {shortPosition.unrealizedProfit >= 0 ? '+' : ''}${shortPosition.unrealizedProfit.toFixed(2)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Liq: ${shortPosition.liquidationPrice.toFixed(2)}</span>
                      <span className={cn(
                        shortPosition.liquidationDistance > 25 ? 'text-emerald-400' :
                        shortPosition.liquidationDistance > 22 ? 'text-amber-400' : 'text-red-400'
                      )}>
                        {shortPosition.liquidationDistance.toFixed(1)}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(100, (100 - shortPosition.liquidationDistance))} 
                      className="h-1.5 bg-slate-800"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-slate-600 text-xs">No SHORT position</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Section - Status & AI */}
        <div className="lg:col-span-5 space-y-4">
          {/* API Load & Liquidation Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-2">
                <Zap className="h-3 w-3" />
                API LOAD
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={cn(
                    "text-lg font-bold",
                    rate.load < 50 ? 'text-emerald-400' :
                    rate.load < 80 ? 'text-amber-400' : 'text-red-400'
                  )}>
                    {rate.load.toFixed(0)}%
                  </span>
                  <span className="text-slate-500 text-xs">{rate.requestsPerMinute}/min</span>
                </div>
                <Progress 
                  value={rate.load} 
                  className={cn("h-1.5 bg-slate-800", getRateColor())}
                />
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-2">
                <Shield className="h-3 w-3" />
                LIQ STATUS
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-lg font-bold",
                  liquidation.alertLevel === 'safe' ? 'text-emerald-400' :
                  liquidation.alertLevel === 'warning' ? 'text-amber-400' : 'text-red-400'
                )}>
                  {liquidation.minDistance.toFixed(1)}%
                </span>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    liquidation.alertLevel === 'safe' ? 'border-emerald-500/50 text-emerald-400' :
                    liquidation.alertLevel === 'warning' ? 'border-amber-500/50 text-amber-400' : 
                    'border-red-500/50 text-red-400'
                  )}
                >
                  {liquidation.alertLevel.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* AI Advisor */}
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
            <div className="flex items-center gap-1.5 text-cyan-400 text-xs mb-2">
              <Brain className="h-3 w-3" />
              AI ADVISOR
            </div>
            <div className="text-slate-400 text-xs mb-2 line-clamp-2">
              {advisorLoading ? 'Analyzing market conditions...' : currentAnalysis}
            </div>
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                {suggestions.slice(-2).map((s, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "text-xs p-2 rounded border",
                      s.type === 'entry' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                      s.type === 'exit' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                      s.type === 'warning' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                      'bg-slate-800 border-slate-700 text-slate-300'
                    )}
                  >
                    {s.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Emergency Stop */}
          <Button 
            variant="destructive" 
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold"
            onClick={() => triggerKill('manual')}
            disabled={isKilling}
          >
            <StopCircle className="h-4 w-4 mr-2" />
            {isKilling ? 'EXECUTING KILL...' : 'EMERGENCY STOP'}
          </Button>
        </div>
      </div>

      {/* Alerts Footer */}
      {alerts.length > 0 && (
        <div className="border-t border-slate-800 px-4 py-2 bg-slate-900/30">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span className="text-slate-400">
              {alerts[alerts.length - 1]?.message}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}