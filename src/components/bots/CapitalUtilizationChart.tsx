/**
 * Capital Utilization Chart
 * Time-series area chart showing idle vs deployed capital
 * Connected to Zustand store for persistent history
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBotStore } from '@/stores/botStore';
import { CARD_SIZES } from '@/lib/cardSizes';

interface CapitalUtilizationChartProps {
  className?: string;
}

export function CapitalUtilizationChart({ className }: CapitalUtilizationChartProps) {
  // Get data from Zustand store - single source of truth
  const capitalMetrics = useBotStore(state => state.capitalMetrics);
  const capitalHistory = useBotStore(state => state.capitalHistory);
  const idleStartTime = useBotStore(state => state.idleStartTime);
  
  const { totalCapital, deployedCapital, idleFunds, utilization } = capitalMetrics;
  
  // Format history for chart
  const chartData = capitalHistory.length > 0 
    ? capitalHistory.map(point => ({
        time: new Date(point.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        deployed: point.deployed,
        idle: point.idle,
      }))
    : [{ time: 'Now', deployed: deployedCapital, idle: idleFunds }];

  // Check if idle funds are at risk
  const idleDurationMs = idleStartTime ? Date.now() - idleStartTime : 0;
  const isIdleWarning = idleDurationMs > 60000; // Warning after 1 minute

  // If no capital data, show placeholder
  if (totalCapital === 0) {
    return (
      <Card 
        className={cn("bg-card/50 border-border/30", className)}
        style={{ 
          width: CARD_SIZES.capitalUtilization.width, 
          height: CARD_SIZES.capitalUtilization.height,
          minWidth: '280px'
        }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Capital Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[140px] flex items-center justify-center text-muted-foreground text-sm">
            No capital data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn("bg-card/50 border-border/30 overflow-hidden", className)} 
      style={{ 
        width: CARD_SIZES.capitalUtilization.width, 
        height: CARD_SIZES.capitalUtilization.height,
        minWidth: '280px'
      }}
    >
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Capital Utilization
          </CardTitle>
          <div className="flex items-center gap-1">
            {isIdleWarning && (
              <Badge variant="destructive" className="text-[10px] h-5 animate-pulse">
                <AlertTriangle className="w-3 h-3 mr-0.5" />
                Idle
              </Badge>
            )}
            <Badge 
              variant={utilization >= 80 ? "default" : utilization >= 50 ? "secondary" : "destructive"}
              className="text-xs"
            >
              {utilization.toFixed(0)}%
            </Badge>
          </div>
        </div>
        
        {/* Summary Stats */}
        <div className="flex items-center gap-3 mt-1 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Deployed:</span>
            <span className="font-mono font-medium">${deployedCapital.toFixed(0)}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Idle:</span>
            <span className={cn(
              "font-mono font-medium",
              isIdleWarning && "text-destructive"
            )}>
              ${idleFunds.toFixed(0)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            <span className="font-mono font-medium">${totalCapital.toFixed(0)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="deployedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="idleGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(45, 93%, 47%)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val}`}
                width={45}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(2)}`,
                  name === 'deployed' ? 'Deployed' : 'Idle'
                ]}
              />
              <Area
                type="monotone"
                dataKey="deployed"
                stackId="1"
                stroke="hsl(var(--primary))"
                fill="url(#deployedGradient)"
                strokeWidth={2}
                name="Deployed"
              />
              <Area
                type="monotone"
                dataKey="idle"
                stackId="1"
                stroke="hsl(45, 93%, 47%)"
                fill="url(#idleGradient)"
                strokeWidth={2}
                name="Idle"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* History indicator */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
          <span>{capitalHistory.length} data points</span>
          <span>Updates every minute</span>
        </div>
      </CardContent>
    </Card>
  );
}
