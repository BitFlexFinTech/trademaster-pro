import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fee rates per exchange (round-trip)
const EXCHANGE_FEES: Record<string, number> = {
  binance: 0.002,    // 0.1% × 2 = 0.2%
  bybit: 0.002,
  okx: 0.0016,
  kraken: 0.0032,
};

// Fetch current price from Binance
async function fetchPrice(symbol: string): Promise<number> {
  try {
    const normalizedSymbol = symbol.replace('/', '');
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${normalizedSymbol}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return parseFloat(data.price) || 0;
  } catch {
    return 0;
  }
}

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
  
  const feeRate = EXCHANGE_FEES[exchange.toLowerCase()] || 0.002;
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

    console.log(`[manage-open-trades] Checking open trades for user ${user.id}, target: $${profitTarget}`);

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
      const currentPrice = await fetchPrice(symbol);
      
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

      // Check if profit target is reached
      if (netPnl >= profitTarget) {
        console.log(`[manage-open-trades] ✅ TARGET HIT: ${trade.pair} netPnL=$${netPnl.toFixed(2)} >= $${profitTarget}`);

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
          })
          .eq('id', trade.id);

        if (updateError) {
          console.error(`[manage-open-trades] Failed to close trade ${trade.id}:`, updateError);
          continue;
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
