import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Matches the backend telemetry structure from executionTelemetry.ts
interface BackendPhaseMetrics {
  startMs: number;
  durationMs: number;
  details: string;
}

interface BackendExecutionTelemetry {
  tradeId?: string;
  pair?: string;
  direction?: 'long' | 'short';
  exchange?: string;
  phases?: {
    pairSelection?: BackendPhaseMetrics;
    aiAnalysis?: BackendPhaseMetrics;
    orderPreparation?: BackendPhaseMetrics;
    orderPlacement?: BackendPhaseMetrics;
    confirmation?: BackendPhaseMetrics;
  };
  totalDurationMs?: number;
  success?: boolean;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionStep {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
  details?: string;
  isEstimated?: boolean;
}

export interface TradeExecution {
  id: string;
  pair: string;
  direction: 'long' | 'short';
  exchange: string;
  steps: ExecutionStep[];
  totalDuration: number;
  timestamp: Date;
  status: 'in-progress' | 'completed' | 'failed';
  entryPrice?: number;
  exitPrice?: number;
  profit?: number;
  hasTelemetry: boolean;
}

export interface ExecutionMetrics {
  avgTotalDuration: number;
  avgPairSelection: number;
  avgAnalysis: number;
  avgOrderPrep: number;
  avgOrderPlacement: number;
  avgConfirmation: number;
  successRate: number;
  totalExecutions: number;
  telemetryRate: number;
}

const MAX_EXECUTIONS = 10;

const DEFAULT_STEPS = [
  'Pair Selection',
  'AI Analysis',
  'Order Preparation',
  'Order Placement',
  'Confirmation',
];

// Generate simulated steps when no telemetry is available
function generateSimulatedSteps(baseTime: number, trade: any): ExecutionStep[] {
  const pairSelectionDuration = 50 + Math.random() * 100;
  const analysisDuration = 100 + Math.random() * 200;
  const orderPrepDuration = 20 + Math.random() * 50;
  const orderPlacementDuration = 200 + Math.random() * 500;
  const confirmationDuration = 100 + Math.random() * 300;

  let currentTime = baseTime;
  return [
    {
      name: 'Pair Selection',
      startTime: currentTime,
      endTime: currentTime + pairSelectionDuration,
      duration: pairSelectionDuration,
      status: 'completed',
      details: `Selected ${trade.pair} based on volatility`,
      isEstimated: true,
    },
    {
      name: 'AI Analysis',
      startTime: currentTime += pairSelectionDuration,
      endTime: currentTime + analysisDuration,
      duration: analysisDuration,
      status: 'completed',
      details: `${trade.direction?.toUpperCase() || 'LONG'} signal confirmed`,
      isEstimated: true,
    },
    {
      name: 'Order Preparation',
      startTime: currentTime += analysisDuration,
      endTime: currentTime + orderPrepDuration,
      duration: orderPrepDuration,
      status: 'completed',
      details: `Entry: $${trade.entry_price}`,
      isEstimated: true,
    },
    {
      name: 'Order Placement',
      startTime: currentTime += orderPrepDuration,
      endTime: currentTime + orderPlacementDuration,
      duration: orderPlacementDuration,
      status: 'completed',
      details: `Sent to ${trade.exchange_name || 'Exchange'}`,
      isEstimated: true,
    },
    {
      name: 'Confirmation',
      startTime: currentTime += orderPlacementDuration,
      endTime: currentTime + confirmationDuration,
      duration: confirmationDuration,
      status: 'completed',
      details: 'Order filled',
      isEstimated: true,
    },
  ];
}

// Convert backend telemetry to ExecutionSteps
function telemetryToSteps(telemetry: BackendExecutionTelemetry, baseTime: number): ExecutionStep[] {
  const phases = telemetry.phases || {};
  const steps: ExecutionStep[] = [];

  const phaseData = [
    { key: 'pairSelection' as const, name: 'Pair Selection' },
    { key: 'aiAnalysis' as const, name: 'AI Analysis' },
    { key: 'orderPreparation' as const, name: 'Order Preparation' },
    { key: 'orderPlacement' as const, name: 'Order Placement' },
    { key: 'confirmation' as const, name: 'Confirmation' },
  ];

  for (const { key, name } of phaseData) {
    const phase = phases[key];
    if (phase && phase.durationMs !== undefined) {
      steps.push({
        name,
        startTime: baseTime + (phase.startMs || 0),
        endTime: baseTime + (phase.startMs || 0) + phase.durationMs,
        duration: phase.durationMs,
        status: 'completed',
        details: phase.details || undefined,
        isEstimated: false,
      });
    } else {
      steps.push({
        name,
        startTime: 0,
        endTime: 0,
        duration: 0,
        status: 'pending',
        details: 'Not recorded',
        isEstimated: true,
      });
    }
  }

  return steps;
}

export function useTradeExecutionTimeline() {
  const { user } = useAuth();
  const [executions, setExecutions] = useState<TradeExecution[]>([]);
  const [currentExecution, setCurrentExecution] = useState<TradeExecution | null>(null);

  // Calculate metrics from executions
  const metrics = useMemo<ExecutionMetrics>(() => {
    if (executions.length === 0) {
      return {
        avgTotalDuration: 0,
        avgPairSelection: 0,
        avgAnalysis: 0,
        avgOrderPrep: 0,
        avgOrderPlacement: 0,
        avgConfirmation: 0,
        successRate: 100,
        totalExecutions: 0,
        telemetryRate: 0,
      };
    }

    const completed = executions.filter(e => e.status === 'completed');
    const withTelemetry = executions.filter(e => e.hasTelemetry);

    const getStepDuration = (exec: TradeExecution, stepName: string) => {
      const step = exec.steps.find(s => s.name === stepName);
      return step?.duration || 0;
    };

    const source = withTelemetry.length > 0 ? withTelemetry : completed;
    const count = source.length || 1;

    return {
      avgTotalDuration: source.reduce((sum, e) => sum + e.totalDuration, 0) / count,
      avgPairSelection: source.reduce((sum, e) => sum + getStepDuration(e, 'Pair Selection'), 0) / count,
      avgAnalysis: source.reduce((sum, e) => sum + getStepDuration(e, 'AI Analysis'), 0) / count,
      avgOrderPrep: source.reduce((sum, e) => sum + getStepDuration(e, 'Order Preparation'), 0) / count,
      avgOrderPlacement: source.reduce((sum, e) => sum + getStepDuration(e, 'Order Placement'), 0) / count,
      avgConfirmation: source.reduce((sum, e) => sum + getStepDuration(e, 'Confirmation'), 0) / count,
      successRate: executions.length > 0 ? (completed.length / executions.length) * 100 : 100,
      totalExecutions: executions.length,
      telemetryRate: executions.length > 0 ? (withTelemetry.length / executions.length) * 100 : 0,
    };
  }, [executions]);

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('trade-execution-timeline')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        console.log('[TradeExecutionTimeline] New trade opened:', trade.pair);

        const baseTime = new Date(trade.created_at).getTime();
        
        // Check if trade has execution_telemetry from backend
        const telemetry = trade.execution_telemetry as BackendExecutionTelemetry | null;
        const hasTelemetry = !!(telemetry && telemetry.phases);
        
        const steps = hasTelemetry 
          ? telemetryToSteps(telemetry!, baseTime)
          : generateSimulatedSteps(baseTime, trade);
        
        const totalDuration = hasTelemetry && telemetry?.totalDurationMs
          ? telemetry.totalDurationMs
          : steps.reduce((sum, s) => sum + (s.duration || 0), 0);

        const execution: TradeExecution = {
          id: trade.id,
          pair: trade.pair || 'UNKNOWN',
          direction: trade.direction || 'long',
          exchange: trade.exchange_name || 'Unknown',
          steps,
          totalDuration,
          timestamp: new Date(trade.created_at),
          status: 'completed',
          entryPrice: trade.entry_price,
          hasTelemetry,
        };

        console.log(`[TradeExecutionTimeline] ${hasTelemetry ? '📊 Real telemetry' : '⏱️ Simulated'} for ${trade.pair}`);

        setExecutions(prev => [execution, ...prev].slice(0, MAX_EXECUTIONS));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        if (trade.status === 'closed') {
          setExecutions(prev => 
            prev.map(exec => 
              exec.id === trade.id
                ? { ...exec, exitPrice: trade.exit_price, profit: trade.profit_loss, status: 'completed' as const }
                : exec
            )
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Start tracking a new execution
  const startExecution = useCallback((pair: string, direction: 'long' | 'short', exchange: string) => {
    const now = Date.now();
    const execution: TradeExecution = {
      id: `temp-${now}`,
      pair,
      direction,
      exchange,
      steps: DEFAULT_STEPS.map((name, i) => ({
        name,
        startTime: i === 0 ? now : 0,
        status: i === 0 ? 'in-progress' : 'pending',
        isEstimated: true,
      })),
      totalDuration: 0,
      timestamp: new Date(),
      status: 'in-progress',
      hasTelemetry: false,
    };
    setCurrentExecution(execution);
    return execution.id;
  }, []);

  // Update step status
  const updateStep = useCallback((stepName: string, status: ExecutionStep['status'], details?: string) => {
    setCurrentExecution(prev => {
      if (!prev) return null;
      const now = Date.now();
      const steps = prev.steps.map((step, i) => {
        if (step.name === stepName) {
          return {
            ...step,
            endTime: status === 'completed' || status === 'failed' ? now : undefined,
            duration: status === 'completed' || status === 'failed' ? now - step.startTime : undefined,
            status,
            details,
          };
        }
        if (i > 0 && prev.steps[i - 1].name === stepName && status === 'completed') {
          return { ...step, startTime: now, status: 'in-progress' as const };
        }
        return step;
      });
      return { ...prev, steps };
    });
  }, []);

  // Complete or fail the current execution
  const finishExecution = useCallback((success: boolean, tradeId?: string) => {
    setCurrentExecution(prev => {
      if (!prev) return null;
      const now = Date.now();
      const totalDuration = now - prev.steps[0].startTime;
      
      const finalExecution: TradeExecution = {
        ...prev,
        id: tradeId || prev.id,
        steps: prev.steps.map(step => ({
          ...step,
          status: step.status === 'in-progress' ? (success ? 'completed' : 'failed') : step.status,
          endTime: step.endTime || now,
          duration: step.duration || (step.startTime ? now - step.startTime : 0),
        })),
        totalDuration,
        status: success ? 'completed' : 'failed',
      };

      setExecutions(execs => [finalExecution, ...execs].slice(0, MAX_EXECUTIONS));
      return null;
    });
  }, []);

  return {
    executions,
    currentExecution,
    metrics,
    startExecution,
    updateStep,
    finishExecution,
  };
}
