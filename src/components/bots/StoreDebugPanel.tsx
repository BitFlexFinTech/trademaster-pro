/**
 * Store Debug Panel
 * Dev-only component for monitoring Zustand store state in real-time
 */

import { useState, useEffect } from 'react';
import { useBotStore } from '@/stores/botStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Bug, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Activity, 
  Database,
  Zap,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function StoreDebugPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastRenderTime, setLastRenderTime] = useState(Date.now());
  
  // Subscribe to store state
  const bots = useBotStore(state => state.bots);
  const positions = useBotStore(state => state.positions);
  const opportunities = useBotStore(state => state.opportunities);
  const capitalMetrics = useBotStore(state => state.capitalMetrics);
  const executionMetrics = useBotStore(state => state.executionMetrics);
  const marketData = useBotStore(state => state.marketData);
  const isTrading = useBotStore(state => state.isTrading);
  const isSyncing = useBotStore(state => state.isSyncing);
  const lastSyncTime = useBotStore(state => state.lastSyncTime);
  const deploymentQueue = useBotStore(state => state.deploymentQueue);
  const capitalHistory = useBotStore(state => state.capitalHistory);
  const idleStartTime = useBotStore(state => state.idleStartTime);
  
  // Track render frequency
  useEffect(() => {
    setLastRenderTime(Date.now());
  }, [bots, positions, opportunities, capitalMetrics, isTrading, lastSyncTime]);
  
  const msSinceSync = lastSyncTime ? Date.now() - lastSyncTime : -1;
  const msSinceRender = Date.now() - lastRenderTime;
  
  // Only render in development
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={cn(
        "bg-slate-950 border border-slate-700 rounded-lg shadow-xl transition-all duration-200",
        isExpanded ? "w-80" : "w-auto"
      )}>
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-slate-900 rounded-t-lg"
        >
          <Bug className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-mono text-slate-300">Store Debug</span>
          <div className="flex-1" />
          <Badge variant={isTrading ? "default" : "secondary"} className="text-[10px] h-4">
            {isTrading ? 'TRADING' : 'IDLE'}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          )}
        </button>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-3 border-t border-slate-800 space-y-3 max-h-96 overflow-y-auto">
            {/* Sync Status */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
                Sync Status
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900 rounded px-2 py-1">
                  <span className="text-slate-500">Last Sync: </span>
                  <span className="font-mono text-cyan-400">
                    {msSinceSync >= 0 ? `${msSinceSync}ms` : 'Never'}
                  </span>
                </div>
                <div className="bg-slate-900 rounded px-2 py-1">
                  <span className="text-slate-500">Render: </span>
                  <span className="font-mono text-green-400">
                    {msSinceRender}ms ago
                  </span>
                </div>
              </div>
            </div>

            {/* Bots */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Activity className="w-3 h-3" />
                Bots
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  Total: {bots.length}
                </Badge>
                <Badge variant="default" className="text-[10px]">
                  Running: {bots.filter(b => b.status === 'running').length}
                </Badge>
              </div>
            </div>

            {/* Positions */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Database className="w-3 h-3" />
                Positions
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  Open: {positions.length}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  Queue: {deploymentQueue.length}
                </Badge>
              </div>
              {positions.length > 0 && (
                <div className="text-[10px] text-slate-500 font-mono">
                  {positions.map(p => p.symbol).slice(0, 3).join(', ')}
                  {positions.length > 3 && ` +${positions.length - 3} more`}
                </div>
              )}
            </div>

            {/* Capital */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <DollarSign className="w-3 h-3" />
                Capital
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="bg-slate-900 rounded px-2 py-1 flex justify-between">
                  <span className="text-slate-500">Total:</span>
                  <span className="font-mono text-white">${capitalMetrics.totalCapital.toFixed(2)}</span>
                </div>
                <div className="bg-slate-900 rounded px-2 py-1 flex justify-between">
                  <span className="text-slate-500">Deployed:</span>
                  <span className="font-mono text-green-400">${capitalMetrics.deployedCapital.toFixed(2)}</span>
                </div>
                <div className="bg-slate-900 rounded px-2 py-1 flex justify-between">
                  <span className="text-slate-500">Idle:</span>
                  <span className={cn(
                    "font-mono",
                    capitalMetrics.idleFunds > 100 ? "text-amber-400" : "text-slate-400"
                  )}>
                    ${capitalMetrics.idleFunds.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-900 rounded px-2 py-1 flex justify-between">
                  <span className="text-slate-500">Util:</span>
                  <span className="font-mono text-cyan-400">{capitalMetrics.utilization.toFixed(1)}%</span>
                </div>
              </div>
              {idleStartTime && (
                <div className="text-[10px] text-amber-500">
                  ⚠️ Idle for {Math.floor((Date.now() - idleStartTime) / 60000)} min
                </div>
              )}
            </div>

            {/* Opportunities */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <Zap className="w-3 h-3" />
                Scanner
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge 
                  variant={marketData.isScanning ? "default" : "secondary"} 
                  className="text-[10px]"
                >
                  {marketData.isScanning ? 'Scanning' : 'Idle'}
                </Badge>
                <span className="text-slate-500 text-[10px]">
                  {marketData.pairsScanned} pairs | {opportunities.length} opps
                </span>
              </div>
            </div>

            {/* Execution Metrics */}
            <div className="space-y-1">
              <div className="text-[10px] text-slate-400">Execution</div>
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div className="bg-slate-900 rounded px-1.5 py-0.5 text-center">
                  <div className="text-slate-500">Avg</div>
                  <div className="font-mono text-white">{executionMetrics.avgExecutionTimeMs.toFixed(0)}ms</div>
                </div>
                <div className="bg-slate-900 rounded px-1.5 py-0.5 text-center">
                  <div className="text-slate-500">Rate</div>
                  <div className="font-mono text-white">{executionMetrics.successRate.toFixed(0)}%</div>
                </div>
                <div className="bg-slate-900 rounded px-1.5 py-0.5 text-center">
                  <div className="text-slate-500">Hist</div>
                  <div className="font-mono text-white">{capitalHistory.length}</div>
                </div>
              </div>
            </div>

            {/* Manual Sync Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => useBotStore.getState().syncAllData()}
              disabled={isSyncing}
              className="w-full h-7 text-xs gap-1"
            >
              <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
              Force Sync
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
