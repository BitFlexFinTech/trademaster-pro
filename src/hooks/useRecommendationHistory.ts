import { useState, useCallback, useEffect } from 'react';

interface AppliedRecommendation {
  id: string;
  type: string;
  title: string;
  previousValue: number | string;
  newValue: number | string;
  appliedAt: Date;
  expiresAt: Date;
}

const UNDO_WINDOW_MS = 30000; // 30 seconds

export function useRecommendationHistory() {
  const [history, setHistory] = useState<AppliedRecommendation[]>([]);

  // Clean up expired recommendations
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setHistory(prev => prev.filter(r => r.expiresAt > now));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const addToHistory = useCallback((
    id: string,
    type: string,
    title: string,
    previousValue: number | string,
    newValue: number | string
  ) => {
    const now = new Date();
    const recommendation: AppliedRecommendation = {
      id,
      type,
      title,
      previousValue,
      newValue,
      appliedAt: now,
      expiresAt: new Date(now.getTime() + UNDO_WINDOW_MS),
    };

    setHistory(prev => [recommendation, ...prev].slice(0, 5));

    return recommendation;
  }, []);

  const removeFromHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(r => r.id !== id));
  }, []);

  const getTimeRemaining = useCallback((id: string): number => {
    const item = history.find(r => r.id === id);
    if (!item) return 0;
    return Math.max(0, item.expiresAt.getTime() - Date.now());
  }, [history]);

  return {
    history,
    addToHistory,
    removeFromHistory,
    getTimeRemaining,
    UNDO_WINDOW_MS,
  };
}
