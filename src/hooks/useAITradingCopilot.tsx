import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useJarvisRegime } from '@/hooks/useJarvisRegime';
import { useBotAnalytics } from '@/hooks/useBotAnalytics';
import { useBinanceWebSocket } from '@/hooks/useBinanceWebSocket';

export interface TradeSuggestion {
  id: string;
  action: 'LONG' | 'SHORT' | 'WAIT';
  pair: string;
  entry: number;
  takeProfit: number;
  stopLoss: number;
  confidence: number;
  reasoning: string;
  regime: string;
  timestamp: Date;
  status: 'pending' | 'executed' | 'skipped' | 'expired';
}

export interface MarketContext {
  volatility: 'Low' | 'Medium' | 'High';
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  volumeStatus: 'Below Average' | 'Average' | 'Above Average';
  regimeConfidence: number;
}

export interface UserEdge {
  bestPair: { pair: string; pnl: number } | null;
  worstPair: { pair: string; losses: number } | null;
  optimalHours: string;
  winRateByRegime: Record<string, number>;
}

interface UseAITradingCopilotResult {
  currentSuggestion: TradeSuggestion | null;
  previousSuggestions: TradeSuggestion[];
  marketContext: MarketContext;
  userEdge: UserEdge;
  isLoading: boolean;
  isLive: boolean;
  refreshSuggestion: () => Promise<void>;
  executeSuggestion: (suggestionId: string) => Promise<void>;
  skipSuggestion: (suggestionId: string) => void;
}

export function useAITradingCopilot(): UseAITradingCopilotResult {
  const { user } = useAuth();
  const { regime, deviation, currentPrice, ema200 } = useJarvisRegime('BTCUSDT');
  const { analytics } = useBotAnalytics();
  const ws = useBinanceWebSocket();
  const livePrice = ws.getPrice('BTCUSDT');
  
  const [currentSuggestion, setCurrentSuggestion] = useState<TradeSuggestion | null>(null);
  const [previousSuggestions, setPreviousSuggestions] = useState<TradeSuggestion[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContext>({
    volatility: 'Medium',
    trend: 'Neutral',
    volumeStatus: 'Average',
    regimeConfidence: 0,
  });
  const [userEdge, setUserEdge] = useState<UserEdge>({
    bestPair: null,
    worstPair: null,
    optimalHours: '10:00-14:00',
    winRateByRegime: { BULL: 0, BEAR: 0, CHOP: 0 },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  const lastSuggestionTimeRef = useRef<number>(0);
  const cooldownMs = 60000; // 1 minute cooldown between suggestions

  // Calculate market context from current data
  useEffect(() => {
    const volatility = Math.abs(deviation) > 0.01 ? 'High' : 
                       Math.abs(deviation) > 0.005 ? 'Medium' : 'Low';
    
    const trend = regime === 'BULL' ? 'Bullish' : 
                  regime === 'BEAR' ? 'Bearish' : 'Neutral';
    
    const regimeConfidence = Math.min(100, Math.abs(deviation) * 1000);
    
    setMarketContext({
      volatility,
      trend,
      volumeStatus: 'Average', // Would need volume data
      regimeConfidence,
    });
    
    setIsLive(!!livePrice);
  }, [regime, deviation, livePrice]);

  // Analyze user's historical performance
  useEffect(() => {
    if (!user || !analytics) return;

    const analyzeUserEdge = async () => {
      try {
        // Fetch recent trades
        const { data: trades } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'closed')
          .order('created_at', { ascending: false })
          .limit(100);

        if (!trades || trades.length === 0) return;

        // Calculate best/worst pairs
        const pairStats: Record<string, { pnl: number; count: number }> = {};
        const regimeStats: Record<string, { wins: number; total: number }> = {
          BULL: { wins: 0, total: 0 },
          BEAR: { wins: 0, total: 0 },
          CHOP: { wins: 0, total: 0 },
        };

        trades.forEach(trade => {
          const pair = trade.pair;
          const pnl = trade.profit_loss || 0;
          const tradeRegime = trade.regime_at_entry || 'CHOP';

          if (!pairStats[pair]) {
            pairStats[pair] = { pnl: 0, count: 0 };
          }
          pairStats[pair].pnl += pnl;
          pairStats[pair].count++;

          if (regimeStats[tradeRegime]) {
            regimeStats[tradeRegime].total++;
            if (pnl > 0) regimeStats[tradeRegime].wins++;
          }
        });

        // Find best and worst pairs
        const pairEntries = Object.entries(pairStats);
        const sortedByPnl = [...pairEntries].sort((a, b) => b[1].pnl - a[1].pnl);
        
        const bestPair = sortedByPnl[0] 
          ? { pair: sortedByPnl[0][0], pnl: sortedByPnl[0][1].pnl }
          : null;
        
        const lastEntry = sortedByPnl[sortedByPnl.length - 1];
        const worstPair = lastEntry && lastEntry[1].pnl < 0
          ? { pair: sortedByPnl[sortedByPnl.length - 1][0], losses: Math.abs(sortedByPnl[sortedByPnl.length - 1][1].pnl) }
          : null;

        // Calculate win rate by regime
        const winRateByRegime: Record<string, number> = {};
        Object.entries(regimeStats).forEach(([r, stats]) => {
          winRateByRegime[r] = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
        });

        setUserEdge({
          bestPair,
          worstPair,
          optimalHours: '10:00-14:00', // Would need time analysis
          winRateByRegime,
        });
      } catch (error) {
        console.error('Failed to analyze user edge:', error);
      }
    };

    analyzeUserEdge();
  }, [user, analytics]);

  const refreshSuggestion = useCallback(async () => {
    if (!user) return;
    
    const now = Date.now();
    if (now - lastSuggestionTimeRef.current < cooldownMs) {
      return; // Still in cooldown
    }
    
    setIsLoading(true);
    lastSuggestionTimeRef.current = now;

    try {
      const response = await supabase.functions.invoke('ai-trading-engine', {
        body: {
          action: 'copilot_suggestion',
          regime,
          regimeConfidence: marketContext.regimeConfidence,
          currentPrice: livePrice || currentPrice,
          ema200,
          userEdge,
          recentPerformance: analytics,
        },
      });

      if (response.data?.suggestion) {
        const suggestion: TradeSuggestion = {
          id: `suggestion-${Date.now()}`,
          ...response.data.suggestion,
          regime,
          timestamp: new Date(),
          status: 'pending',
        };
        
        setCurrentSuggestion(suggestion);
        setPreviousSuggestions(prev => [suggestion, ...prev].slice(0, 10));
      }
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, regime, marketContext, livePrice, currentPrice, ema200, userEdge, analytics]);

  const executeSuggestion = useCallback(async (suggestionId: string) => {
    if (!currentSuggestion || currentSuggestion.id !== suggestionId) return;

    try {
      // Execute trade via edge function
      await supabase.functions.invoke('execute-trade', {
        body: {
          pair: currentSuggestion.pair,
          direction: currentSuggestion.action.toLowerCase(),
          entryPrice: currentSuggestion.entry,
          amount: 100, // Would use user's configured amount
          takeProfit: currentSuggestion.takeProfit,
          stopLoss: currentSuggestion.stopLoss,
          source: 'ai_copilot',
        },
      });

      // Update suggestion status
      setCurrentSuggestion(prev => prev ? { ...prev, status: 'executed' } : null);
      setPreviousSuggestions(prev => 
        prev.map(s => s.id === suggestionId ? { ...s, status: 'executed' } : s)
      );
    } catch (error) {
      console.error('Failed to execute suggestion:', error);
    }
  }, [currentSuggestion]);

  const skipSuggestion = useCallback((suggestionId: string) => {
    setCurrentSuggestion(prev => prev?.id === suggestionId ? null : prev);
    setPreviousSuggestions(prev => 
      prev.map(s => s.id === suggestionId ? { ...s, status: 'skipped' } : s)
    );
  }, []);

  // Auto-refresh suggestions periodically when live
  useEffect(() => {
    if (!isLive) return;
    
    const interval = setInterval(() => {
      if (!isLoading && !currentSuggestion) {
        refreshSuggestion();
      }
    }, 120000); // Every 2 minutes

    return () => clearInterval(interval);
  }, [isLive, isLoading, currentSuggestion, refreshSuggestion]);

  return {
    currentSuggestion,
    previousSuggestions,
    marketContext,
    userEdge,
    isLoading,
    isLive,
    refreshSuggestion,
    executeSuggestion,
    skipSuggestion,
  };
}