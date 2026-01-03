import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchPrice, fetchPriceOptimized, type RealtimePriceData } from "../_shared/priceUtils.ts";
import { EXCHANGE_FEES } from "../_shared/exchangeUtils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fee rates per exchange (round-trip) - imported from exchangeUtils
// Note: Using doubled rates for round-trip calculation
const ROUND_TRIP_FEES: Record<string, number> = {
  binance: EXCHANGE_FEES.binance * 2,    // 0.1% × 2 = 0.2%
  bybit: EXCHANGE_FEES.bybit * 2,
  okx: EXCHANGE_FEES.okx * 2,
  kraken: EXCHANGE_FEES.kraken * 2,
};

// Note: fetchPrice, fetchPriceOptimized, RealtimePriceData imported from priceUtils.ts

// Calculate net P&L after fees
function calculateNetPnL(
  entryPrice: number,
  currentPrice: number,
  positionSize: number,
  direction: 'long' | 'short',
  exchange: string
): { grossPnl: number; fees: number; netPnl: number } {
  const priceDiff = direction === 'long'
    ? currentPrice - entryPrice
    : entryPrice - currentPrice;
  
  const percentChange = priceDiff / entryPrice;
  const grossPnl = positionSize * percentChange;
  
  const feeRate = ROUND_TRIP_FEES[exchange.toLowerCase()] || 0.002;
  const fees = positionSize * feeRate;
  
  const netPnl = grossPnl - fees;
  
  return { grossPnl, fees, netPnl };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const profitTarget = body.profitTarget || 1.00; // Default $1 profit target
    const exchange = body.exchange; // Optional: filter by exchange
    const realtimePrices = body.realtimePrices; // WebSocket prices from frontend

    console.log(`[manage-open-trades] Checking open trades for user ${user.id}, target: $${profitTarget}, WS prices: ${realtimePrices ? Object.keys(realtimePrices).length + ' pairs' : 'none'}`);

    // Fetch all open trades
    let query = supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');
    
    if (exchange) {
      query = query.eq('exchange_name', exchange);
    }

    const { data: openTrades, error: tradesError } = await query;

    if (tradesError) {
      throw tradesError;
    }

    if (!openTrades || openTrades.length === 0) {
      return new Response(JSON.stringify({
        message: 'No open trades',
        checked: 0,
        closed: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[manage-open-trades] Found ${openTrades.length} open trades`);

    const closedTrades: any[] = [];
    const updatedTrades: any[] = [];
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    for (const trade of openTrades) {
      const symbol = trade.pair.replace('/', '');
      // Use optimized price fetching (WebSocket first, REST fallback)
      const currentPrice = await fetchPriceOptimized(symbol, realtimePrices);
      
      if (currentPrice <= 0) {
        console.log(`[manage-open-trades] Skipping ${trade.pair}: could not fetch price`);
        continue;
      }

      const { grossPnl, fees, netPnl } = calculateNetPnL(
        trade.entry_price,
        currentPrice,
        trade.amount,
        trade.direction,
        trade.exchange_name || 'binance'
      );

      console.log(`[manage-open-trades] ${trade.pair} ${trade.direction}: entry=${trade.entry_price}, current=${currentPrice}, netPnL=$${netPnl.toFixed(4)}`);

      // Use trade's target_profit_usd - $1 for SPOT, $3 for LEVERAGE
      const tradeTargetProfit = trade.target_profit_usd || 1.00;
      const MINIMUM_PROFIT_TARGET = Math.max(tradeTargetProfit, 1.00);
      const effectiveTarget = MINIMUM_PROFIT_TARGET;
      
      // ============ STALE POSITION FORCE-CLOSE (>24 HOURS) ============
      const MAX_TRADE_AGE_HOURS = 24;
      const tradeAgeMs = Date.now() - new Date(trade.created_at).getTime();
      const tradeAgeHours = tradeAgeMs / (1000 * 60 * 60);

      if (tradeAgeHours > MAX_TRADE_AGE_HOURS) {
        console.log(`[manage-open-trades] ⏰ STALE TRADE: ${trade.pair} open for ${tradeAgeHours.toFixed(1)} hours - force closing`);

        // Force close stale trade
        const { error: updateError } = await supabaseService
          .from('trades')
          .update({
            status: 'closed',
            exit_price: currentPrice,
            profit_loss: netPnl,
            profit_percentage: ((currentPrice - trade.entry_price) / trade.entry_price) * 100,
            closed_at: new Date().toISOString(),
            holding_for_profit: false,
            notes: `Auto-closed after ${tradeAgeHours.toFixed(1)} hours (stale position protection)`,
          })
          .eq('id', trade.id);

        if (updateError) {
          console.error(`[manage-open-trades] Failed to force-close stale trade ${trade.id}:`, updateError);
          continue;
        }

        // Insert audit log for stale closure
        await supabaseService.from('profit_audit_log').insert({
          user_id: user.id,
          trade_id: trade.id,
          action: 'force_closed_stale',
          symbol: trade.pair,
          exchange: trade.exchange_name || 'binance',
          entry_price: trade.entry_price,
          current_price: currentPrice,
          quantity: trade.amount,
          gross_pnl: grossPnl,
          fees: fees,
          net_pnl: netPnl,
          success: true,
        });

        closedTrades.push({
          id: trade.id,
          pair: trade.pair,
          direction: trade.direction,
          netPnl,
          reason: 'stale_position',
        });

        console.log(`[manage-open-trades] ✅ Force-closed stale trade ${trade.pair} with netPnL=$${netPnl.toFixed(2)}`);
        continue; // Skip to next trade
      }

      // Check if profit target is reached
      if (netPnl >= effectiveTarget) {
        console.log(`[manage-open-trades] ✅ TARGET HIT: ${trade.pair} netPnL=$${netPnl.toFixed(2)} >= $${effectiveTarget}`);

        // Calculate trade duration for speed analytics
        const durationSeconds = Math.round((Date.now() - new Date(trade.created_at).getTime()) / 1000);
        const hourOfDay = new Date().getUTCHours();

        // Close the trade
        const { error: updateError } = await supabaseService
          .from('trades')
          .update({
            status: 'closed',
            exit_price: currentPrice,
            profit_loss: netPnl,
            profit_percentage: ((currentPrice - trade.entry_price) / trade.entry_price) * 100,
            closed_at: new Date().toISOString(),
            holding_for_profit: false,
            duration_seconds: durationSeconds,
          })
          .eq('id', trade.id);

        if (updateError) {
          console.error(`[manage-open-trades] Failed to close trade ${trade.id}:`, updateError);
          continue;
        }

        // Update speed analytics for learning
        try {
          const symbol = trade.pair.replace('/USDT', '').replace('/', '');
          const { data: existing } = await supabaseService
            .from('trade_speed_analytics')
            .select('id, avg_duration_seconds, sample_size, win_rate')
            .eq('user_id', user.id)
            .eq('symbol', symbol)
            .eq('hour_of_day', hourOfDay)
            .maybeSingle();

          if (existing) {
            const newSampleSize = (existing.sample_size || 0) + 1;
            const oldWins = Math.round((existing.win_rate || 0) / 100 * (existing.sample_size || 0));
            const newWins = oldWins + (netPnl > 0 ? 1 : 0);
            const newWinRate = (newWins / newSampleSize) * 100;
            const newAvgDuration = Math.round(
              ((existing.avg_duration_seconds || 0) * (existing.sample_size || 0) + durationSeconds) / newSampleSize
            );

            await supabaseService
              .from('trade_speed_analytics')
              .update({
                avg_duration_seconds: newAvgDuration,
                sample_size: newSampleSize,
                win_rate: newWinRate,
                last_updated: new Date().toISOString(),
              })
              .eq('id', existing.id);
          } else {
            await supabaseService
              .from('trade_speed_analytics')
              .insert({
                user_id: user.id,
                symbol,
                timeframe: '1m',
                avg_duration_seconds: durationSeconds,
                sample_size: 1,
                win_rate: netPnl > 0 ? 100 : 0,
                hour_of_day: hourOfDay,
                day_of_week: new Date().getDay(),
              });
          }
          console.log(`[manage-open-trades] 📊 Updated speed analytics: ${symbol} duration=${durationSeconds}s`);
        } catch (analyticsError) {
          console.warn('[manage-open-trades] Failed to update speed analytics:', analyticsError);
        }

        // Insert audit log
        await supabaseService.from('profit_audit_log').insert({
          user_id: user.id,
          trade_id: trade.id,
          action: 'profit_target_hit',
          symbol: trade.pair,
          exchange: trade.exchange_name || 'binance',
          entry_price: trade.entry_price,
          current_price: currentPrice,
          quantity: trade.amount,
          gross_pnl: grossPnl,
          fees: fees,
          net_pnl: netPnl,
          success: true,
        });

        closedTrades.push({
          id: trade.id,
          pair: trade.pair,
          direction: trade.direction,
          netPnl,
          durationSeconds,
        });

        // Broadcast trade_closed event
        await supabase.channel('trading-events').send({
          type: 'broadcast',
          event: 'trade_closed',
          payload: {
            tradeId: trade.id,
            pair: trade.pair,
            direction: trade.direction,
            netPnl,
            exchange: trade.exchange_name,
            durationSeconds,
          },
        });

      } else if (netPnl > 0 && !trade.holding_for_profit) {
        // Mark as holding for profit if profitable but not at target
        await supabaseService
          .from('trades')
          .update({ holding_for_profit: true })
          .eq('id', trade.id);

        // Insert holding audit log
        await supabaseService.from('profit_audit_log').insert({
          user_id: user.id,
          trade_id: trade.id,
          action: 'holding_for_profit',
          symbol: trade.pair,
          exchange: trade.exchange_name || 'binance',
          entry_price: trade.entry_price,
          current_price: currentPrice,
          quantity: trade.amount,
          gross_pnl: grossPnl,
          fees: fees,
          net_pnl: netPnl,
          success: true,
        });

        updatedTrades.push({
          id: trade.id,
          pair: trade.pair,
          netPnl,
          status: 'holding',
        });
      }
    }

    // Trigger balance sync if any trades were closed
    if (closedTrades.length > 0) {
      console.log(`[manage-open-trades] Triggering balance sync after closing ${closedTrades.length} trades`);
      
      // Broadcast balance sync request
      await supabase.channel('trading-events').send({
        type: 'broadcast',
        event: 'balance_sync_requested',
        payload: {
          userId: user.id,
          closedCount: closedTrades.length,
          totalProfit: closedTrades.reduce((sum, t) => sum + t.netPnl, 0),
        },
      });
    }

    return new Response(JSON.stringify({
      message: 'Trades checked successfully',
      checked: openTrades.length,
      closed: closedTrades.length,
      holding: updatedTrades.length,
      closedTrades,
      totalProfit: closedTrades.reduce((sum, t) => sum + t.netPnl, 0),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[manage-open-trades] Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to manage trades' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
