import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt API secret using AES-256-GCM
async function decryptSecret(encryptedData: string, iv: string, key: string): Promise<string> {
  try {
    const keyBytes = new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32));
    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
    const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      encryptedBytes
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt secret');
  }
}

// HMAC-SHA256 signature
async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fetch Binance balances
async function fetchBinanceBalances(apiKey: string, apiSecret: string): Promise<{ asset: string; amount: number }[]> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, queryString);

    const response = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error('Binance API error:', await response.text());
      return [];
    }

    const data = await response.json();
    return (data.balances || [])
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        amount: parseFloat(b.free) + parseFloat(b.locked),
      }));
  } catch (error) {
    console.error('Binance fetch error:', error);
    return [];
  }
}

// Fetch Bybit balances
async function fetchBybitBalances(apiKey: string, apiSecret: string): Promise<{ asset: string; amount: number }[]> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const params = `accountType=UNIFIED`;
    const signStr = `${timestamp}${apiKey}${recvWindow}${params}`;
    const signature = await hmacSha256(apiSecret, signStr);

    const response = await fetch(
      `https://api.bybit.com/v5/account/wallet-balance?${params}`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-SIGN': signature,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      }
    );

    if (!response.ok) {
      console.error('Bybit API error:', await response.text());
      return [];
    }

    const data = await response.json();
    const coins = data.result?.list?.[0]?.coin || [];
    return coins
      .filter((c: any) => parseFloat(c.walletBalance) > 0)
      .map((c: any) => ({
        asset: c.coin,
        amount: parseFloat(c.walletBalance),
      }));
  } catch (error) {
    console.error('Bybit fetch error:', error);
    return [];
  }
}

// Fetch OKX balances
async function fetchOkxBalances(apiKey: string, apiSecret: string, passphrase: string): Promise<{ asset: string; amount: number }[]> {
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance';
    const signStr = `${timestamp}${method}${requestPath}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(apiSecret);
    const msgData = encoder.encode(signStr);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

    const response = await fetch(`https://www.okx.com${requestPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signatureB64,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
      },
    });

    if (!response.ok) {
      console.error('OKX API error:', await response.text());
      return [];
    }

    const data = await response.json();
    const details = data.data?.[0]?.details || [];
    return details
      .filter((d: any) => parseFloat(d.cashBal) > 0)
      .map((d: any) => ({
        asset: d.ccy,
        amount: parseFloat(d.cashBal),
      }));
  } catch (error) {
    console.error('OKX fetch error:', error);
    return [];
  }
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
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;

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

    console.log(`Syncing balances for user: ${user.id}`);

    // Fetch connected exchanges
    const { data: connections, error: connError } = await supabase
      .from('exchange_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_connected', true);

    if (connError) {
      throw connError;
    }

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: 'No connected exchanges', synced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${connections.length} connected exchanges`);

    const allBalances: { exchange: string; asset: string; amount: number }[] = [];

    for (const conn of connections) {
      if (!conn.encrypted_api_secret || !conn.encryption_iv) {
        console.log(`Skipping ${conn.exchange_name}: missing credentials`);
        continue;
      }

      // Check for encrypted API key - if missing, user needs to re-connect
      if (!conn.encrypted_api_key) {
        console.log(`Skipping ${conn.exchange_name}: API key needs to be re-connected (missing encrypted_api_key)`);
        continue;
      }

      try {
        const apiKey = await decryptSecret(conn.encrypted_api_key, conn.encryption_iv, encryptionKey);
        const apiSecret = await decryptSecret(conn.encrypted_api_secret, conn.encryption_iv, encryptionKey);

        let balances: { asset: string; amount: number }[] = [];

        switch (conn.exchange_name.toLowerCase()) {
          case 'binance':
            balances = await fetchBinanceBalances(apiKey, apiSecret);
            break;
          case 'bybit':
            balances = await fetchBybitBalances(apiKey, apiSecret);
            break;
          case 'okx':
            if (conn.encrypted_passphrase) {
              const passphrase = await decryptSecret(conn.encrypted_passphrase, conn.encryption_iv, encryptionKey);
              balances = await fetchOkxBalances(apiKey, apiSecret, passphrase);
            }
            break;
          // Add more exchanges as needed
          default:
            console.log(`Exchange ${conn.exchange_name} not yet supported for balance sync`);
        }

        balances.forEach(b => {
          allBalances.push({ exchange: conn.exchange_name, asset: b.asset, amount: b.amount });
        });

        console.log(`Fetched ${balances.length} balances from ${conn.exchange_name}`);
      } catch (err) {
        console.error(`Error fetching from ${conn.exchange_name}:`, err);
      }
    }

    // Use service role for upserting
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let synced = 0;
    for (const balance of allBalances) {
      // Check if holding exists
      const { data: existing } = await supabaseService
        .from('portfolio_holdings')
        .select('id')
        .eq('user_id', user.id)
        .eq('asset_symbol', balance.asset)
        .eq('exchange_name', balance.exchange)
        .single();

      if (existing) {
        // Update
        await supabaseService
          .from('portfolio_holdings')
          .update({ quantity: balance.amount, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Insert
        await supabaseService
          .from('portfolio_holdings')
          .insert({
            user_id: user.id,
            asset_symbol: balance.asset,
            quantity: balance.amount,
            exchange_name: balance.exchange,
            average_buy_price: 0, // Unknown from exchange
          });
      }
      synced++;
    }

    console.log(`Synced ${synced} holdings`);

    return new Response(JSON.stringify({ 
      message: 'Balances synced successfully', 
      synced,
      exchanges: connections.map(c => c.exchange_name),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: 'Failed to sync balances' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
