import { useState, useCallback, useRef } from 'react';

export interface ExecutionMetrics {
  signalDetectionMs: number;
  analysisMs: number;
  orderPlacementMs: number;
  confirmationMs: number;
  totalCycleMs: number;
  timestamp: number;
}

interface BenchmarkAggregates {
  avgCycleTime: number;
  minCycleTime: number;
  maxCycleTime: number;
  cyclesRecorded: number;
  avgSignalTime: number;
  avgAnalysisTime: number;
  avgOrderTime: number;
  avgConfirmTime: number;
}

interface ExecutionBenchmarkReturn {
  currentMetrics: ExecutionMetrics | null;
  aggregates: BenchmarkAggregates;
  recordBenchmark: (metrics: Omit<ExecutionMetrics, 'timestamp'>) => void;
  startTiming: () => void;
  recordStage: (stage: 'signal' | 'analysis' | 'order' | 'confirm') => void;
  finishTiming: () => ExecutionMetrics | null;
  resetBenchmarks: () => void;
  history: ExecutionMetrics[];
}

export function useExecutionBenchmark(maxHistory: number = 100): ExecutionBenchmarkReturn {
  const [currentMetrics, setCurrentMetrics] = useState<ExecutionMetrics | null>(null);
  const [history, setHistory] = useState<ExecutionMetrics[]>([]);
  
  // Timing refs for stage-based recording
  const timingStartRef = useRef<number>(0);
  const stagesRef = useRef<{
    signal?: number;
    analysis?: number;
    order?: number;
    confirm?: number;
  }>({});

  // Calculate aggregates from history
  const calculateAggregates = useCallback((hist: ExecutionMetrics[]): BenchmarkAggregates => {
    if (hist.length === 0) {
      return {
        avgCycleTime: 0,
        minCycleTime: 0,
        maxCycleTime: 0,
        cyclesRecorded: 0,
        avgSignalTime: 0,
        avgAnalysisTime: 0,
        avgOrderTime: 0,
        avgConfirmTime: 0,
      };
    }

    const totalCycles = hist.length;
    const sumCycle = hist.reduce((sum, m) => sum + m.totalCycleMs, 0);
    const sumSignal = hist.reduce((sum, m) => sum + m.signalDetectionMs, 0);
    const sumAnalysis = hist.reduce((sum, m) => sum + m.analysisMs, 0);
    const sumOrder = hist.reduce((sum, m) => sum + m.orderPlacementMs, 0);
    const sumConfirm = hist.reduce((sum, m) => sum + m.confirmationMs, 0);

    return {
      avgCycleTime: sumCycle / totalCycles,
      minCycleTime: Math.min(...hist.map(m => m.totalCycleMs)),
      maxCycleTime: Math.max(...hist.map(m => m.totalCycleMs)),
      cyclesRecorded: totalCycles,
      avgSignalTime: sumSignal / totalCycles,
      avgAnalysisTime: sumAnalysis / totalCycles,
      avgOrderTime: sumOrder / totalCycles,
      avgConfirmTime: sumConfirm / totalCycles,
    };
  }, []);

  const [aggregates, setAggregates] = useState<BenchmarkAggregates>({
    avgCycleTime: 0,
    minCycleTime: 0,
    maxCycleTime: 0,
    cyclesRecorded: 0,
    avgSignalTime: 0,
    avgAnalysisTime: 0,
    avgOrderTime: 0,
    avgConfirmTime: 0,
  });

  // Record a complete benchmark
  const recordBenchmark = useCallback((metrics: Omit<ExecutionMetrics, 'timestamp'>) => {
    const fullMetrics: ExecutionMetrics = {
      ...metrics,
      timestamp: Date.now(),
    };

    setCurrentMetrics(fullMetrics);
    
    setHistory(prev => {
      const newHistory = [...prev, fullMetrics].slice(-maxHistory);
      setAggregates(calculateAggregates(newHistory));
      return newHistory;
    });

    // Log to console for debugging
    console.log('%c⚡ Trade Execution Benchmark', 'color: #3b82f6; font-size: 12px; font-weight: bold');
    console.log(`   Signal Detection: ${metrics.signalDetectionMs}ms`);
    console.log(`   Analysis: ${metrics.analysisMs}ms`);
    console.log(`   Order Placement: ${metrics.orderPlacementMs}ms`);
    console.log(`   Confirmation: ${metrics.confirmationMs}ms`);
    console.log(`   Total Cycle: ${metrics.totalCycleMs}ms`);
  }, [maxHistory, calculateAggregates]);

  // Start timing a new trade cycle
  const startTiming = useCallback(() => {
    timingStartRef.current = Date.now();
    stagesRef.current = {};
  }, []);

  // Record a timing stage
  const recordStage = useCallback((stage: 'signal' | 'analysis' | 'order' | 'confirm') => {
    const elapsed = Date.now() - timingStartRef.current;
    stagesRef.current[stage] = elapsed;
  }, []);

  // Finish timing and record the benchmark
  const finishTiming = useCallback((): ExecutionMetrics | null => {
    const now = Date.now();
    const total = now - timingStartRef.current;
    
    if (timingStartRef.current === 0) {
      return null;
    }

    const stages = stagesRef.current;
    const metrics: ExecutionMetrics = {
      signalDetectionMs: stages.signal || 0,
      analysisMs: (stages.analysis || stages.signal || 0) - (stages.signal || 0),
      orderPlacementMs: (stages.order || stages.analysis || 0) - (stages.analysis || 0),
      confirmationMs: total - (stages.order || stages.analysis || stages.signal || 0),
      totalCycleMs: total,
      timestamp: now,
    };

    setCurrentMetrics(metrics);
    
    setHistory(prev => {
      const newHistory = [...prev, metrics].slice(-maxHistory);
      setAggregates(calculateAggregates(newHistory));
      return newHistory;
    });

    // Reset for next cycle
    timingStartRef.current = 0;
    stagesRef.current = {};

    console.log('%c⚡ Trade Execution Benchmark', 'color: #3b82f6; font-size: 12px; font-weight: bold');
    console.log(`   Signal: ${metrics.signalDetectionMs}ms → Analysis: ${metrics.analysisMs}ms → Order: ${metrics.orderPlacementMs}ms → Confirm: ${metrics.confirmationMs}ms`);
    console.log(`   Total Cycle: ${metrics.totalCycleMs}ms`);

    return metrics;
  }, [maxHistory, calculateAggregates]);

  // Reset all benchmarks
  const resetBenchmarks = useCallback(() => {
    setCurrentMetrics(null);
    setHistory([]);
    setAggregates({
      avgCycleTime: 0,
      minCycleTime: 0,
      maxCycleTime: 0,
      cyclesRecorded: 0,
      avgSignalTime: 0,
      avgAnalysisTime: 0,
      avgOrderTime: 0,
      avgConfirmTime: 0,
    });
    timingStartRef.current = 0;
    stagesRef.current = {};
  }, []);

  return {
    currentMetrics,
    aggregates,
    recordBenchmark,
    startTiming,
    recordStage,
    finishTiming,
    resetBenchmarks,
    history,
  };
}
