import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 signature for Binance/Bybit
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// HMAC-SHA256 Base64 for OKX
async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Decrypt API secret (base64 IV)
async function decryptSecret(encrypted: string, iv: string, encryptionKey: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, cryptoKey, encryptedBytes);
  return new TextDecoder().decode(decrypted);
}

// Transfer types for Binance Universal Transfer
type BinanceTransferType = 
  | 'MAIN_UMFUTURE' | 'UMFUTURE_MAIN'     // Spot <-> Futures
  | 'MAIN_FUNDING' | 'FUNDING_MAIN'        // Spot <-> Funding
  | 'FUNDING_UMFUTURE' | 'UMFUTURE_FUNDING'; // Funding <-> Futures

// Bybit account types
type BybitAccountType = 'FUND' | 'UNIFIED' | 'CONTRACT' | 'SPOT';

// OKX account types: 6 = Funding, 18 = Trading
type OKXAccountType = '6' | '18';

type SupportedExchange = 'binance' | 'bybit' | 'okx';

interface TransferRequest {
  action: 'getBalances' | 'transfer' | 'checkTransferPermission';
  exchange?: SupportedExchange;
  fromType?: string;
  toType?: string;
  asset?: string;
  amount?: number;
}

// ============ BINANCE API FUNCTIONS ============
async function getBinanceBalances(apiKey: string, apiSecret: string) {
  // Fetch spot balance
  const spotTimestamp = Date.now();
  const spotParams = `timestamp=${spotTimestamp}`;
  const spotSignature = await hmacSha256(apiSecret, spotParams);
  
  const spotResponse = await fetch(
    `https://api.binance.com/api/v3/account?${spotParams}&signature=${spotSignature}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  
  let spotBalance = 0;
  if (spotResponse.ok) {
    const spotData = await spotResponse.json();
    const usdt = spotData.balances?.find((b: { asset: string }) => b.asset === 'USDT');
    spotBalance = parseFloat(usdt?.free || '0');
  }
  
  // Fetch futures balance
  const futuresTimestamp = Date.now();
  const futuresParams = `timestamp=${futuresTimestamp}`;
  const futuresSignature = await hmacSha256(apiSecret, futuresParams);
  
  const futuresResponse = await fetch(
    `https://fapi.binance.com/fapi/v2/balance?${futuresParams}&signature=${futuresSignature}`,
    { headers: { "X-MBX-APIKEY": apiKey } }
  );
  
  let futuresBalance = 0;
  if (futuresResponse.ok) {
    const futuresData = await futuresResponse.json();
    const usdt = futuresData.find((b: { asset: string }) => b.asset === 'USDT');
    futuresBalance = parseFloat(usdt?.availableBalance || usdt?.balance || '0');
  }
  
  // Fetch funding wallet balance
  const fundingTimestamp = Date.now();
  const fundingParams = `asset=USDT&timestamp=${fundingTimestamp}`;
  const fundingSignature = await hmacSha256(apiSecret, fundingParams);
  
  const fundingResponse = await fetch(
    `https://api.binance.com/sapi/v1/asset/get-funding-asset?${fundingParams}&signature=${fundingSignature}`,
    { method: 'POST', headers: { "X-MBX-APIKEY": apiKey } }
  );
  
  let fundingBalance = 0;
  if (fundingResponse.ok) {
    const fundingData = await fundingResponse.json();
    const usdt = fundingData.find((b: { asset: string }) => b.asset === 'USDT');
    fundingBalance = parseFloat(usdt?.free || '0');
  }
  
  return { spot: spotBalance, futures: futuresBalance, funding: fundingBalance };
}

async function executeBinanceTransfer(
  apiKey: string, 
  apiSecret: string, 
  transferType: BinanceTransferType, 
  asset: string, 
  amount: number
) {
  const timestamp = Date.now();
  const params = `type=${transferType}&asset=${asset}&amount=${amount}&timestamp=${timestamp}`;
  const signature = await hmacSha256(apiSecret, params);
  
  const response = await fetch(
    `https://api.binance.com/sapi/v1/asset/transfer?${params}&signature=${signature}`,
    { method: 'POST', headers: { "X-MBX-APIKEY": apiKey } }
  );
  
  const data = await response.json();
  
  if (!response.ok) {
    return { success: false, error: data.msg || 'Transfer failed', code: data.code };
  }
  
  return { success: true, tranId: data.tranId };
}

// ============ BYBIT API FUNCTIONS ============
async function getBybitBalances(apiKey: string, apiSecret: string) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  // Get all account types
  const accountTypes = ['FUND', 'UNIFIED'];
  const balances: Record<string, number> = { fund: 0, unified: 0, spot: 0, contract: 0 };
  
  for (const accountType of accountTypes) {
    const params = `accountType=${accountType}&coin=USDT`;
    const signPayload = `${timestamp}${apiKey}${recvWindow}${params}`;
    const signature = await hmacSha256(apiSecret, signPayload);
    
    const response = await fetch(
      `https://api.bybit.com/v5/asset/transfer/query-account-coin-balance?${params}`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-SIGN': signature,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-RECV-WINDOW': recvWindow,
        },
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.retCode === 0 && data.result?.balance) {
        const balance = parseFloat(data.result.balance.walletBalance || '0');
        balances[accountType.toLowerCase()] = balance;
      }
    }
  }
  
  return {
    spot: balances.unified, // Bybit Unified includes spot
    futures: balances.unified, // Unified account handles futures
    funding: balances.fund,
  };
}

async function executeBybitTransfer(
  apiKey: string,
  apiSecret: string,
  fromAccountType: BybitAccountType,
  toAccountType: BybitAccountType,
  coin: string,
  amount: number
) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const transferId = crypto.randomUUID();
  
  const body = JSON.stringify({
    transferId,
    coin,
    amount: amount.toString(),
    fromAccountType,
    toAccountType,
  });
  
  const signPayload = `${timestamp}${apiKey}${recvWindow}${body}`;
  const signature = await hmacSha256(apiSecret, signPayload);
  
  const response = await fetch('https://api.bybit.com/v5/asset/transfer/inter-transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
    },
    body,
  });
  
  const data = await response.json();
  
  if (data.retCode !== 0) {
    return { success: false, error: data.retMsg || 'Transfer failed', code: data.retCode };
  }
  
  return { success: true, transferId: data.result?.transferId };
}

// ============ OKX API FUNCTIONS ============
async function getOKXBalances(apiKey: string, apiSecret: string, passphrase: string) {
  const timestamp = new Date().toISOString();
  
  // Get funding account balance (account type 6)
  const fundingPath = '/api/v5/asset/balances';
  const fundingPrehash = timestamp + 'GET' + fundingPath;
  const fundingSign = await hmacSha256Base64(apiSecret, fundingPrehash);
  
  const fundingResponse = await fetch(`https://www.okx.com${fundingPath}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': fundingSign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  });
  
  let fundingBalance = 0;
  if (fundingResponse.ok) {
    const data = await fundingResponse.json();
    const usdt = data.data?.find((b: { ccy: string }) => b.ccy === 'USDT');
    fundingBalance = parseFloat(usdt?.availBal || '0');
  }
  
  // Get trading account balance (account type 18)
  const tradingPath = '/api/v5/account/balance';
  const tradingPrehash = timestamp + 'GET' + tradingPath;
  const tradingSign = await hmacSha256Base64(apiSecret, tradingPrehash);
  
  const tradingResponse = await fetch(`https://www.okx.com${tradingPath}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': tradingSign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  });
  
  let tradingBalance = 0;
  if (tradingResponse.ok) {
    const data = await tradingResponse.json();
    const details = data.data?.[0]?.details;
    const usdt = details?.find((b: { ccy: string }) => b.ccy === 'USDT');
    tradingBalance = parseFloat(usdt?.availBal || usdt?.cashBal || '0');
  }
  
  return {
    spot: tradingBalance,
    futures: tradingBalance, // OKX unified trading account
    funding: fundingBalance,
  };
}

async function executeOKXTransfer(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  from: OKXAccountType,
  to: OKXAccountType,
  ccy: string,
  amt: number
) {
  const timestamp = new Date().toISOString();
  const path = '/api/v5/asset/transfer';
  
  const body = JSON.stringify({
    ccy,
    amt: amt.toString(),
    from,
    to,
    type: '0', // 0 = internal transfer
  });
  
  const prehash = timestamp + 'POST' + path + body;
  const sign = await hmacSha256Base64(apiSecret, prehash);
  
  const response = await fetch(`https://www.okx.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
    body,
  });
  
  const data = await response.json();
  
  if (data.code !== '0') {
    return { success: false, error: data.msg || 'Transfer failed', code: data.code };
  }
  
  return { success: true, transId: data.data?.[0]?.transId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: TransferRequest = await req.json();
    const { action, exchange = 'binance', fromType, toType, asset = 'USDT', amount } = body;
    const exchangeLower = exchange.toLowerCase() as SupportedExchange;

    console.log(`[wallet-transfer] ${action} on ${exchangeLower} for user ${user.id}`);

    // Get exchange credentials
    const { data: connection } = await supabaseClient
      .from('exchange_connections')
      .select('encrypted_api_key, encrypted_api_secret, encrypted_passphrase, encryption_iv')
      .eq('user_id', user.id)
      .ilike('exchange_name', exchangeLower)
      .single();

    if (!connection?.encrypted_api_key || !connection?.encrypted_api_secret) {
      return new Response(
        JSON.stringify({ success: false, error: `No ${exchange} credentials found` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Encryption key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await decryptSecret(connection.encrypted_api_key, connection.encryption_iv!, encryptionKey);
    const apiSecret = await decryptSecret(connection.encrypted_api_secret, connection.encryption_iv!, encryptionKey);
    const passphrase = connection.encrypted_passphrase 
      ? await decryptSecret(connection.encrypted_passphrase, connection.encryption_iv!, encryptionKey)
      : '';

    // ============ ACTION: Get All Wallet Balances ============
    if (action === 'getBalances') {
      console.log(`[wallet-transfer] Fetching ${exchangeLower} balances...`);
      
      let balances: { spot: number; futures: number; funding: number };
      
      switch (exchangeLower) {
        case 'binance':
          balances = await getBinanceBalances(apiKey, apiSecret);
          break;
        case 'bybit':
          balances = await getBybitBalances(apiKey, apiSecret);
          break;
        case 'okx':
          if (!passphrase) {
            return new Response(
              JSON.stringify({ success: false, error: "OKX requires passphrase" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          balances = await getOKXBalances(apiKey, apiSecret, passphrase);
          break;
        default:
          return new Response(
            JSON.stringify({ success: false, error: `Exchange ${exchange} not supported` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
      
      console.log(`[wallet-transfer] ${exchangeLower} balances:`, balances);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          exchange: exchangeLower,
          balances: {
            ...balances,
            total: balances.spot + balances.futures + balances.funding,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // ============ ACTION: Check Transfer Permission ============
    if (action === 'checkTransferPermission') {
      console.log(`[wallet-transfer] Checking ${exchangeLower} transfer permission...`);
      
      // Only Binance has a specific API for this
      if (exchangeLower === 'binance') {
        const timestamp = Date.now();
        const params = `timestamp=${timestamp}`;
        const signature = await hmacSha256(apiSecret, params);
        
        const response = await fetch(
          `https://api.binance.com/sapi/v1/account/apiRestrictions?${params}&signature=${signature}`,
          { headers: { "X-MBX-APIKEY": apiKey } }
        );
        
        if (!response.ok) {
          return new Response(
            JSON.stringify({ success: false, canTransfer: false, error: 'Failed to check permissions' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const permissions = await response.json();
        return new Response(
          JSON.stringify({ 
            success: true, 
            canTransfer: permissions.enableInternalTransfer === true,
            permissions 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // For other exchanges, assume transfer is available if credentials work
      return new Response(
        JSON.stringify({ success: true, canTransfer: true, exchange: exchangeLower }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ ACTION: Execute Transfer ============
    if (action === 'transfer') {
      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid amount" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[wallet-transfer] Executing ${exchangeLower} transfer: ${fromType} -> ${toType}, ${amount} ${asset}`);
      
      let result: { success: boolean; error?: string; tranId?: string; transferId?: string; transId?: string; code?: any };
      
      switch (exchangeLower) {
        case 'binance':
          if (!fromType) {
            return new Response(
              JSON.stringify({ success: false, error: "Missing transfer type for Binance" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          result = await executeBinanceTransfer(apiKey, apiSecret, fromType as BinanceTransferType, asset, amount);
          break;
          
        case 'bybit':
          if (!fromType || !toType) {
            return new Response(
              JSON.stringify({ success: false, error: "Missing fromType/toType for Bybit" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          result = await executeBybitTransfer(
            apiKey, apiSecret, 
            fromType as BybitAccountType, 
            toType as BybitAccountType, 
            asset, amount
          );
          break;
          
        case 'okx':
          if (!fromType || !toType) {
            return new Response(
              JSON.stringify({ success: false, error: "Missing fromType/toType for OKX" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (!passphrase) {
            return new Response(
              JSON.stringify({ success: false, error: "OKX requires passphrase" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          result = await executeOKXTransfer(
            apiKey, apiSecret, passphrase,
            fromType as OKXAccountType,
            toType as OKXAccountType,
            asset, amount
          );
          break;
          
        default:
          return new Response(
            JSON.stringify({ success: false, error: `Exchange ${exchange} not supported` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
      
      if (!result.success) {
        console.error(`[wallet-transfer] Transfer failed:`, result);
        return new Response(
          JSON.stringify({ success: false, error: result.error, code: result.code }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[wallet-transfer] Transfer successful:`, result);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          exchange: exchangeLower,
          transactionId: result.tranId || result.transferId || result.transId,
          message: `Successfully transferred ${amount} ${asset}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error('[wallet-transfer] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
