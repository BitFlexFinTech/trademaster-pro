import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 signature (hex output)
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC-SHA256 signature (base64 output - for OKX)
async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// HMAC-SHA512 signature (for Kraken)
async function hmacSha512Base64(key: Uint8Array, message: Uint8Array): Promise<string> {
  const keyBuffer = new ArrayBuffer(key.length);
  new Uint8Array(keyBuffer).set(key);
  const msgBuffer = new ArrayBuffer(message.length);
  new Uint8Array(msgBuffer).set(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBuffer, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function testBinance(apiKey: string, apiSecret: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = await hmacSha256(apiSecret, queryString);
    
    const response = await fetch(
      `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': apiKey } }
    );
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.msg || 'Invalid API credentials' };
    }
    
    const data = await response.json();
    const balances = data.balances?.filter((b: { free: string; locked: string }) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0).slice(0, 5);
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testKuCoin(apiKey: string, apiSecret: string, passphrase: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const method = 'GET';
    const endpoint = '/api/v1/accounts';
    const stringToSign = timestamp + method + endpoint;
    const signature = await hmacSha256(apiSecret, stringToSign);
    const passphraseSign = await hmacSha256(apiSecret, passphrase);
    
    const response = await fetch(`https://api.kucoin.com${endpoint}`, {
      headers: {
        'KC-API-KEY': apiKey,
        'KC-API-SIGN': btoa(signature),
        'KC-API-TIMESTAMP': timestamp,
        'KC-API-PASSPHRASE': btoa(passphraseSign),
        'KC-API-KEY-VERSION': '2',
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.msg || 'Invalid API credentials' };
    }
    
    const data = await response.json();
    const balances = data.data?.filter((b: { balance: string }) => parseFloat(b.balance) > 0).slice(0, 5);
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testBybit(apiKey: string, apiSecret: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const queryString = `accountType=UNIFIED`;
    const signPayload = timestamp + apiKey + recvWindow + queryString;
    const signature = await hmacSha256(apiSecret, signPayload);
    
    const response = await fetch(
      `https://api.bybit.com/v5/account/wallet-balance?${queryString}`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-SIGN': signature,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.retMsg || 'Invalid API credentials' };
    }
    
    const data = await response.json();
    if (data.retCode !== 0) {
      return { success: false, error: data.retMsg };
    }
    const balances = data.result?.list?.[0]?.coin?.filter((c: { walletBalance: string }) => parseFloat(c.walletBalance) > 0).slice(0, 5);
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testOKX(apiKey: string, apiSecret: string, passphrase: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance';
    const signPayload = timestamp + method + requestPath;
    // OKX requires base64 encoded signature directly (not hex then base64)
    const signature = await hmacSha256Base64(apiSecret, signPayload);
    
    const response = await fetch(`https://www.okx.com${requestPath}`, {
      headers: {
        'OK-ACCESS-KEY': apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.msg || 'Invalid API credentials' };
    }
    
    const data = await response.json();
    if (data.code !== '0') {
      return { success: false, error: data.msg };
    }
    const balances = data.data?.[0]?.details?.filter((d: { availBal: string }) => parseFloat(d.availBal) > 0).slice(0, 5);
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testKraken(apiKey: string, apiSecret: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const nonce = Date.now() * 1000;
    const postData = `nonce=${nonce}`;
    const path = '/0/private/Balance';
    
    // Kraken signature: HMAC-SHA512(path + SHA256(nonce + postData), base64decode(secret))
    const sha256Hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce + postData));
    const pathBytes = new TextEncoder().encode(path);
    const message = new Uint8Array(pathBytes.length + sha256Hash.byteLength);
    message.set(pathBytes, 0);
    message.set(new Uint8Array(sha256Hash), pathBytes.length);
    
    const secretKey = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
    const signature = await hmacSha512Base64(secretKey, message);
    
    const response = await fetch(`https://api.kraken.com${path}`, {
      method: 'POST',
      headers: {
        'API-Key': apiKey,
        'API-Sign': signature,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: postData,
    });
    
    const data = await response.json();
    if (data.error?.length > 0) {
      return { success: false, error: data.error[0] };
    }
    const balances = Object.entries(data.result || {})
      .filter(([, v]) => parseFloat(v as string) > 0)
      .slice(0, 5)
      .map(([k, v]) => ({ asset: k, balance: v }));
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testHyperliquid(apiKey: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    // Hyperliquid uses wallet address as API key for read operations
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'clearinghouseState', user: apiKey }),
    });
    
    if (!response.ok) {
      return { success: false, error: 'Invalid wallet address' };
    }
    
    const data = await response.json();
    const balances = data.assetPositions?.slice(0, 5) || [];
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function testNexo(apiKey: string, apiSecret: string): Promise<{ success: boolean; balances?: unknown[]; error?: string }> {
  try {
    const timestamp = Date.now().toString();
    const signature = await hmacSha256(apiSecret, timestamp);
    
    // Updated to use Nexo Pro API URL
    const response = await fetch('https://pro-api.nexo.io/api/v1/accountSummary', {
      headers: {
        'X-API-KEY': apiKey,
        'X-API-SIGNATURE': signature,
        'X-API-TIMESTAMP': timestamp,
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Invalid API credentials' };
    }
    
    const data = await response.json();
    const balances = Object.entries(data || {})
      .filter(([k, v]) => k !== 'totalBalance' && parseFloat(v as string) > 0)
      .slice(0, 5)
      .map(([k, v]) => ({ asset: k, balance: v }));
    return { success: true, balances };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { exchange, apiKey, apiSecret, passphrase } = await req.json();

    if (!exchange || !apiKey) {
      throw new Error('Exchange and API key are required');
    }

    console.log(`Testing connection for ${exchange}`);

    let result;
    switch (exchange.toLowerCase()) {
      case 'binance':
        result = await testBinance(apiKey, apiSecret);
        break;
      case 'kucoin':
        if (!passphrase) throw new Error('KuCoin requires a passphrase');
        result = await testKuCoin(apiKey, apiSecret, passphrase);
        break;
      case 'bybit':
        result = await testBybit(apiKey, apiSecret);
        break;
      case 'okx':
        if (!passphrase) throw new Error('OKX requires a passphrase');
        result = await testOKX(apiKey, apiSecret, passphrase);
        break;
      case 'kraken':
        result = await testKraken(apiKey, apiSecret);
        break;
      case 'hyperliquid':
        result = await testHyperliquid(apiKey);
        break;
      case 'nexo':
        result = await testNexo(apiKey, apiSecret);
        break;
      default:
        throw new Error(`Unsupported exchange: ${exchange}`);
    }

    console.log(`Connection test result for ${exchange}:`, result.success ? 'SUCCESS' : 'FAILED');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Connection test error:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
