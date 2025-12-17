/**
 * Trading State Machine
 * 
 * State transitions:
 * Idle → Qualified → Entered → ProfitLock → Exit → SpeedAdjust → AIAnalysis → SelfAudit → Dashboard
 */

export type TradingState = 
  | 'Idle' 
  | 'Qualified' 
  | 'Entered' 
  | 'ProfitLock' 
  | 'Exit' 
  | 'SpeedAdjust' 
  | 'AIAnalysis' 
  | 'SelfAudit' 
  | 'Dashboard';

export interface StateTransition {
  from: TradingState;
  to: TradingState;
  timestamp: number;
  reason: string;
  data?: Record<string, unknown>;
}

export interface QualifiedOpportunity {
  pair: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice?: number;
  projectedNetProfit: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  trailingStopPrice?: number;
  positionSize: number;
  exchange: string;
  fees: number;
  slippage: number;
}

export interface TradeCycleResult {
  success: boolean;
  opportunity: QualifiedOpportunity;
  actualNetProfit: number;
  exitReason: string;
  duration: number;
}

const VALID_TRANSITIONS: Record<TradingState, TradingState[]> = {
  'Idle': ['Qualified'],
  'Qualified': ['Entered', 'Idle'],
  'Entered': ['ProfitLock', 'Exit'],
  'ProfitLock': ['Exit'],
  'Exit': ['SpeedAdjust'],
  'SpeedAdjust': ['AIAnalysis'],
  'AIAnalysis': ['SelfAudit', 'Idle'],
  'SelfAudit': ['Dashboard'],
  'Dashboard': ['Idle'],
};

class TradingStateMachine {
  private state: TradingState = 'Idle';
  private transitions: StateTransition[] = [];
  private currentOpportunity: QualifiedOpportunity | null = null;
  private tradeCount: number = 0;
  private cycleStartTime: number = 0;

  /**
   * Get current state
   */
  getState(): TradingState {
    return this.state;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: TradingState): boolean {
    return VALID_TRANSITIONS[this.state]?.includes(to) ?? false;
  }

  /**
   * Transition to a new state
   */
  transition(to: TradingState, reason: string, data?: Record<string, unknown>): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[STATE MACHINE] Invalid transition: ${this.state} → ${to}`);
      return false;
    }

    const transition: StateTransition = {
      from: this.state,
      to,
      timestamp: Date.now(),
      reason,
      data,
    };

    this.transitions.push(transition);
    console.log(`[STATE] ${transition.from} → ${transition.to}: ${reason}`);
    this.state = to;

    return true;
  }

  /**
   * Force transition (for error recovery)
   */
  forceTransition(to: TradingState, reason: string): void {
    const transition: StateTransition = {
      from: this.state,
      to,
      timestamp: Date.now(),
      reason: `FORCED: ${reason}`,
    };
    
    this.transitions.push(transition);
    console.warn(`[STATE] FORCED: ${transition.from} → ${transition.to}: ${reason}`);
    this.state = to;
  }

  /**
   * Start qualification process
   */
  startQualification(opportunity: QualifiedOpportunity): boolean {
    if (this.state !== 'Idle') {
      console.warn(`[STATE MACHINE] Cannot qualify: not in Idle state (current: ${this.state})`);
      return false;
    }

    this.currentOpportunity = opportunity;
    this.cycleStartTime = Date.now();
    
    return this.transition('Qualified', `Opportunity: ${opportunity.pair} ${opportunity.side}`, {
      pair: opportunity.pair,
      side: opportunity.side,
      projectedNetProfit: opportunity.projectedNetProfit,
    });
  }

  /**
   * Enter position
   */
  enterPosition(): boolean {
    if (!this.currentOpportunity) return false;
    
    return this.transition('Entered', `Entry at ${this.currentOpportunity.entryPrice}`, {
      entryPrice: this.currentOpportunity.entryPrice,
      positionSize: this.currentOpportunity.positionSize,
    });
  }

  /**
   * Activate profit lock (trailing stop)
   */
  activateProfitLock(trailingStopPrice: number): boolean {
    if (!this.currentOpportunity) return false;
    
    this.currentOpportunity.trailingStopPrice = trailingStopPrice;
    
    return this.transition('ProfitLock', `Trailing stop at ${trailingStopPrice}`, {
      trailingStopPrice,
      takeProfitPrice: this.currentOpportunity.takeProfitPrice,
    });
  }

  /**
   * Exit position
   */
  exitPosition(exitPrice: number, exitReason: string, actualNetProfit: number): TradeCycleResult | null {
    if (!this.currentOpportunity) return null;
    
    this.currentOpportunity.exitPrice = exitPrice;
    this.tradeCount++;
    
    const result: TradeCycleResult = {
      success: actualNetProfit >= 0.50,
      opportunity: { ...this.currentOpportunity },
      actualNetProfit,
      exitReason,
      duration: Date.now() - this.cycleStartTime,
    };
    
    this.transition('Exit', `Exited at ${exitPrice}, net: $${actualNetProfit.toFixed(2)}`, {
      exitPrice,
      actualNetProfit,
      exitReason,
    });
    
    return result;
  }

  /**
   * Speed adjustment phase
   */
  adjustSpeed(newCooldownMs: number, reason: string): boolean {
    return this.transition('SpeedAdjust', reason, { cooldownMs: newCooldownMs });
  }

  /**
   * AI analysis phase
   */
  runAIAnalysis(adjustments: string[]): boolean {
    return this.transition('AIAnalysis', 'AI analyzing trade outcomes', { adjustments });
  }

  /**
   * Check if audit is needed (every 20 trades)
   */
  shouldAudit(): boolean {
    return this.tradeCount > 0 && this.tradeCount % 20 === 0;
  }

  /**
   * Generate audit
   */
  generateAudit(): boolean {
    if (!this.shouldAudit()) {
      return this.transition('Idle', 'No audit needed, returning to Idle');
    }
    return this.transition('SelfAudit', `Generating audit report (trade #${this.tradeCount})`);
  }

  /**
   * Generate dashboard
   */
  generateDashboard(): boolean {
    return this.transition('Dashboard', 'Updating visual dashboards');
  }

  /**
   * Return to idle
   */
  returnToIdle(): boolean {
    this.currentOpportunity = null;
    return this.transition('Idle', 'Ready for next opportunity') || (this.forceTransition('Idle', 'Forced return'), true);
  }

  /**
   * Execute full trade cycle
   */
  async executeTradeCycle(
    opportunity: QualifiedOpportunity,
    executeTradeCallback: () => Promise<{ exitPrice: number; netProfit: number; exitReason: string }>,
    speedAdjustCallback: () => { cooldownMs: number; reason: string },
    aiAnalysisCallback: () => string[],
  ): Promise<TradeCycleResult | null> {
    // Qualification
    if (!this.startQualification(opportunity)) {
      return null;
    }

    // Entry
    if (!this.enterPosition()) {
      this.forceTransition('Idle', 'Failed to enter position');
      return null;
    }

    // Execute trade and monitor
    const tradeResult = await executeTradeCallback();

    // Profit lock if profitable
    if (tradeResult.netProfit > opportunity.fees + opportunity.slippage) {
      const trailingStop = opportunity.entryPrice * (opportunity.side === 'long' ? 0.998 : 1.002);
      this.activateProfitLock(trailingStop);
    }

    // Exit
    const result = this.exitPosition(tradeResult.exitPrice, tradeResult.exitReason, tradeResult.netProfit);

    // Speed adjustment
    const speedResult = speedAdjustCallback();
    this.adjustSpeed(speedResult.cooldownMs, speedResult.reason);

    // AI Analysis
    const adjustments = aiAnalysisCallback();
    this.runAIAnalysis(adjustments);

    // Audit & Dashboard (every 20 trades)
    if (this.shouldAudit()) {
      this.generateAudit();
      this.generateDashboard();
    }

    // Return to idle
    this.returnToIdle();

    return result;
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): StateTransition[] {
    return [...this.transitions];
  }

  /**
   * Get recent transitions
   */
  getRecentTransitions(count: number = 10): StateTransition[] {
    return this.transitions.slice(-count);
  }

  /**
   * Get trade count
   */
  getTradeCount(): number {
    return this.tradeCount;
  }

  /**
   * Get exit transitions for audit
   */
  getExitTransitions(): StateTransition[] {
    return this.transitions.filter(t => t.to === 'Exit');
  }

  /**
   * Reset state machine
   */
  reset(): void {
    this.state = 'Idle';
    this.transitions = [];
    this.currentOpportunity = null;
    this.tradeCount = 0;
    this.cycleStartTime = 0;
  }
}

// Singleton instance
export const tradingStateMachine = new TradingStateMachine();

// Export class for testing
export { TradingStateMachine };
