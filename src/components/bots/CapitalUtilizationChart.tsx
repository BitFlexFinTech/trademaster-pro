/**
 * Capital Utilization Chart
 * Time-series area chart showing idle vs deployed capital across exchanges
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CapitalDataPoint {
  timestamp: number;
  time: string;
  deployed: number;
  idle: number;
  total: number;
}

interface CapitalUtilizationChartProps {
  exchanges: Array<{
    exchange: string;
    total: number;
    deployed: number;
    idle: number;
    utilization: number;
  }>;
  className?: string;
}

export function CapitalUtilizationChart({ exchanges, className }: CapitalUtilizationChartProps) {
  const [history, setHistory] = useState<CapitalDataPoint[]>([]);
  
  // Calculate current totals
  const totalCapital = exchanges.reduce((sum, ex) => sum + ex.total, 0);
  const totalDeployed = exchanges.reduce((sum, ex) => sum + ex.deployed, 0);
  const totalIdle = exchanges.reduce((sum, ex) => sum + ex.idle, 0);
  const utilization = totalCapital > 0 ? (totalDeployed / totalCapital) * 100 : 0;

  // Record history every minute
  useEffect(() => {
    if (totalCapital === 0) return;

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });

    setHistory(prev => {
      const newPoint: CapitalDataPoint = {
        timestamp: now,
        time: timeStr,
        deployed: totalDeployed,
        idle: totalIdle,
        total: totalCapital,
      };

      // Keep last 60 data points (1 hour at 1-min intervals)
      const updated = [...prev, newPoint].slice(-60);
      return updated;
    });
  }, [totalCapital, totalDeployed, totalIdle]);

  // If no capital data, show placeholder
  if (totalCapital === 0) {
    return (
      <Card className={cn("bg-card/50 border-border/30", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Capital Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            No capital data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card/50 border-border/30", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Capital Utilization
          </CardTitle>
          <Badge 
            variant={utilization >= 80 ? "default" : utilization >= 50 ? "secondary" : "destructive"}
            className="text-xs"
          >
            {utilization.toFixed(0)}% Deployed
          </Badge>
        </div>
        
        {/* Summary Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Deployed:</span>
            <span className="font-mono font-medium">${totalDeployed.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Idle:</span>
            <span className="font-mono font-medium">${totalIdle.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Total:</span>
            <span className="font-mono font-medium">${totalCapital.toFixed(2)}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history.length > 0 ? history : [{ time: 'Now', deployed: totalDeployed, idle: totalIdle }]}>
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
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val}`}
                width={50}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number, name: string) => [
                  `$${value.toFixed(2)}`,
                  name === 'deployed' ? 'Deployed' : 'Idle'
                ]}
              />
              <Legend 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '10px' }}
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

        {/* Per-Exchange Breakdown */}
        {exchanges.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="text-xs text-muted-foreground mb-2">Per Exchange</div>
            <div className="grid grid-cols-2 gap-2">
              {exchanges.map((ex) => (
                <div key={ex.exchange} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                  <span className="font-medium truncate">{ex.exchange}</span>
                  <span className={cn(
                    "font-mono",
                    ex.utilization >= 80 ? "text-primary" : ex.utilization >= 50 ? "text-amber-500" : "text-destructive"
                  )}>
                    {ex.utilization.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
