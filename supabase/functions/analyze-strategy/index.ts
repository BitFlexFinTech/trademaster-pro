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
    const { userId, connectedExchanges, usdtFloat } = await req.json();

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

    // Calculate total available capital
    const totalCapital = usdtFloat?.reduce((sum: number, f: any) => sum + (f.amount || 0), 0) || 1000;

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

    // =====================================================
    // MICRO-SCALP $1 PROFIT STRATEGY CALCULATION
    // =====================================================
    // Target: $1 NET profit per trade after fees
    // Typical exchange fees: 0.1% maker, 0.1% taker = 0.2% round-trip
    // Formula: Position Size = Target Profit / (TP% - Fees%)
    
    const TARGET_NET_PROFIT = 1.00; // $1 per trade
    const ROUND_TRIP_FEES_PCT = 0.2; // 0.2% total fees (0.1% entry + 0.1% exit)
    const MIN_TP_PCT = 0.3; // Minimum 0.3% take profit to ensure net $1 after fees
    const NET_TP_PCT = MIN_TP_PCT - ROUND_TRIP_FEES_PCT; // 0.1% net after fees
    
    // Position size needed for $1 net profit: $1 / 0.001 = $1000
    const microScalpPositionSize = TARGET_NET_PROFIT / (NET_TP_PCT / 100);
    
    // Adjust based on available capital
    const safePositionSize = Math.min(microScalpPositionSize, totalCapital * 0.5, 1000);
    
    // Calculate actual net profit with safe position size
    const actualNetProfit = safePositionSize * (NET_TP_PCT / 100);
    
    // Rate limit-aware trade frequency
    // Each trade = 2 orders (entry + exit), so max trades = ordersPerSecond / 2
    const maxTradesPerSecond = minOrdersPerSecond / 2;
    const safeTradesPerSecond = maxTradesPerSecond * 0.4; // 40% capacity for safety
    const maxTradesPerDay = Math.floor(safeTradesPerSecond * 60 * 60 * 8); // 8 hours active trading
    
    // Micro-scalp strategy output
    const microScalpStrategy = {
      targetNetProfit: TARGET_NET_PROFIT,
      requiredPositionSize: microScalpPositionSize,
      safePositionSize: Math.round(safePositionSize * 100) / 100,
      takeProfitPct: MIN_TP_PCT,
      stopLossPct: MIN_TP_PCT * 0.2, // 80/20 rule: SL = 0.06%
      feesPerTrade: (safePositionSize * ROUND_TRIP_FEES_PCT / 100),
      netProfitPerTrade: Math.round(actualNetProfit * 100) / 100,
      maxTradesPerDay,
      estimatedDailyProfit: Math.round(maxTradesPerDay * actualNetProfit * (currentHitRate / 100 || 0.9) * 100) / 100,
      apiRateLimit: `${minOrdersPerSecond} orders/sec on ${limitingExchange}`,
    };

    // Analyze patterns and generate recommendations for ALL 9 FIELDS
    let recommendedSignalThreshold = currentSignalThreshold;
    let recommendedProfitPerTrade = botConfig?.profit_per_trade || 0.50;
    let recommendedStopLoss = recommendedProfitPerTrade * 0.2; // 80/20 rule
    let recommendedDailyStopLoss = Math.max(5, totalCapital * 0.01); // 1% of capital, min $5
    let recommendedAmountPerTrade = Math.max(10, Math.min(totalCapital * 0.02, 500)); // 2% of capital
    let recommendedMinEdge = 0.3; // 0.3% minimum edge
    let tradingStrategy: 'profit' | 'signal' | 'microScalp' = 'profit';
    let summary = '';

    // Strategy adjustments based on hit rate
    if (currentHitRate < 90) {
      // Low hit rate - be more conservative
      recommendedSignalThreshold = Math.min(98, currentSignalThreshold + 3);
      recommendedProfitPerTrade = Math.max(0.30, recommendedProfitPerTrade - 0.10);
      recommendedAmountPerTrade = Math.max(10, recommendedAmountPerTrade * 0.8);
      recommendedMinEdge = 0.5;
      tradingStrategy = 'signal';
      summary = `Conservative mode: Increase signal threshold to ${recommendedSignalThreshold.toFixed(0)}% and reduce position size`;
    } else if (currentHitRate >= 95) {
      // Excellent hit rate - activate micro-scalp mode for $1 profits
      recommendedSignalThreshold = Math.max(90, currentSignalThreshold - 0.5);
      recommendedProfitPerTrade = microScalpStrategy.netProfitPerTrade;
      recommendedAmountPerTrade = microScalpStrategy.safePositionSize;
      recommendedStopLoss = microScalpStrategy.stopLossPct * microScalpStrategy.safePositionSize / 100;
      recommendedMinEdge = 0.25;
      tradingStrategy = 'microScalp';
      summary = `🎯 MICRO-SCALP ACTIVE: $${microScalpStrategy.safePositionSize} position → $${microScalpStrategy.netProfitPerTrade.toFixed(2)}/trade. Max ${microScalpStrategy.maxTradesPerDay} trades/day = $${microScalpStrategy.estimatedDailyProfit}/day potential`;
    } else {
      // Close to target - fine tune
      recommendedSignalThreshold = Math.min(96, currentSignalThreshold + 1);
      recommendedMinEdge = 0.4;
      summary = `Fine-tuning: Signal to ${recommendedSignalThreshold.toFixed(0)}% to reach 95% target for micro-scalp activation`;
    }

    // Recalculate stop loss after profit adjustment (80/20 rule)
    if (tradingStrategy !== 'microScalp') {
      recommendedStopLoss = recommendedProfitPerTrade * 0.2;
    }

    // Calculate daily target based on metrics
    const tradesPerHour = 60 * 60 * 1000 / recommendedIntervalMs;
    const tradingHoursPerDay = 8;
    const estimatedDailyTrades = tradingStrategy === 'microScalp' 
      ? microScalpStrategy.maxTradesPerDay 
      : Math.floor(tradesPerHour * tradingHoursPerDay * (currentHitRate / 100 || 0.9));
    const recommendedDailyTarget = tradingStrategy === 'microScalp'
      ? Math.round(microScalpStrategy.estimatedDailyProfit)
      : Math.round(estimatedDailyTrades * recommendedProfitPerTrade * 0.85);

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

    // COMPLETE RESPONSE WITH ALL 9 FIELDS + MICRO-SCALP STRATEGY
    const response = {
      currentHitRate: Math.round(currentHitRate * 10) / 10,
      targetHitRate: 95,
      currentTradeSpeed: Math.round(1000 / currentTradeInterval * 10) / 10,
      recommendedTradeSpeed: Math.round(safeTradeSpeed * 10) / 10,
      exchangeLimit: minOrdersPerSecond,
      limitingExchange,
      recommendations: {
        // Field 1: Trading Strategy
        tradingStrategy,
        // Field 2: Daily Target
        dailyTarget: Math.max(10, recommendedDailyTarget),
        // Field 3: Profit Per Trade
        profitPerTrade: Math.round(recommendedProfitPerTrade * 100) / 100,
        // Field 4: Amount Per Trade (Position Size)
        amountPerTrade: Math.round(recommendedAmountPerTrade * 100) / 100,
        // Field 5: Trade Speed (Interval)
        tradeIntervalMs: recommendedIntervalMs,
        // Field 6: Daily Stop Loss
        dailyStopLoss: Math.round(recommendedDailyStopLoss * 100) / 100,
        // Field 7: Stop Loss Per Trade
        stopLoss: Math.round(recommendedStopLoss * 100) / 100,
        // Field 8: Min Edge (Signal Threshold)
        signalThreshold: Math.round(recommendedSignalThreshold * 10) / 10,
        minEdge: Math.round(recommendedMinEdge * 100) / 100,
        // Field 9: Focus Pairs
        focusPairs: focusPairs.length > 0 ? focusPairs : ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT'],
      },
      // NEW: Micro-Scalp $1 Profit Strategy
      microScalpStrategy,
      summary,
      confidence,
      analyzedAt: new Date().toISOString(),
      tradesAnalyzed: closedTrades.length,
      avgProfit: Math.round(avgProfit * 100) / 100,
      hitRateHistory,
      metrics: {
        totalCapital,
        estimatedDailyTrades,
        tradesPerHour: Math.round(tradesPerHour * 10) / 10,
      }
    };

    console.log('Strategy analysis complete:', {
      userId,
      currentHitRate: response.currentHitRate,
      recommendedSpeed: response.recommendedTradeSpeed,
      tradesAnalyzed: closedTrades.length,
      allFields: Object.keys(response.recommendations)
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
        tradingStrategy: 'profit',
        dailyTarget: 40,
        profitPerTrade: 0.50,
        amountPerTrade: 100,
        tradeIntervalMs: 60000,
        dailyStopLoss: 5,
        stopLoss: 0.10,
        signalThreshold: 94,
        minEdge: 0.3,
        focusPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']
      },
      summary: 'Analysis pending - insufficient data',
      confidence: 0,
      analyzedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
