import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC-SHA256 signature for Binance
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
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
// https://binance-docs.github.io/apidocs/spot/en/#user-universal-transfer-user_data
type BinanceTransferType = 
  | 'MAIN_UMFUTURE'      // Spot → USDT-M Futures
  | 'UMFUTURE_MAIN'      // USDT-M Futures → Spot
  | 'MAIN_FUNDING'       // Spot → Funding
  | 'FUNDING_MAIN'       // Funding → Spot
  | 'FUNDING_UMFUTURE'   // Funding → USDT-M Futures
  | 'UMFUTURE_FUNDING';  // USDT-M Futures → Funding

interface TransferRequest {
  action: 'getBalances' | 'transfer' | 'checkTransferPermission';
  fromType?: BinanceTransferType;
  asset?: string;
  amount?: number;
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
    const { action, fromType, asset = 'USDT', amount } = body;

    // Get Binance credentials
    const { data: connection } = await supabaseClient
      .from('exchange_connections')
      .select('encrypted_api_key, encrypted_api_secret, encryption_iv')
      .eq('user_id', user.id)
      .ilike('exchange_name', 'binance')
      .single();

    if (!connection?.encrypted_api_key || !connection?.encrypted_api_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "No Binance credentials found" }),
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

    // ============ ACTION: Get All Wallet Balances ============
    if (action === 'getBalances') {
      console.log('[binance-wallet-transfer] Fetching all wallet balances...');
      
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
        { 
          method: 'POST',
          headers: { "X-MBX-APIKEY": apiKey } 
        }
      );
      
      let fundingBalance = 0;
      if (fundingResponse.ok) {
        const fundingData = await fundingResponse.json();
        const usdt = fundingData.find((b: { asset: string }) => b.asset === 'USDT');
        fundingBalance = parseFloat(usdt?.free || '0');
      }
      
      console.log(`[binance-wallet-transfer] Balances - Spot: $${spotBalance}, Futures: $${futuresBalance}, Funding: $${fundingBalance}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          balances: {
            spot: spotBalance,
            futures: futuresBalance,
            funding: fundingBalance,
            total: spotBalance + futuresBalance + fundingBalance,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // ============ ACTION: Check Transfer Permission ============
    if (action === 'checkTransferPermission') {
      console.log('[binance-wallet-transfer] Checking transfer permission...');
      
      // Try to get API key permissions
      const timestamp = Date.now();
      const params = `timestamp=${timestamp}`;
      const signature = await hmacSha256(apiSecret, params);
      
      const response = await fetch(
        `https://api.binance.com/sapi/v1/account/apiRestrictions?${params}&signature=${signature}`,
        { headers: { "X-MBX-APIKEY": apiKey } }
      );
      
      if (!response.ok) {
        const error = await response.json();
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error.msg || 'Failed to check permissions',
            canTransfer: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const permissions = await response.json();
      const canTransfer = permissions.enableInternalTransfer === true;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          canTransfer,
          permissions: {
            enableReading: permissions.enableReading,
            enableSpotAndMarginTrading: permissions.enableSpotAndMarginTrading,
            enableFutures: permissions.enableFutures,
            enableInternalTransfer: permissions.enableInternalTransfer,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ ACTION: Execute Transfer ============
    if (action === 'transfer') {
      if (!fromType || !amount || amount <= 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing transfer type or amount" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[binance-wallet-transfer] Executing transfer: ${fromType}, ${amount} ${asset}`);
      
      const timestamp = Date.now();
      const params = `type=${fromType}&asset=${asset}&amount=${amount}&timestamp=${timestamp}`;
      const signature = await hmacSha256(apiSecret, params);
      
      const response = await fetch(
        `https://api.binance.com/sapi/v1/asset/transfer?${params}&signature=${signature}`,
        { 
          method: 'POST',
          headers: { "X-MBX-APIKEY": apiKey } 
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error(`[binance-wallet-transfer] Transfer failed:`, data);
        
        // Check for specific error codes
        if (data.code === -2015) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "API key doesn't have Universal Transfer permission. Please enable it in Binance API settings.",
              code: data.code,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: data.msg || 'Transfer failed',
            code: data.code,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log(`[binance-wallet-transfer] Transfer successful:`, data);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          tranId: data.tranId,
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
    console.error('[binance-wallet-transfer] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
