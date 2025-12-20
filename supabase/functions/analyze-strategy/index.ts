import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exchange rate limits (orders per second)
const EXCHANGE_RATE_LIMITS: Record<string, { ordersPerSecond: number; requestsPerMinute: number }> = {
  'Binance': { ordersPerSecond: 10, requestsPerMinute: 1200 },
  'OKX': { ordersPerSecond: 2, requestsPerMinute: 300 },
  'Bybit': { ordersPerSecond: 5, requestsPerMinute: 600 },
  'Kraken': { ordersPerSecond: 1, requestsPerMinute: 60 },
  'KuCoin': { ordersPerSecond: 2, requestsPerMinute: 180 },
  'Nexo': { ordersPerSecond: 1, requestsPerMinute: 60 },
  'Coinbase': { ordersPerSecond: 3, requestsPerMinute: 300 },
  'Gate.io': { ordersPerSecond: 2, requestsPerMinute: 200 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, connectedExchanges } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent trades (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false });

    if (tradesError) {
      console.error('Error fetching trades:', tradesError);
    }

    // Calculate current metrics
    const recentTrades = trades || [];
    const closedTrades = recentTrades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => (t.profit_loss || 0) > 0);
    const currentHitRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;

    const avgProfit = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + (t.profit_loss || 0), 0) / closedTrades.length
      : 0;

    // Calculate rate limit-aware trade speed
    const exchanges = connectedExchanges || ['Binance'];
    let minOrdersPerSecond = 10;
    let limitingExchange = 'Binance';

    for (const exchange of exchanges) {
      const limits = EXCHANGE_RATE_LIMITS[exchange];
      if (limits && limits.ordersPerSecond < minOrdersPerSecond) {
        minOrdersPerSecond = limits.ordersPerSecond;
        limitingExchange = exchange;
      }
    }

    // Use 50% of capacity for safety
    const safeTradeSpeed = minOrdersPerSecond * 0.5;
    const recommendedIntervalMs = Math.max(1000, Math.floor(1000 / safeTradeSpeed));

    // Fetch current bot config
    const { data: botConfig } = await supabase
      .from('bot_config')
      .select('*')
      .eq('user_id', userId)
      .single();

    const currentSignalThreshold = (botConfig?.min_profit_threshold || 0.001) * 100;
    const currentTradeInterval = botConfig?.trade_interval_ms || 3000;

    // Analyze patterns and generate recommendations
    let recommendedSignalThreshold = currentSignalThreshold;
    let recommendedProfitPerTrade = botConfig?.profit_per_trade || 0.15;
    let recommendedStopLoss = botConfig?.per_trade_stop_loss || 0.5;
    let summary = '';

    // Strategy adjustments based on hit rate
    if (currentHitRate < 90) {
      // Low hit rate - be more conservative
      recommendedSignalThreshold = Math.min(98, currentSignalThreshold + 3);
      recommendedProfitPerTrade = Math.max(0.08, recommendedProfitPerTrade - 0.02);
      summary = `Increase signal threshold to ${recommendedSignalThreshold.toFixed(0)}% for better trade selection`;
    } else if (currentHitRate < 95) {
      // Close to target - fine tune
      recommendedSignalThreshold = Math.min(96, currentSignalThreshold + 1);
      summary = `Fine-tune signal to ${recommendedSignalThreshold.toFixed(0)}% to reach 95% target`;
    } else {
      // Good hit rate - can be slightly more aggressive
      recommendedSignalThreshold = Math.max(90, currentSignalThreshold - 0.5);
      recommendedProfitPerTrade = Math.min(0.25, recommendedProfitPerTrade + 0.01);
      summary = `Excellent! Optimizing for more trades while maintaining 95%+ hit rate`;
    }

    // Analyze which pairs perform best
    const pairPerformance: Record<string, { wins: number; total: number }> = {};
    for (const trade of closedTrades) {
      const pair = trade.pair;
      if (!pairPerformance[pair]) {
        pairPerformance[pair] = { wins: 0, total: 0 };
      }
      pairPerformance[pair].total++;
      if ((trade.profit_loss || 0) > 0) {
        pairPerformance[pair].wins++;
      }
    }

    // Get top performing pairs (>80% win rate, min 3 trades)
    const focusPairs = Object.entries(pairPerformance)
      .filter(([_, stats]) => stats.total >= 3 && (stats.wins / stats.total) >= 0.8)
      .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
      .slice(0, 5)
      .map(([pair]) => pair);

    // Calculate confidence based on data quality
    const confidence = Math.min(95, 50 + (closedTrades.length * 2));

    // Calculate 24-hour hourly hit rate history
    const hitRateHistory: Array<{ hour: string; hitRate: number; totalTrades: number }> = [];
    const now = new Date();
    
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourEnd = new Date(now.getTime() - (i - 1) * 60 * 60 * 1000);
      
      const hourTrades = closedTrades.filter(t => {
        const tradeTime = new Date(t.created_at);
        return tradeTime >= hourStart && tradeTime < hourEnd;
      });
      
      const hourWins = hourTrades.filter(t => (t.profit_loss || 0) > 0).length;
      const hourHitRate = hourTrades.length > 0 ? (hourWins / hourTrades.length) * 100 : 0;
      
      hitRateHistory.push({
        hour: hourStart.toISOString(),
        hitRate: Math.round(hourHitRate * 10) / 10,
        totalTrades: hourTrades.length
      });
    }

    const response = {
      currentHitRate: Math.round(currentHitRate * 10) / 10,
      targetHitRate: 95,
      currentTradeSpeed: Math.round(1000 / currentTradeInterval * 10) / 10,
      recommendedTradeSpeed: Math.round(safeTradeSpeed * 10) / 10,
      exchangeLimit: minOrdersPerSecond,
      limitingExchange,
      recommendations: {
        signalThreshold: Math.round(recommendedSignalThreshold * 10) / 10,
        tradeIntervalMs: recommendedIntervalMs,
        profitPerTrade: Math.round(recommendedProfitPerTrade * 100) / 100,
        stopLoss: Math.round(recommendedStopLoss * 100) / 100,
        focusPairs: focusPairs.length > 0 ? focusPairs : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
      },
      summary,
      confidence,
      analyzedAt: new Date().toISOString(),
      tradesAnalyzed: closedTrades.length,
      avgProfit: Math.round(avgProfit * 100) / 100,
      hitRateHistory,
    };

    console.log('Strategy analysis complete:', {
      userId,
      currentHitRate: response.currentHitRate,
      recommendedSpeed: response.recommendedTradeSpeed,
      tradesAnalyzed: closedTrades.length
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in analyze-strategy:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      currentHitRate: 0,
      targetHitRate: 95,
      recommendedTradeSpeed: 0.5,
      exchangeLimit: 10,
      limitingExchange: 'Unknown',
      recommendations: {
        signalThreshold: 94,
        tradeIntervalMs: 2000,
        profitPerTrade: 0.15,
        stopLoss: 0.5,
        focusPairs: ['BTC/USDT', 'ETH/USDT']
      },
      summary: 'Analysis pending - insufficient data',
      confidence: 0,
      analyzedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
