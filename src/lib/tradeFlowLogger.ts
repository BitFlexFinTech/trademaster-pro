/**
 * Trade Flow Logger
 * Structured logging for trade execution phases
 */

interface TradeFlowEvent {
  timestamp: number;
  phase: 'SCAN' | 'ANALYZE' | 'QUALIFY' | 'EXECUTE' | 'CONFIRM' | 'COMPLETE' | 'ERROR';
  data: Record<string, unknown>;
  durationMs: number;
}

class TradeFlowLogger {
  private currentFlow: TradeFlowEvent[] = [];
  private flowStartTime: number = 0;
  private currentFlowId: string = '';
  private verboseEnabled: boolean = false;

  constructor() {
    // Check localStorage for verbose setting
    if (typeof window !== 'undefined') {
      this.verboseEnabled = localStorage.getItem('verbose_trade_logging') === 'true';
    }
  }

  setVerbose(enabled: boolean) {
    this.verboseEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('verbose_trade_logging', String(enabled));
    }
  }

  isVerbose() {
    return this.verboseEnabled;
  }

  startFlow(tradeId: string) {
    this.currentFlow = [];
    this.flowStartTime = Date.now();
    this.currentFlowId = tradeId;
    this.log('SCAN', { tradeId, message: 'Trade flow started' });
  }

  log(phase: TradeFlowEvent['phase'], data: Record<string, unknown>) {
    const event: TradeFlowEvent = {
      timestamp: Date.now(),
      phase,
      data,
      durationMs: Date.now() - this.flowStartTime,
    };
    this.currentFlow.push(event);
    
    const emoji: Record<TradeFlowEvent['phase'], string> = {
      SCAN: '🔍',
      ANALYZE: '📊',
      QUALIFY: '✅',
      EXECUTE: '⚡',
      CONFIRM: '📝',
      COMPLETE: '🎉',
      ERROR: '❌',
    };
    
    const style = phase === 'ERROR' 
      ? 'color: #ff6b6b; font-weight: bold'
      : phase === 'COMPLETE'
      ? 'color: #51cf66; font-weight: bold'
      : 'color: #74c0fc';

    // Always log EXECUTE, COMPLETE, and ERROR phases
    // Only log others if verbose is enabled
    const shouldLog = this.verboseEnabled || 
      phase === 'EXECUTE' || 
      phase === 'COMPLETE' || 
      phase === 'ERROR';

    if (shouldLog) {
      console.log(
        `%c${emoji[phase]} [TradeFlow/${phase}] +${event.durationMs}ms`,
        style,
        data
      );
    }
  }

  getFlow() {
    return [...this.currentFlow];
  }

  getCurrentFlowId() {
    return this.currentFlowId;
  }

  getTotalDuration() {
    return Date.now() - this.flowStartTime;
  }

  getSummary() {
    return {
      flowId: this.currentFlowId,
      totalDuration: this.getTotalDuration(),
      phases: this.currentFlow.map(e => e.phase),
      hasError: this.currentFlow.some(e => e.phase === 'ERROR'),
    };
  }
}

export const tradeFlowLogger = new TradeFlowLogger();
