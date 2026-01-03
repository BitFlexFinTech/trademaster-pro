/**
 * Trade Flow Diagram
 * Visual flowchart showing trade execution path in real-time
 * From opportunity detection → direction decision → execution → profit close
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useBotStore } from '@/stores/botStore';
import { 
  Search, 
  Brain, 
  TrendingUp, 
  Play, 
  Eye, 
  CheckCircle,
  ChevronRight,
  Loader2
} from 'lucide-react';

interface TradeFlowStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'active' | 'complete' | 'error';
  detail?: string;
}

interface TradeFlowDiagramProps {
  className?: string;
}

export function TradeFlowDiagram({ className }: TradeFlowDiagramProps) {
  const isTrading = useBotStore(state => state.isTrading);
  const marketData = useBotStore(state => state.marketData);
  const opportunities = useBotStore(state => state.opportunities);
  const positions = useBotStore(state => state.positions);
  const executionMetrics = useBotStore(state => state.executionMetrics);
  
  const openPositions = positions; // All positions in store are open by definition
  const profitablePositions = openPositions.filter(p => (p.unrealizedPnL || 0) > 0);
  
  // Determine step statuses based on current state
  const getSteps = (): TradeFlowStep[] => {
    const isScanning = marketData.isScanning;
    const hasOpportunities = opportunities.length > 0;
    const hasPositions = openPositions.length > 0;
    const hasProfit = profitablePositions.length > 0;
    
    return [
      {
        id: 'scan',
        label: 'Scan',
        icon: <Search className="w-3 h-3" />,
        status: isScanning ? 'active' : (isTrading ? 'complete' : 'pending'),
        detail: isScanning ? `${marketData.pairsScanned} pairs` : undefined,
      },
      {
        id: 'analyze',
        label: 'Analyze',
        icon: <Brain className="w-3 h-3" />,
        status: hasOpportunities ? 'complete' : (isScanning ? 'active' : 'pending'),
        detail: hasOpportunities ? `${opportunities.length} found` : undefined,
      },
      {
        id: 'decide',
        label: 'Decide',
        icon: <TrendingUp className="w-3 h-3" />,
        status: hasOpportunities ? 'active' : 'pending',
        detail: hasOpportunities ? opportunities[0]?.direction : undefined,
      },
      {
        id: 'execute',
        label: 'Execute',
        icon: <Play className="w-3 h-3" />,
        status: hasPositions ? 'complete' : (hasOpportunities ? 'active' : 'pending'),
        detail: hasPositions ? `${executionMetrics.avgExecutionTimeMs}ms` : undefined,
      },
      {
        id: 'monitor',
        label: 'Monitor',
        icon: <Eye className="w-3 h-3" />,
        status: hasPositions ? 'active' : 'pending',
        detail: hasPositions ? `${openPositions.length} open` : undefined,
      },
      {
        id: 'close',
        label: 'Close',
        icon: <CheckCircle className="w-3 h-3" />,
        status: hasProfit ? 'active' : 'pending',
        detail: hasProfit ? `${profitablePositions.length} ready` : undefined,
      },
    ];
  };
  
  const steps = getSteps();
  
  const getStatusColor = (status: TradeFlowStep['status']) => {
    switch (status) {
      case 'active': return 'bg-primary text-primary-foreground';
      case 'complete': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'error': return 'bg-destructive/20 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground border-border/50';
    }
  };
  
  return (
    <Card className={cn("bg-card/50 border-border/30", className)}>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs font-medium flex items-center justify-between">
          <span>Trade Flow</span>
          {isTrading && (
            <Badge variant="outline" className="text-[10px] h-4 gap-1">
              <Loader2 className="w-2 h-2 animate-spin" />
              Live
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="px-3 pb-3">
        <div className="flex items-center justify-between gap-1">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              {/* Step Node */}
              <div className="flex flex-col items-center gap-1">
                <div 
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
                    getStatusColor(step.status),
                    step.status === 'active' && "animate-pulse ring-2 ring-primary/30"
                  )}
                >
                  {step.status === 'active' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground font-medium">
                  {step.label}
                </span>
                {step.detail && (
                  <span className="text-[8px] text-primary font-mono">
                    {step.detail}
                  </span>
                )}
              </div>
              
              {/* Connector Arrow */}
              {index < steps.length - 1 && (
                <ChevronRight 
                  className={cn(
                    "w-3 h-3 mx-0.5 flex-shrink-0",
                    step.status === 'complete' || step.status === 'active'
                      ? "text-primary"
                      : "text-muted-foreground/30"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
