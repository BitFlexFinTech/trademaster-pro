import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface OpenTrade {
  id: string;
  user_id: string;
  pair: string;
  amount: number;
  entry_price: number;
  direction: string;
  exchange_name: string;
  created_at: string;
}

interface ReconciliationResult {
  userId: string;
  openTrades: number;
  orphanTradesClosed: number;
  totalEstimatedPnL: number;
  discrepancyDetected: boolean;
  alertCreated: boolean;
}

async function fetchCurrentPrice(symbol: string): Promise<number> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.replace('/', '')}`);
    if (response.ok) {
      const data = await response.json();
      return parseFloat(data.price);
    }
  } catch (err) {
    console.error(`Failed to fetch price for ${symbol}:`, err);
  }
  return 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[DAILY-RECONCILIATION] Starting daily reconciliation job...');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const results: ReconciliationResult[] = [];

  try {
    // Get all open trades grouped by user
    const { data: openTrades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'open')
      .order('user_id');

    if (tradesError) throw tradesError;

    if (!openTrades || openTrades.length === 0) {
      console.log('[DAILY-RECONCILIATION] No open trades found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No open trades to reconcile',
        results: [] 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[DAILY-RECONCILIATION] Found ${openTrades.length} open trades`);

    // Group trades by user
    const tradesByUser: Record<string, OpenTrade[]> = {};
    for (const trade of openTrades) {
      if (!tradesByUser[trade.user_id]) {
        tradesByUser[trade.user_id] = [];
      }
      tradesByUser[trade.user_id].push(trade);
    }

    // Process each user
    for (const [userId, userTrades] of Object.entries(tradesByUser)) {
      console.log(`[DAILY-RECONCILIATION] Processing user ${userId} with ${userTrades.length} open trades`);

      let orphanTradesClosed = 0;
      let totalEstimatedPnL = 0;
      let discrepancyDetected = false;

      // Check each trade - if it's been open for more than 24 hours with no corresponding exchange position,
      // it's likely an orphan trade
      const now = new Date();
      const staleThresholdMs = 24 * 60 * 60 * 1000; // 24 hours

      for (const trade of userTrades) {
        const tradeAge = now.getTime() - new Date(trade.created_at).getTime();
        
        // Only process trades older than 24 hours as potential orphans
        if (tradeAge > staleThresholdMs) {
          const currentPrice = await fetchCurrentPrice(trade.pair);
          
          if (currentPrice > 0) {
            // Calculate estimated P&L
            const expectedQty = trade.amount / trade.entry_price;
            const estimatedPnL = trade.direction === 'long'
              ? (currentPrice - trade.entry_price) * expectedQty
              : (trade.entry_price - currentPrice) * expectedQty;
            const fees = trade.amount * 0.002; // 0.1% entry + exit
            const netPnL = estimatedPnL - fees;

            // Mark as orphan and close
            const { error: updateError } = await supabase
              .from('trades')
              .update({
                status: 'closed',
                exit_price: currentPrice,
                profit_loss: netPnL,
                profit_percentage: (netPnL / trade.amount) * 100,
                closed_at: new Date().toISOString(),
              })
              .eq('id', trade.id);

            if (!updateError) {
              orphanTradesClosed++;
              totalEstimatedPnL += netPnL;
              discrepancyDetected = true;

              // Log to profit_audit_log
              await supabase.from('profit_audit_log').insert({
                user_id: userId,
                trade_id: trade.id,
                action: 'daily_reconciliation_close',
                symbol: trade.pair.replace('/', ''),
                exchange: trade.exchange_name || 'binance',
                entry_price: trade.entry_price,
                current_price: currentPrice,
                quantity: expectedQty,
                gross_pnl: estimatedPnL,
                fees: fees,
                net_pnl: netPnL,
                success: true,
                error_message: `Stale trade (${Math.floor(tradeAge / 3600000)}h old) closed by daily reconciliation`,
              });
            }
          }
        }
      }

      // Create alert if discrepancies were found
      let alertCreated = false;
      if (discrepancyDetected) {
        const { error: alertError } = await supabase.from('alerts').insert({
          user_id: userId,
          alert_type: 'reconciliation',
          title: 'Daily Reconciliation Complete',
          message: `Closed ${orphanTradesClosed} stale trades. Estimated P&L: $${totalEstimatedPnL.toFixed(2)}`,
          data: {
            orphanTradesClosed,
            totalEstimatedPnL,
            timestamp: new Date().toISOString(),
          },
        });

        alertCreated = !alertError;
      }

      results.push({
        userId,
        openTrades: userTrades.length,
        orphanTradesClosed,
        totalEstimatedPnL,
        discrepancyDetected,
        alertCreated,
      });
    }

    const totalOrphansClosed = results.reduce((sum, r) => sum + r.orphanTradesClosed, 0);
    const totalPnL = results.reduce((sum, r) => sum + r.totalEstimatedPnL, 0);

    console.log(`[DAILY-RECONCILIATION] Complete. Closed ${totalOrphansClosed} orphan trades. Total P&L: $${totalPnL.toFixed(2)}`);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        usersProcessed: results.length,
        totalOpenTrades: openTrades.length,
        totalOrphansClosed,
        totalEstimatedPnL: totalPnL,
      },
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[DAILY-RECONCILIATION] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
