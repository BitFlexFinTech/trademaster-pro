/**
 * Scanner Stats Widget
 * Shows real-time scanner activity including rejection reasons and qualified opportunities
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Radar, Check, X, Clock, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RejectionBreakdown {
  reason: string;
  count: number;
  percentage: number;
}

interface ScannerStatsWidgetProps {
  isScanning: boolean;
  opportunityCount: number;
  rejectionsLast5Min: number;
  symbolsActive: number;
  rejectionBreakdown?: RejectionBreakdown[];
  topOpportunities?: Array<{
    symbol: string;
    confidence: number;
    expectedDuration: number;
  }>;
  className?: string;
}

export function ScannerStatsWidget({
  isScanning,
  opportunityCount,
  rejectionsLast5Min,
  symbolsActive,
  rejectionBreakdown = [],
  topOpportunities = [],
  className,
}: ScannerStatsWidgetProps) {
  const totalDecisions = opportunityCount + rejectionsLast5Min;
  const qualificationRate = totalDecisions > 0 ? (opportunityCount / totalDecisions) * 100 : 0;

  // Fixed card dimensions from CARD_SIZES: 300px x 240px
  const cardStyle = { width: '300px', height: '240px', minWidth: '280px' };

  return (
    <Card 
      className={cn("bg-card/50 border-border/30 overflow-hidden", className)}
      style={cardStyle}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Radar className="w-4 h-4 text-primary" />
            Market Scanner
          </CardTitle>
          <Badge 
            variant={isScanning ? "default" : "secondary"}
            className={cn("text-xs", isScanning && "animate-pulse")}
          >
            {isScanning ? 'Scanning' : 'Idle'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 bg-primary/10 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Check className="w-3 h-3 text-primary" />
              <span className="text-xs text-muted-foreground">Qualified</span>
            </div>
            <span className="text-lg font-bold font-mono text-primary">{opportunityCount}</span>
          </div>
          
          <div className="text-center p-2 bg-destructive/10 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <X className="w-3 h-3 text-destructive" />
              <span className="text-xs text-muted-foreground">Rejected</span>
            </div>
            <span className="text-lg font-bold font-mono text-destructive">{rejectionsLast5Min}</span>
          </div>
          
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Symbols</span>
            </div>
            <span className="text-lg font-bold font-mono">{symbolsActive}</span>
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
          <p className="text-[10px] text-muted-foreground">
            Target: Select top 10% of signals for fast trades
          </p>
        </div>

        {/* Top Rejection Reasons */}
        {rejectionBreakdown.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Top Rejection Reasons</div>
            <div className="space-y-1.5">
              {rejectionBreakdown.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="truncate max-w-[150px]" title={item.reason}>
                        {item.reason}
                      </span>
                      <span className="text-muted-foreground font-mono ml-2">
                        {item.percentage.toFixed(0)}%
                      </span>
                    </div>
                    <Progress 
                      value={item.percentage} 
                      className="h-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Qualified Opportunities */}
        {topOpportunities.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Ready to Trade
            </div>
            <div className="space-y-1">
              {topOpportunities.slice(0, 3).map((opp, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between text-xs bg-primary/5 rounded px-2 py-1.5"
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
          <div className="text-center py-2 text-xs text-muted-foreground">
            <p>Scanning for fast trade opportunities...</p>
            <p className="text-[10px] mt-1">Only trades expected to close in &lt;5 min qualify</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
