import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface MLPrediction {
  direction: 'long' | 'short';
  confidence: number;
  timestamp: Date;
  pair: string;
  outcome?: 'win' | 'loss' | 'pending';
}

export interface UseMLConfidenceReturn {
  confidence: number;
  accuracy: number;
  lastPrediction: MLPrediction | null;
  predictionHistory: MLPrediction[];
  isModelTrained: boolean;
  lastTrainingTime: Date | null;
  modelVersion: number;
  tradesAnalyzed: number;
  fetchLatestPrediction: (pair: string, mode: 'spot' | 'leverage') => Promise<MLPrediction | null>;
  recordPredictionOutcome: (timestamp: Date, isWin: boolean) => void;
}

const MAX_HISTORY_SIZE = 50;

export function useMLConfidence(): UseMLConfidenceReturn {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<MLPrediction[]>([]);
  const [modelInfo, setModelInfo] = useState<{
    accuracy: number;
    lastTrainingTime: Date | null;
    modelVersion: number;
    trainingSamples: number;
  }>({
    accuracy: 70,
    lastTrainingTime: null,
    modelVersion: 1,
    trainingSamples: 0,
  });

  // Fetch model info from database
  useEffect(() => {
    if (!user) return;

    async function fetchModelInfo() {
      const { data } = await supabase
        .from('ml_models')
        .select('*')
        .eq('user_id', user.id)
        .eq('model_type', 'direction_predictor')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setModelInfo({
          accuracy: data.accuracy || 70,
          lastTrainingTime: data.last_trained_at ? new Date(data.last_trained_at) : null,
          modelVersion: 1,
          trainingSamples: data.training_samples || 0,
        });
      }
    }

    fetchModelInfo();

    // Subscribe to model updates
    const channel = supabase
      .channel('ml_models_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ml_models',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new && typeof payload.new === 'object' && 'accuracy' in payload.new) {
          const newData = payload.new as { accuracy: number; last_trained_at: string; training_samples: number };
          setModelInfo({
            accuracy: newData.accuracy || 70,
            lastTrainingTime: newData.last_trained_at ? new Date(newData.last_trained_at) : null,
            modelVersion: modelInfo.modelVersion + 1,
            trainingSamples: newData.training_samples || 0,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Calculate rolling accuracy from predictions
  const { confidence, accuracy, tradesAnalyzed } = useMemo(() => {
    const resolvedPredictions = predictions.filter(p => p.outcome && p.outcome !== 'pending');
    const wins = resolvedPredictions.filter(p => p.outcome === 'win').length;
    const total = resolvedPredictions.length;
    
    const rollingAccuracy = total >= 5 ? (wins / total) * 100 : modelInfo.accuracy;
    const currentConfidence = predictions.length > 0 
      ? predictions[predictions.length - 1].confidence 
      : modelInfo.accuracy;

    return {
      confidence: currentConfidence,
      accuracy: rollingAccuracy,
      tradesAnalyzed: total,
    };
  }, [predictions, modelInfo.accuracy]);

  const fetchLatestPrediction = useCallback(async (
    pair: string, 
    mode: 'spot' | 'leverage'
  ): Promise<MLPrediction | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('ml-direction-predictor', {
        body: { pair, mode }
      });

      if (error || !data) return null;

      const prediction: MLPrediction = {
        direction: data.direction,
        confidence: data.confidence,
        timestamp: new Date(),
        pair,
        outcome: 'pending',
      };

      setPredictions(prev => {
        const updated = [...prev, prediction];
        if (updated.length > MAX_HISTORY_SIZE) {
          updated.shift();
        }
        return updated;
      });

      return prediction;

    } catch (err) {
      console.error('Failed to fetch ML prediction:', err);
      return null;
    }
  }, []);

  const recordPredictionOutcome = useCallback((timestamp: Date, isWin: boolean) => {
    setPredictions(prev => prev.map(p => {
      if (p.timestamp.getTime() === timestamp.getTime()) {
        return { ...p, outcome: isWin ? 'win' : 'loss' };
      }
      return p;
    }));
  }, []);

  const lastPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;

  return {
    confidence,
    accuracy,
    lastPrediction,
    predictionHistory: predictions,
    isModelTrained: modelInfo.trainingSamples > 0,
    lastTrainingTime: modelInfo.lastTrainingTime,
    modelVersion: modelInfo.modelVersion,
    tradesAnalyzed,
    fetchLatestPrediction,
    recordPredictionOutcome,
  };
}
