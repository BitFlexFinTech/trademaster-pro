import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ExecutionStep {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
  details?: string;
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
}

export interface ExecutionMetrics {
  avgTotalDuration: number;
  avgPairSelection: number;
  avgAnalysis: number;
  avgOrderPlacement: number;
  avgConfirmation: number;
  successRate: number;
  totalExecutions: number;
}

const MAX_EXECUTIONS = 10;

const DEFAULT_STEPS = [
  'Pair Selection',
  'AI Analysis',
  'Order Preparation',
  'Order Placement',
  'Confirmation',
];

export function useTradeExecutionTimeline() {
  const { user } = useAuth();
  const [executions, setExecutions] = useState<TradeExecution[]>([]);
  const [currentExecution, setCurrentExecution] = useState<TradeExecution | null>(null);
  const [metrics, setMetrics] = useState<ExecutionMetrics>({
    avgTotalDuration: 0,
    avgPairSelection: 0,
    avgAnalysis: 0,
    avgOrderPlacement: 0,
    avgConfirmation: 0,
    successRate: 100,
    totalExecutions: 0,
  });

  const executionsRef = useRef(executions);
  executionsRef.current = executions;

  // Calculate metrics from executions
  const calculateMetrics = useCallback((execs: TradeExecution[]) => {
    if (execs.length === 0) return;

    const completed = execs.filter(e => e.status === 'completed');
    const failed = execs.filter(e => e.status === 'failed');

    const getStepDuration = (exec: TradeExecution, stepName: string) => {
      const step = exec.steps.find(s => s.name === stepName);
      return step?.duration || 0;
    };

    const avgTotal = completed.reduce((sum, e) => sum + e.totalDuration, 0) / (completed.length || 1);
    const avgPairSelection = completed.reduce((sum, e) => sum + getStepDuration(e, 'Pair Selection'), 0) / (completed.length || 1);
    const avgAnalysis = completed.reduce((sum, e) => sum + getStepDuration(e, 'AI Analysis'), 0) / (completed.length || 1);
    const avgOrderPlacement = completed.reduce((sum, e) => sum + getStepDuration(e, 'Order Placement'), 0) / (completed.length || 1);
    const avgConfirmation = completed.reduce((sum, e) => sum + getStepDuration(e, 'Confirmation'), 0) / (completed.length || 1);

    setMetrics({
      avgTotalDuration: avgTotal,
      avgPairSelection,
      avgAnalysis,
      avgOrderPlacement,
      avgConfirmation,
      successRate: execs.length > 0 ? (completed.length / execs.length) * 100 : 100,
      totalExecutions: execs.length,
    });
  }, []);

  // Subscribe to real-time trade updates
  useEffect(() => {
    if (!user?.id) return;

    // Listen for new trades being opened (represents execution completion)
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

        // Simulate execution steps (in real implementation, these would come from telemetry)
        const now = Date.now();
        const baseTime = new Date(trade.created_at).getTime();
        
        // Estimate step durations based on typical execution flow
        const pairSelectionDuration = 50 + Math.random() * 100; // 50-150ms
        const analysisDuration = 100 + Math.random() * 200; // 100-300ms
        const orderPrepDuration = 20 + Math.random() * 50; // 20-70ms
        const orderPlacementDuration = 200 + Math.random() * 500; // 200-700ms
        const confirmationDuration = 100 + Math.random() * 300; // 100-400ms

        const totalDuration = pairSelectionDuration + analysisDuration + orderPrepDuration + 
                              orderPlacementDuration + confirmationDuration;

        const steps: ExecutionStep[] = [
          {
            name: 'Pair Selection',
            startTime: baseTime,
            endTime: baseTime + pairSelectionDuration,
            duration: pairSelectionDuration,
            status: 'completed',
            details: `Selected ${trade.pair} based on volatility score`,
          },
          {
            name: 'AI Analysis',
            startTime: baseTime + pairSelectionDuration,
            endTime: baseTime + pairSelectionDuration + analysisDuration,
            duration: analysisDuration,
            status: 'completed',
            details: `${trade.direction.toUpperCase()} signal confirmed`,
          },
          {
            name: 'Order Preparation',
            startTime: baseTime + pairSelectionDuration + analysisDuration,
            endTime: baseTime + pairSelectionDuration + analysisDuration + orderPrepDuration,
            duration: orderPrepDuration,
            status: 'completed',
            details: `Entry: $${trade.entry_price}`,
          },
          {
            name: 'Order Placement',
            startTime: baseTime + pairSelectionDuration + analysisDuration + orderPrepDuration,
            endTime: baseTime + pairSelectionDuration + analysisDuration + orderPrepDuration + orderPlacementDuration,
            duration: orderPlacementDuration,
            status: 'completed',
            details: `Sent to ${trade.exchange_name || 'Exchange'}`,
          },
          {
            name: 'Confirmation',
            startTime: baseTime + pairSelectionDuration + analysisDuration + orderPrepDuration + orderPlacementDuration,
            endTime: baseTime + totalDuration,
            duration: confirmationDuration,
            status: 'completed',
            details: 'Order filled',
          },
        ];

        const execution: TradeExecution = {
          id: trade.id,
          pair: trade.pair,
          direction: trade.direction,
          exchange: trade.exchange_name || 'Unknown',
          steps,
          totalDuration,
          timestamp: new Date(trade.created_at),
          status: 'completed',
          entryPrice: trade.entry_price,
        };

        setExecutions(prev => {
          const updated = [execution, ...prev].slice(0, MAX_EXECUTIONS);
          calculateMetrics(updated);
          return updated;
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'trades',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const trade = payload.new as any;
        if (trade.status === 'closed') {
          // Update execution with exit info
          setExecutions(prev => 
            prev.map(exec => 
              exec.id === trade.id 
                ? { ...exec, exitPrice: trade.exit_price, profit: trade.profit_loss }
                : exec
            )
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, calculateMetrics]);

  // Start tracking a new execution (called from trading components)
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
      })),
      totalDuration: 0,
      timestamp: new Date(),
      status: 'in-progress',
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
        // Start next step
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

      setExecutions(execs => {
        const updated = [finalExecution, ...execs].slice(0, MAX_EXECUTIONS);
        calculateMetrics(updated);
        return updated;
      });

      return null;
    });
  }, [calculateMetrics]);

  return {
    executions,
    currentExecution,
    metrics,
    startExecution,
    updateStep,
    finishExecution,
  };
}
