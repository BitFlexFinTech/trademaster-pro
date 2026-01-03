/**
 * Scanner Stats Widget
 * Shows real-time scanner activity with animated scanning indicator
 * Connected to Zustand store for instant updates
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Radar, Check, X, Clock, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBotStore } from '@/stores/botStore';
import { CARD_SIZES } from '@/lib/cardSizes';

interface ScannerStatsWidgetProps {
  className?: string;
}

export function ScannerStatsWidget({ className }: ScannerStatsWidgetProps) {
  // Get data from Zustand store - single source of truth
  const marketData = useBotStore(state => state.marketData);
  const opportunities = useBotStore(state => state.opportunities);
  
  const isScanning = marketData.isScanning;
  const pairsScanned = marketData.pairsScanned;
  const opportunityCount = opportunities.length;
  
  // Calculate rejections (simulated based on scan activity)
  const rejectionsLast5Min = Math.max(0, pairsScanned - opportunityCount);
  const symbolsActive = Object.keys(marketData.prices).length || pairsScanned;
  
  const totalDecisions = opportunityCount + rejectionsLast5Min;
  const qualificationRate = totalDecisions > 0 ? (opportunityCount / totalDecisions) * 100 : 0;

  // Top opportunities from store
  const topOpportunities = opportunities.slice(0, 3).map(opp => ({
    symbol: opp.symbol.replace('/USDT', '').replace('USDT', ''),
    confidence: opp.confidence,
    expectedDuration: Math.round(opp.expectedDurationMs / 1000),
  }));

  return (
    <Card 
      className={cn("bg-card/50 border-border/30 overflow-hidden", className)}
      style={{ 
        width: CARD_SIZES.marketScanner.width, 
        height: CARD_SIZES.marketScanner.height,
        minWidth: '280px'
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {/* Animated Scanner Indicator */}
            <div className="relative w-6 h-6">
              {/* Outer ping animation */}
              {isScanning && (
                <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />
              )}
              {/* Rotating radar sweep */}
              {isScanning && (
                <div 
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{ 
                    background: `conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary)) 30deg, transparent 60deg)`,
                    animationDuration: '2s'
                  }}
                />
              )}
              {/* Center icon */}
              <Radar className={cn(
                "w-6 h-6 relative z-10",
                isScanning ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            Market Scanner
          </CardTitle>
          <Badge 
            variant={isScanning ? "default" : "secondary"}
            className="text-xs"
          >
            {isScanning ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                Scanning
              </span>
            ) : 'Idle'}
          </Badge>
        </div>
        
        {/* Live Pair Counter */}
        {isScanning && (
          <div className="flex items-center gap-1.5 text-xs mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="font-mono tabular-nums text-primary font-medium">
              {pairsScanned}
            </span>
            <span className="text-muted-foreground">pairs scanned</span>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-primary/10 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Check className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-muted-foreground">Qualified</span>
            </div>
            <span className="text-base font-bold font-mono text-primary">{opportunityCount}</span>
          </div>
          
          <div className="text-center p-2 bg-destructive/10 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <X className="w-3 h-3 text-destructive" />
              <span className="text-[10px] text-muted-foreground">Rejected</span>
            </div>
            <span className="text-base font-bold font-mono text-destructive">{rejectionsLast5Min}</span>
          </div>
          
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Zap className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Symbols</span>
            </div>
            <span className="text-base font-bold font-mono">{symbolsActive}</span>
          </div>
        </div>

        {/* Qualification Rate */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Qualification Rate</span>
            <span className={cn(
              "font-mono font-medium",
              qualificationRate >= 10 ? "text-primary" : qualificationRate >= 5 ? "text-amber-500" : "text-destructive"
            )}>
              {qualificationRate.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={qualificationRate} 
            className="h-1.5"
          />
        </div>

        {/* Top Qualified Opportunities */}
        {topOpportunities.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Ready to Trade
            </div>
            <div className="space-y-1">
              {topOpportunities.map((opp, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between text-xs bg-primary/5 rounded px-2 py-1"
                >
                  <span className="font-medium">{opp.symbol}/USDT</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {opp.expectedDuration}s
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4">
                      {(opp.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Opportunities State */}
        {opportunityCount === 0 && isScanning && (
          <div className="text-center py-1 text-xs text-muted-foreground">
            <p>Scanning for fast trade opportunities...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
