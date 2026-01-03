// ============================================
// BotCardControls - Start/Stop, Action Buttons
// Presentation-only component with callbacks
// ============================================

import { Button } from '@/components/ui/button';
import { Play, Square, Loader2, Zap, OctagonX, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BotCardControlsProps {
  isRunning: boolean;
  isStopping: boolean;
  isExecutingTrade: boolean;
  currentPnL: number;
  mode: 'demo' | 'live';
  onStart: () => void;
  onStop: () => void;
  onEmergencyStop: () => void;
  onExecuteTrade?: () => void;
  onWithdrawProfits?: () => void;
}

export function BotCardControls({
  isRunning,
  isStopping,
  isExecutingTrade,
  currentPnL,
  mode,
  onStart,
  onStop,
  onEmergencyStop,
  onExecuteTrade,
  onWithdrawProfits,
}: BotCardControlsProps) {
  const handleStartStop = () => {
    if (isRunning) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <div className="flex gap-2 mt-auto flex-shrink-0 pt-3 border-t border-border/30">
      {/* Main Start/Stop Button */}
      <Button
        className={cn(
          'flex-1 gap-2',
          isRunning && !isStopping ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'
        )}
        onClick={handleStartStop}
        disabled={isStopping}
      >
        {isStopping ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Stopping...
          </>
        ) : isRunning ? (
          <>
            <Square className="w-4 h-4" />
            Stop
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Start
          </>
        )}
      </Button>

      {/* Emergency Kill Button */}
      {isRunning && (
        <Button
          variant="destructive"
          size="icon"
          onClick={onEmergencyStop}
          title="Emergency Stop - Force kill all trading"
          className="bg-destructive hover:bg-destructive/90"
        >
          <OctagonX className="w-4 h-4" />
        </Button>
      )}

      {/* Manual Trade Button (Live mode) */}
      {isRunning && mode === 'live' && !isStopping && onExecuteTrade && (
        <Button
          variant="outline"
          className="gap-1"
          onClick={onExecuteTrade}
          disabled={isExecutingTrade}
        >
          {isExecutingTrade ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Zap className="w-3 h-3" />
          )}
          Trade
        </Button>
      )}

      {/* Withdraw Profits Button */}
      {currentPnL > 0 && !isStopping && onWithdrawProfits && (
        <Button 
          variant="outline" 
          className="gap-1" 
          onClick={onWithdrawProfits}
        >
          <Banknote className="w-3 h-3" />
          ${currentPnL.toFixed(2)}
        </Button>
      )}
    </div>
  );
}
