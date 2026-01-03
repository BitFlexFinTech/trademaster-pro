/**
 * Capital Efficiency Gauge
 * Visual gauge showing combined efficiency score with trend tracking
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Gauge, TrendingUp, TrendingDown, Minus, Clock, Zap, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBotStore } from '@/stores/botStore';
import { useMemo } from 'react';

export function CapitalEfficiencyGauge() {
  const capitalMetrics = useBotStore(state => state.capitalMetrics);
  const capitalHistory = useBotStore(state => state.capitalHistory);
  const executionMetrics = useBotStore(state => state.executionMetrics);
  const idleStartTime = useBotStore(state => state.idleStartTime);
  
  // Calculate efficiency metrics
  const efficiencyData = useMemo(() => {
    // Utilization rate (40% weight)
    const utilizationScore = Math.min(100, capitalMetrics.utilization);
    
    // Deployment speed (30% weight) - based on avg execution time
    // Target: < 500ms = 100, > 2000ms = 0
    const speedScore = Math.max(0, Math.min(100, 
      100 - ((executionMetrics.avgExecutionTimeMs - 500) / 15)
    ));
    
    // Idle time score (30% weight) - based on current idle duration
    // Target: 0 idle = 100, > 5 min = 0
    const idleDurationMs = idleStartTime ? Date.now() - idleStartTime : 0;
    const idleMinutes = idleDurationMs / 60000;
    const idleScore = Math.max(0, Math.min(100, 100 - (idleMinutes * 20)));
    
    // Combined score
    const score = Math.round(
      (utilizationScore * 0.4) + 
      (speedScore * 0.3) + 
      (idleScore * 0.3)
    );
    
    // Calculate trend from history
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (capitalHistory.length >= 5) {
      const recentAvg = capitalHistory.slice(-3).reduce((s, h) => s + h.utilization, 0) / 3;
      const olderAvg = capitalHistory.slice(-6, -3).reduce((s, h) => s + h.utilization, 0) / 3;
      const diff = recentAvg - olderAvg;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
    }
    
    return {
      score,
      utilizationScore: Math.round(utilizationScore),
      speedScore: Math.round(speedScore),
      idleScore: Math.round(idleScore),
      trend,
      idleMinutes: Math.round(idleMinutes),
    };
  }, [capitalMetrics, executionMetrics, idleStartTime, capitalHistory]);
  
  // Score color and label
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-cyan-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
  };
  
  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };
  
  const TrendIcon = efficiencyData.trend === 'improving' 
    ? TrendingUp 
    : efficiencyData.trend === 'declining' 
    ? TrendingDown 
    : Minus;
  
  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Capital Efficiency
          </CardTitle>
          <Badge 
            variant={efficiencyData.trend === 'improving' ? 'default' : 'secondary'}
            className="text-[10px] gap-1"
          >
            <TrendIcon className="w-3 h-3" />
            {efficiencyData.trend}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Score Gauge */}
        <div className="flex items-center justify-center py-2">
          <div className="relative">
            {/* Circular progress background */}
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-muted/30"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${efficiencyData.score * 2.51} 251`}
                strokeLinecap="round"
                className={cn(
                  "transition-all duration-500",
                  getScoreColor(efficiencyData.score)
                )}
              />
            </svg>
            {/* Center score */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn(
                "text-2xl font-bold font-mono",
                getScoreColor(efficiencyData.score)
              )}>
                {efficiencyData.score}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {getScoreLabel(efficiencyData.score)}
              </span>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          {/* Utilization */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Percent className="w-3 h-3" />
                Utilization
              </span>
              <span className="font-mono">{efficiencyData.utilizationScore}%</span>
            </div>
            <Progress value={efficiencyData.utilizationScore} className="h-1.5" />
          </div>
          
          {/* Deployment Speed */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Zap className="w-3 h-3" />
                Deploy Speed
              </span>
              <span className="font-mono">{efficiencyData.speedScore}%</span>
            </div>
            <Progress value={efficiencyData.speedScore} className="h-1.5" />
          </div>
          
          {/* Idle Time */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                Idle Score
              </span>
              <span className="font-mono">{efficiencyData.idleScore}%</span>
            </div>
            <Progress value={efficiencyData.idleScore} className="h-1.5" />
          </div>
        </div>

        {/* Idle Warning */}
        {efficiencyData.idleMinutes > 0 && (
          <div className="text-[10px] text-amber-500 text-center">
            Capital idle for {efficiencyData.idleMinutes} min
          </div>
        )}
      </CardContent>
    </Card>
  );
}
