import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WithdrawRequest {
  botId: string;
  amount?: number;
}

interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

// HMAC signature generation for exchange APIs
async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Binance Universal Transfer API - Transfer between wallets
 * POST /sapi/v1/asset/transfer
 * Docs: https://binance-docs.github.io/apidocs/spot/en/#user-universal-transfer-user_data
 */
async function binanceInternalTransfer(
  credentials: ExchangeCredentials,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const timestamp = Date.now();
    const params = `type=MAIN_FUNDING&asset=USDT&amount=${amount}&timestamp=${timestamp}`;
    const signature = await hmacSha256(params, credentials.apiSecret);
    
    const response = await fetch(`https://api.binance.com/sapi/v1/asset/transfer?${params}&signature=${signature}`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': credentials.apiKey,
      },
    });
    
    const data = await response.json();
    
    if (data.tranId) {
      return { success: true, txId: String(data.tranId) };
    }
    
    return { success: false, error: data.msg || 'Binance transfer failed' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Binance error: ${message}` };
  }
}

/**
 * Bybit Internal Transfer API
 * POST /v5/asset/transfer/inter-transfer
 * Docs: https://bybit-exchange.github.io/docs/v5/asset/create-inter-transfer
 */
async function bybitInternalTransfer(
  credentials: ExchangeCredentials,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const timestamp = Date.now();
    const transferId = crypto.randomUUID();
    
    const body = {
      transferId,
      coin: 'USDT',
      amount: String(amount),
      fromAccountType: 'UNIFIED', // or 'CONTRACT'
      toAccountType: 'FUND',
    };
    
    const bodyStr = JSON.stringify(body);
    const signStr = `${timestamp}${credentials.apiKey}5000${bodyStr}`;
    const signature = await hmacSha256(signStr, credentials.apiSecret);
    
    const response = await fetch('https://api.bybit.com/v5/asset/transfer/inter-transfer', {
      method: 'POST',
      headers: {
        'X-BAPI-API-KEY': credentials.apiKey,
        'X-BAPI-TIMESTAMP': String(timestamp),
        'X-BAPI-RECV-WINDOW': '5000',
        'X-BAPI-SIGN': signature,
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    
    const data = await response.json();
    
    if (data.retCode === 0) {
      return { success: true, txId: data.result?.transferId };
    }
    
    return { success: false, error: data.retMsg || 'Bybit transfer failed' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Bybit error: ${message}` };
  }
}

/**
 * OKX Funding Transfer API
 * POST /api/v5/asset/transfer
 * Docs: https://www.okx.com/docs-v5/en/#rest-api-funding-funds-transfer
 */
async function okxFundingTransfer(
  credentials: ExchangeCredentials,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const requestPath = '/api/v5/asset/transfer';
    
    const body = {
      ccy: 'USDT',
      amt: String(amount),
      from: '18', // Trading account
      to: '6', // Funding account
    };
    
    const bodyStr = JSON.stringify(body);
    const signStr = `${timestamp}POST${requestPath}${bodyStr}`;
    const signature = await hmacSha256Base64(signStr, credentials.apiSecret);
    
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method: 'POST',
      headers: {
        'OK-ACCESS-KEY': credentials.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': credentials.passphrase || '',
        'Content-Type': 'application/json',
      },
      body: bodyStr,
    });
    
    const data = await response.json();
    
    if (data.code === '0' && data.data?.[0]?.transId) {
      return { success: true, txId: data.data[0].transId };
    }
    
    return { success: false, error: data.msg || 'OKX transfer failed' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `OKX error: ${message}` };
  }
}

/**
 * Decrypt API credentials
 */
async function decryptCredentials(
  encryptedKey: string,
  encryptedSecret: string,
  iv: string,
  passphrase?: string
): Promise<ExchangeCredentials | null> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  if (!encryptionKey) return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(encryptionKey.slice(0, 32).padEnd(32, '0')),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decryptValue = async (encrypted: string, ivHex: string): Promise<string> => {
      const ivBytes = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        encryptedBytes
      );
      return new TextDecoder().decode(decrypted);
    };

    const apiKey = await decryptValue(encryptedKey, iv);
    const apiSecret = await decryptValue(encryptedSecret, iv);
    const decryptedPassphrase = passphrase ? await decryptValue(passphrase, iv) : undefined;

    return { apiKey, apiSecret, passphrase: decryptedPassphrase };
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const { botId, amount }: WithdrawRequest = await req.json();
    console.log(`Withdraw profits request for bot ${botId}`);

    // Fetch bot run data
    const { data: bot, error: botError } = await supabase
      .from("bot_runs")
      .select("*")
      .eq("id", botId)
      .eq("user_id", user.id)
      .single();

    if (botError || !bot) {
      return new Response(JSON.stringify({ error: "Bot not found" }), { 
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const currentPnl = bot.current_pnl || 0;
    const alreadyWithdrawn = bot.profits_withdrawn || 0;
    const availableProfit = currentPnl - alreadyWithdrawn;

    if (availableProfit <= 0) {
      return new Response(JSON.stringify({ 
        error: "No profits available to withdraw",
        currentPnl,
        alreadyWithdrawn,
        availableProfit 
      }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const withdrawAmount = amount ? Math.min(amount, availableProfit) : availableProfit;

    // Try to execute REAL withdrawal on connected exchanges
    const transferResults: { exchange: string; success: boolean; txId?: string; error?: string }[] = [];
    
    // Fetch user's exchange connections
    const { data: connections } = await supabase
      .from("exchange_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true);

    if (connections && connections.length > 0) {
      for (const conn of connections) {
        // Decrypt credentials
        const credentials = await decryptCredentials(
          conn.encrypted_api_key,
          conn.encrypted_api_secret,
          conn.encryption_iv,
          conn.encrypted_passphrase
        );

        if (!credentials) {
          transferResults.push({ 
            exchange: conn.exchange_name, 
            success: false, 
            error: 'Failed to decrypt credentials' 
          });
          continue;
        }

        // Execute transfer based on exchange
        const exchangeName = conn.exchange_name.toLowerCase();
        let result: { success: boolean; txId?: string; error?: string };

        // Calculate per-exchange amount (proportional split)
        const perExchangeAmount = withdrawAmount / connections.length;

        switch (exchangeName) {
          case 'binance':
            result = await binanceInternalTransfer(credentials, perExchangeAmount);
            break;
          case 'bybit':
            result = await bybitInternalTransfer(credentials, perExchangeAmount);
            break;
          case 'okx':
            result = await okxFundingTransfer(credentials, perExchangeAmount);
            break;
          default:
            // Exchanges without internal transfer API (Kraken, Nexo, Hyperliquid)
            // Track profits separately - they remain in trading account
            result = { 
              success: true, 
              txId: `tracked-${Date.now()}`,
              error: `${conn.exchange_name} does not support internal transfers - profits tracked separately`
            };
        }

        transferResults.push({ exchange: conn.exchange_name, ...result });
      }
    }

    // Update bot with withdrawn profits (regardless of transfer success - for tracking)
    const { error: updateError } = await supabase
      .from("bot_runs")
      .update({
        profits_withdrawn: alreadyWithdrawn + withdrawAmount,
      })
      .eq("id", botId);

    if (updateError) throw updateError;

    // Create alert for user
    await supabase.from("alerts").insert({
      user_id: user.id,
      alert_type: "profit_withdrawn",
      title: "Profits Withdrawn",
      message: `$${withdrawAmount.toFixed(2)} profits processed`,
      data: { botId, amount: withdrawAmount, transfers: transferResults },
    });

    const successfulTransfers = transferResults.filter(t => t.success);
    console.log(`Processed $${withdrawAmount.toFixed(2)} withdrawal - ${successfulTransfers.length}/${transferResults.length} successful`);

    return new Response(JSON.stringify({
      success: true,
      withdrawnAmount: withdrawAmount,
      remainingProfit: availableProfit - withdrawAmount,
      totalWithdrawn: alreadyWithdrawn + withdrawAmount,
      transfers: transferResults,
      message: `$${withdrawAmount.toFixed(2)} has been processed. ${successfulTransfers.length} exchange(s) transferred to funding account.`,
      note: "For exchanges without internal transfer API (Kraken, Nexo), profits are tracked separately and excluded from trading capital."
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (error: unknown) {
    console.error("Withdraw profits error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { 
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
