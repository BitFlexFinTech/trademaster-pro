import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HourlyData {
  hour: number;
  pnl: number;
  trades: number;
  winRate: number;
}

interface TradingHoursHeatmapProps {
  data: HourlyData[];
}

export function TradingHoursHeatmap({ data }: TradingHoursHeatmapProps) {
  const { hourlyStats, bestHour, worstHour, recommendation } = useMemo(() => {
    // Fill in missing hours with zeros
    const filledData: HourlyData[] = Array.from({ length: 24 }, (_, hour) => {
      const existing = data.find(d => d.hour === hour);
      return existing || { hour, pnl: 0, trades: 0, winRate: 0 };
    });

    const withTrades = filledData.filter(d => d.trades > 0);
    const best = withTrades.length > 0 
      ? withTrades.reduce((a, b) => a.pnl > b.pnl ? a : b)
      : null;
    const worst = withTrades.length > 0
      ? withTrades.reduce((a, b) => a.pnl < b.pnl ? a : b)
      : null;

    // Generate recommendation
    let rec = '';
    if (best && worst && withTrades.length > 3) {
      if (best.winRate > 70) {
        rec = `${formatHour(best.hour)} shows ${best.winRate.toFixed(0)}% win rate - consider focusing here`;
      } else if (worst.pnl < 0 && worst.trades >= 3) {
        rec = `Avoid trading around ${formatHour(worst.hour)} - historically unprofitable`;
      }
    }

    return {
      hourlyStats: filledData,
      bestHour: best,
      worstHour: worst,
      recommendation: rec,
    };
  }, [data]);

  const maxPnL = Math.max(...hourlyStats.map(h => Math.abs(h.pnl)), 1);

  function formatHour(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}${period}`;
  }

  function getHeatmapColor(pnl: number, trades: number): string {
    if (trades === 0) return 'bg-muted/30';
    
    const intensity = Math.min(Math.abs(pnl) / maxPnL, 1);
    
    if (pnl >= 0) {
      if (intensity > 0.7) return 'bg-green-500';
      if (intensity > 0.4) return 'bg-green-500/70';
      if (intensity > 0.1) return 'bg-green-500/40';
      return 'bg-green-500/20';
    } else {
      if (intensity > 0.7) return 'bg-destructive';
      if (intensity > 0.4) return 'bg-destructive/70';
      if (intensity > 0.1) return 'bg-destructive/40';
      return 'bg-destructive/20';
    }
  }

  // Group hours into periods
  const periods = [
    { name: 'Night', hours: [0, 1, 2, 3, 4, 5], icon: '🌙' },
    { name: 'Morning', hours: [6, 7, 8, 9, 10, 11], icon: '☀️' },
    { name: 'Afternoon', hours: [12, 13, 14, 15, 16, 17], icon: '🌤️' },
    { name: 'Evening', hours: [18, 19, 20, 21, 22, 23], icon: '🌅' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Trading Hours Analysis</CardTitle>
            <CardDescription>Performance by time of day (UTC)</CardDescription>
          </div>
          {bestHour && (
            <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
              <Zap className="h-3 w-3 mr-1" />
              Best: {formatHour(bestHour.hour)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          {/* Heatmap Grid */}
          <div className="grid grid-cols-6 gap-1 mb-4">
            {hourlyStats.map((hour) => (
              <Tooltip key={hour.hour}>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      aspect-square rounded-sm flex items-center justify-center text-xs font-medium
                      cursor-pointer transition-all hover:scale-110 hover:z-10
                      ${getHeatmapColor(hour.pnl, hour.trades)}
                      ${hour.trades > 0 ? 'text-foreground' : 'text-muted-foreground/50'}
                    `}
                  >
                    {hour.hour}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <p className="font-medium">{formatHour(hour.hour)}</p>
                    {hour.trades > 0 ? (
                      <>
                        <p>P&L: <span className={hour.pnl >= 0 ? 'text-green-500' : 'text-destructive'}>${hour.pnl.toFixed(2)}</span></p>
                        <p>Win Rate: {hour.winRate.toFixed(0)}%</p>
                        <p>Trades: {hour.trades}</p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No trades</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Period Summary */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {periods.map((period) => {
              const periodStats = hourlyStats.filter(h => period.hours.includes(h.hour));
              const totalPnL = periodStats.reduce((sum, h) => sum + h.pnl, 0);
              const totalTrades = periodStats.reduce((sum, h) => sum + h.trades, 0);
              
              return (
                <div 
                  key={period.name}
                  className="text-center p-2 rounded-lg bg-muted/30"
                >
                  <div className="text-lg mb-0.5">{period.icon}</div>
                  <div className="text-xs font-medium">{period.name}</div>
                  <div className={`text-xs font-mono ${totalPnL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    ${totalPnL.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">{totalTrades} trades</div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-destructive" />
              <span>Loss</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-muted/30" />
              <span>No trades</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span>Profit</span>
            </div>
          </div>

          {/* Recommendation */}
          {recommendation && (
            <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20 text-xs flex items-start gap-2">
              <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{recommendation}</span>
            </div>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
