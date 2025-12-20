import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface OpenTrade {
  id: string;
  pair: string;
  amount: number;
  entry_price: number;
  user_id: string;
  created_at: string;
}

interface PositionDiscrepancy {
  asset: string;
  expectedQty: number;
  expectedValue: number;
  actualQty: number;
  actualValue: number;
  discrepancyQty: number;
  discrepancyValue: number;
  discrepancyPercent: number;
  orphanTradeCount: number;
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  try {
    const cleanSymbol = symbol.replace('/', '').toUpperCase();
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanSymbol}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return parseFloat(data.price) || 0;
  } catch {
    return 0;
  }
}

async function fetchBinanceBalances(apiKey: string, apiSecret: string): Promise<Record<string, number>> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    const encoder = new TextEncoder();
    const key = encoder.encode(apiSecret);
    const message = encoder.encode(queryString);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signatureHex}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );

    if (!response.ok) return {};
    
    const data = await response.json();
    const balances: Record<string, number> = {};
    
    for (const balance of data.balances || []) {
      const free = parseFloat(balance.free) || 0;
      if (free > 0) {
        balances[balance.asset] = free;
      }
    }
    
    return balances;
  } catch (err) {
    console.error('Failed to fetch Binance balances:', err);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action } = await req.json();
    console.log(`[reconcile-balances] User ${user.id} action: ${action}`);

    // Get user's exchange credentials
    const { data: connections } = await supabase
      .from('exchange_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_connected', true);

    const binanceConnection = connections?.find(c => c.exchange_name === 'Binance');
    
    // Get all open trades
    const { data: openTrades, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');

    if (tradesError) throw tradesError;

    console.log(`[reconcile-balances] Found ${openTrades?.length || 0} open trades`);

    // Calculate expected positions by asset
    const expectedPositions: Record<string, { qty: number; value: number; trades: OpenTrade[] }> = {};
    
    for (const trade of (openTrades || []) as OpenTrade[]) {
      const asset = trade.pair.split('/')[0];
      const expectedQty = trade.amount / trade.entry_price;
      
      if (!expectedPositions[asset]) {
        expectedPositions[asset] = { qty: 0, value: 0, trades: [] };
      }
      expectedPositions[asset].qty += expectedQty;
      expectedPositions[asset].value += trade.amount;
      expectedPositions[asset].trades.push(trade);
    }

    // Fetch actual balances from exchange
    let actualBalances: Record<string, number> = {};
    
    if (binanceConnection?.encrypted_api_key && binanceConnection?.encrypted_api_secret) {
      const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");
      if (ENCRYPTION_KEY) {
        try {
          // Decrypt credentials
          const decryptedKey = await decryptData(binanceConnection.encrypted_api_key, ENCRYPTION_KEY, binanceConnection.encryption_iv);
          const decryptedSecret = await decryptData(binanceConnection.encrypted_api_secret, ENCRYPTION_KEY, binanceConnection.encryption_iv);
          
          if (decryptedKey && decryptedSecret) {
            actualBalances = await fetchBinanceBalances(decryptedKey, decryptedSecret);
          }
        } catch (err) {
          console.error('Failed to decrypt credentials:', err);
        }
      }
    }

    // Calculate discrepancies
    const discrepancies: PositionDiscrepancy[] = [];
    const orphanTrades: Array<{
      id: string;
      pair: string;
      amount: number;
      entryPrice: number;
      expectedQty: number;
      currentPrice: number;
      estimatedPnL: number;
    }> = [];
    
    let totalExpectedValue = 0;
    let totalActualValue = 0;

    for (const [asset, position] of Object.entries(expectedPositions)) {
      const currentPrice = await fetchBinancePrice(`${asset}USDT`);
      const actualQty = actualBalances[asset] || 0;
      const actualValue = actualQty * currentPrice;
      const expectedValue = position.qty * currentPrice;
      
      totalExpectedValue += expectedValue;
      totalActualValue += actualValue;

      const discrepancyQty = position.qty - actualQty;
      const discrepancyValue = expectedValue - actualValue;
      const discrepancyPercent = expectedValue > 0 
        ? Math.abs(discrepancyValue / expectedValue * 100) 
        : 0;

      // If there's a significant discrepancy, these trades are orphans
      if (discrepancyPercent > 50 && actualQty < position.qty * 0.1) {
        for (const trade of position.trades) {
          const tradeQty = trade.amount / trade.entry_price;
          const estimatedPnL = (currentPrice - trade.entry_price) * tradeQty - (trade.amount * 0.002);
          
          orphanTrades.push({
            id: trade.id,
            pair: trade.pair,
            amount: trade.amount,
            entryPrice: trade.entry_price,
            expectedQty: tradeQty,
            currentPrice,
            estimatedPnL,
          });
        }
      }

      discrepancies.push({
        asset,
        expectedQty: position.qty,
        expectedValue,
        actualQty,
        actualValue,
        discrepancyQty,
        discrepancyValue,
        discrepancyPercent,
        orphanTradeCount: position.trades.length,
      });
    }

    const totalDiscrepancy = totalExpectedValue - totalActualValue;
    const discrepancyPercent = totalExpectedValue > 0 
      ? Math.abs(totalDiscrepancy / totalExpectedValue * 100) 
      : 0;
    const hasSignificantMismatch = discrepancyPercent > 10;

    console.log(`[reconcile-balances] Expected: $${totalExpectedValue.toFixed(2)}, Actual: $${totalActualValue.toFixed(2)}, Discrepancy: ${discrepancyPercent.toFixed(1)}%`);
    console.log(`[reconcile-balances] Found ${orphanTrades.length} orphan trades`);

    // Handle cleanup action
    if (action === 'cleanup') {
      let closedCount = 0;
      let totalPnL = 0;

      for (const orphan of orphanTrades) {
        try {
          // Close the orphan trade with estimated P&L
          const { error: updateError } = await supabase
            .from('trades')
            .update({
              status: 'closed',
              exit_price: orphan.currentPrice,
              profit_loss: orphan.estimatedPnL,
              profit_percentage: (orphan.estimatedPnL / orphan.amount) * 100,
              closed_at: new Date().toISOString(),
            })
            .eq('id', orphan.id);

          if (updateError) {
            console.error(`Failed to close orphan trade ${orphan.id}:`, updateError);
            continue;
          }

          // Log the reconciliation close
          await supabase.from('profit_audit_log').insert({
            user_id: user.id,
            trade_id: orphan.id,
            action: 'reconciliation_close',
            symbol: orphan.pair.replace('/', ''),
            entry_price: orphan.entryPrice,
            current_price: orphan.currentPrice,
            quantity: orphan.expectedQty,
            net_pnl: orphan.estimatedPnL,
            success: true,
            exchange: 'binance',
            error_message: 'No matching exchange position found - orphan trade cleanup',
          });

          closedCount++;
          totalPnL += orphan.estimatedPnL;
          console.log(`[reconcile-balances] Closed orphan trade ${orphan.id}: ${orphan.pair}, P&L: $${orphan.estimatedPnL.toFixed(2)}`);
        } catch (err) {
          console.error(`Error closing orphan trade ${orphan.id}:`, err);
        }
      }

      // Create alert for the cleanup
      if (closedCount > 0) {
        await supabase.from('alerts').insert({
          user_id: user.id,
          alert_type: 'reconciliation',
          title: 'Orphan Trades Cleaned Up',
          message: `${closedCount} orphan trades closed with estimated P&L of $${totalPnL.toFixed(2)}`,
          data: { closedCount, totalPnL, orphanTrades },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        closedCount,
        totalPnL,
        message: `Cleaned up ${closedCount} orphan trades`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return check results
    return new Response(JSON.stringify({
      discrepancies,
      orphanTrades,
      totalExpectedValue,
      totalActualValue,
      totalDiscrepancy,
      discrepancyPercent,
      orphanTradeCount: orphanTrades.length,
      hasSignificantMismatch,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[reconcile-balances] Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Decryption helper
async function decryptData(encryptedData: string, key: string, ivHex: string | null): Promise<string> {
  if (!ivHex) return '';
  
  try {
    const keyBuffer = new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32));
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyBuffer, { name: 'AES-CBC' }, false, ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv }, cryptoKey, encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}
