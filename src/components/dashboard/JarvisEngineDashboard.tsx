import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  Settings,
  Save,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useJarvisSentinels } from '@/hooks/useJarvisSentinels';
import { useJarvisFuturesPositions } from '@/hooks/useJarvisFuturesPositions';
import { useJarvisAIAdvisor } from '@/hooks/useJarvisAIAdvisor';
import { useJarvisSettings } from '@/hooks/useJarvisSettings';
import { useEmergencyKillSwitch } from '@/hooks/useEmergencyKillSwitch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const COLLAPSED_KEY = 'jarvis-dashboard-collapsed';

export function JarvisEngineDashboard() {
  const [symbol] = useState('BTCUSDT');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    return saved === 'true';
  });
  
  const { regime, adaptiveTarget, isLoading: regimeLoading } = useJarvisRegime(symbol);
  const { rate, liquidation, alerts } = useJarvisSentinels();
  const { longPosition, shortPosition, marginBalance, availableBalance, refetch } = useJarvisFuturesPositions();
  const { suggestions, currentAnalysis, isLoading: advisorLoading } = useJarvisAIAdvisor(symbol);
  const { settings, updateSettings, isSaving } = useJarvisSettings();
  
  const currentPnL = (longPosition?.unrealizedProfit ?? 0) + (shortPosition?.unrealizedProfit ?? 0);
  const { triggerKill, isKilling } = useEmergencyKillSwitch({ currentPnL });

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Quick settings state
  const [quickSettings, setQuickSettings] = useState({
    target_bull_profit: settings?.target_bull_profit ?? 2.10,
    target_bear_profit: settings?.target_bear_profit ?? 2.10,
  });

  const handleQuickSettingsSave = async () => {
    try {
      await updateSettings({
        target_bull_profit: quickSettings.target_bull_profit,
        target_bear_profit: quickSettings.target_bear_profit,
      });
      toast.success('Settings saved');
      setSettingsOpen(false);
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const getRegimeIcon = () => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="h-3 w-3" />;
      case 'BEAR': return <TrendingDown className="h-3 w-3" />;
      default: return <Minus className="h-3 w-3" />;
    }
  };

  const getRegimeColor = () => {
    switch (regime) {
      case 'BULL': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case 'BEAR': return 'bg-red-500/20 text-red-400 border-red-500/50';
      default: return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    }
  };

  // Collapsed mini-mode (40px)
  if (isCollapsed) {
    return (
      <Card className="bg-slate-950 border-slate-800 font-mono text-xs h-10 flex items-center px-3 gap-3">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-slate-300 font-semibold text-[11px]">JARVIS</span>
        
        <Badge variant="outline" className={cn("text-[9px] h-4 border px-1", getRegimeColor())}>
          {getRegimeIcon()}
          <span className="ml-0.5">{regime}</span>
        </Badge>
        
        <div className="h-4 w-px bg-slate-700" />
        
        <span className="text-slate-500 text-[10px]">P&L:</span>
        <span className={cn("text-[11px] font-bold", currentPnL >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}
        </span>
        
        <div className="h-4 w-px bg-slate-700" />
        
        <span className="text-slate-500 text-[10px]">M:</span>
        <span className="text-slate-300 text-[10px]">${marginBalance?.toFixed(0) ?? '---'}</span>
        
        <span className="text-slate-500 text-[10px] ml-1">A:</span>
        <span className="text-slate-300 text-[10px]">${availableBalance?.toFixed(0) ?? '---'}</span>
        
        <div className="flex-1" />
        
        <Button variant="ghost" size="sm" onClick={refetch} className="h-5 w-5 p-0 text-slate-400">
          <RefreshCw className="h-3 w-3" />
        </Button>
        
        <Button 
          variant="destructive" 
          size="sm"
          className="h-5 px-2 text-[9px] bg-red-600 hover:bg-red-700"
          onClick={() => triggerKill('manual')}
          disabled={isKilling}
        >
          <StopCircle className="h-2.5 w-2.5 mr-0.5" />
          KILL
        </Button>
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-5 w-5 p-0 text-slate-400"
          onClick={() => setIsCollapsed(false)}
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
      </Card>
    );
  }

  // Full expanded mode
  return (
    <Card className="bg-slate-950 border-slate-800 font-mono text-xs overflow-hidden relative">
      {/* Compact Header */}
      <div className="border-b border-slate-800 px-3 py-1.5 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-300 font-semibold text-[11px]">JARVIS 24/7</span>
          <Badge variant="outline" className={cn("text-[9px] h-4 border px-1", getRegimeColor())}>
            {getRegimeIcon()}
            <span className="ml-0.5">{regime}</span>
          </Badge>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Balance Strip */}
          <div className="flex items-center gap-2 text-[10px] mr-2">
            <span className="text-slate-500">M:</span>
            <span className="text-slate-300">${marginBalance?.toFixed(0) ?? '---'}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">A:</span>
            <span className="text-slate-300">${availableBalance?.toFixed(0) ?? '---'}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">P&L:</span>
            <span className={cn(currentPnL >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {currentPnL >= 0 ? '+' : ''}{currentPnL.toFixed(2)}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Target:</span>
            <span className="text-cyan-400">${adaptiveTarget.toFixed(2)}</span>
          </div>
          
          {/* Quick Settings */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("h-5 w-5 p-0 text-slate-400", settingsOpen && "bg-slate-800")}>
                <Settings className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="absolute right-3 top-8 z-50 w-56 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-slate-200">Quick Settings</span>
                <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={() => setSettingsOpen(false)}>
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
              
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] text-slate-400">BULL Target</Label>
                    <span className="text-[9px] text-emerald-400">${quickSettings.target_bull_profit.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[quickSettings.target_bull_profit]}
                    onValueChange={([v]) => setQuickSettings(s => ({ ...s, target_bull_profit: v }))}
                    min={0.5}
                    max={5.0}
                    step={0.10}
                    className="w-full"
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[9px] text-slate-400">BEAR Target</Label>
                    <span className="text-[9px] text-red-400">${quickSettings.target_bear_profit.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[quickSettings.target_bear_profit]}
                    onValueChange={([v]) => setQuickSettings(s => ({ ...s, target_bear_profit: v }))}
                    min={0.5}
                    max={5.0}
                    step={0.10}
                    className="w-full"
                  />
                </div>
                
                <Button 
                  size="sm" 
                  className="w-full h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleQuickSettingsSave}
                  disabled={isSaving}
                >
                  <Save className="h-2.5 w-2.5 mr-1" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          <Button variant="ghost" size="sm" onClick={refetch} className="h-5 w-5 p-0 text-slate-400">
            <RefreshCw className="h-3 w-3" />
          </Button>
          
          <Button 
            variant="destructive" 
            size="sm"
            className="h-5 px-2 text-[9px] bg-red-600 hover:bg-red-700"
            onClick={() => triggerKill('manual')}
            disabled={isKilling}
          >
            <StopCircle className="h-2.5 w-2.5 mr-0.5" />
            KILL
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-5 w-5 p-0 text-slate-400"
            onClick={() => setIsCollapsed(true)}
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Compact Content */}
      <div className="p-2 grid grid-cols-12 gap-2">
        {/* Positions - Side by side */}
        <div className="col-span-5 flex gap-2">
          {/* LONG */}
          <div className="flex-1 bg-slate-900/50 rounded p-1.5 border border-slate-800">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
              <span className="text-emerald-400 text-[9px] font-semibold">LONG</span>
              {longPosition && (
                <Badge variant="outline" className="text-[8px] h-3 px-1 border-slate-700">{longPosition.leverage}x</Badge>
              )}
            </div>
            {longPosition ? (
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-500">Entry:</span>
                  <span className="text-slate-300">${longPosition.entryPrice.toFixed(0)}</span>
                </div>
                <div className={cn("text-[10px] font-bold", longPosition.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {longPosition.unrealizedProfit >= 0 ? '+' : ''}${longPosition.unrealizedProfit.toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <Progress value={Math.min(100, (100 - longPosition.liquidationDistance))} className="h-1 flex-1 bg-slate-800" />
                  <span className="text-[8px] text-slate-500">{longPosition.liquidationDistance.toFixed(0)}%</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-600 text-[9px]">No position</div>
            )}
          </div>
          
          {/* SHORT */}
          <div className="flex-1 bg-slate-900/50 rounded p-1.5 border border-slate-800">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="h-2.5 w-2.5 text-red-400" />
              <span className="text-red-400 text-[9px] font-semibold">SHORT</span>
              {shortPosition && (
                <Badge variant="outline" className="text-[8px] h-3 px-1 border-slate-700">{shortPosition.leverage}x</Badge>
              )}
            </div>
            {shortPosition ? (
              <div className="space-y-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-500">Entry:</span>
                  <span className="text-slate-300">${shortPosition.entryPrice.toFixed(0)}</span>
                </div>
                <div className={cn("text-[10px] font-bold", shortPosition.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {shortPosition.unrealizedProfit >= 0 ? '+' : ''}${shortPosition.unrealizedProfit.toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <Progress value={Math.min(100, (100 - shortPosition.liquidationDistance))} className="h-1 flex-1 bg-slate-800" />
                  <span className="text-[8px] text-slate-500">{shortPosition.liquidationDistance.toFixed(0)}%</span>
                </div>
              </div>
            ) : (
              <div className="text-slate-600 text-[9px]">No position</div>
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="col-span-7 flex items-center gap-2">
          {/* API Load */}
          <div className="bg-slate-900/50 rounded p-1.5 border border-slate-800 flex-1">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Zap className="h-2 w-2" />
              API
            </div>
            <div className="flex items-center gap-1">
              <span className={cn(
                "text-[10px] font-bold",
                rate.load < 50 ? 'text-emerald-400' : rate.load < 80 ? 'text-amber-400' : 'text-red-400'
              )}>
                {rate.load.toFixed(0)}%
              </span>
              <Progress value={rate.load} className="h-1 flex-1 bg-slate-800" />
            </div>
          </div>
          
          {/* Liq Status */}
          <div className="bg-slate-900/50 rounded p-1.5 border border-slate-800 flex-1">
            <div className="flex items-center gap-1 text-[8px] text-slate-500 mb-0.5">
              <Shield className="h-2 w-2" />
              LIQ
            </div>
            <div className="flex items-center gap-1">
              <span className={cn(
                "text-[10px] font-bold",
                liquidation.alertLevel === 'safe' ? 'text-emerald-400' :
                liquidation.alertLevel === 'warning' ? 'text-amber-400' : 'text-red-400'
              )}>
                {liquidation.minDistance.toFixed(0)}%
              </span>
              <Badge variant="outline" className={cn(
                "text-[7px] h-3 px-1",
                liquidation.alertLevel === 'safe' ? 'border-emerald-500/50 text-emerald-400' :
                liquidation.alertLevel === 'warning' ? 'border-amber-500/50 text-amber-400' : 
                'border-red-500/50 text-red-400'
              )}>
                {liquidation.alertLevel.toUpperCase()}
              </Badge>
            </div>
          </div>
          
          {/* AI Advisor Mini */}
          <div className="bg-slate-900/50 rounded p-1.5 border border-slate-800 flex-[2]">
            <div className="flex items-center gap-1 text-[8px] text-cyan-400 mb-0.5">
              <Brain className="h-2 w-2" />
              AI
            </div>
            <div className="text-slate-400 text-[9px] line-clamp-1">
              {advisorLoading ? 'Analyzing...' : (suggestions[0]?.message || currentAnalysis || 'Monitoring...')}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Footer - Only if alerts exist */}
      {alerts.length > 0 && (
        <div className="border-t border-slate-800 px-2 py-1 bg-slate-900/30">
          <div className="flex items-center gap-1 text-[9px]">
            <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
            <span className="text-slate-400 truncate">{alerts[alerts.length - 1]?.message}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
