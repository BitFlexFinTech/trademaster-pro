import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FuturesPosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
  positionSide: 'LONG' | 'SHORT' | 'BOTH';
  isolatedMargin: number;
  notional: number;
}

interface FuturesAccountInfo {
  totalMarginBalance: number;
  availableBalance: number;
  totalUnrealizedProfit: number;
  positions: FuturesPosition[];
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Decrypt API credentials
async function decryptCredentials(
  encryptedKey: string,
  encryptedSecret: string,
  iv: string,
  encryptionKey: string
): Promise<{ apiKey: string; apiSecret: string }> {
  const decoder = new TextDecoder();
  
  // Convert base64 IV to Uint8Array (encrypt-api-key stores IV as base64)
  const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

  // Import the encryption key
  const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32).padEnd(32, '0'));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt API key
  const encryptedKeyBytes = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
  const decryptedKeyBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    encryptedKeyBytes
  );
  const apiKey = decoder.decode(decryptedKeyBuffer);
  
  // Decrypt API secret
  const encryptedSecretBytes = Uint8Array.from(atob(encryptedSecret), c => c.charCodeAt(0));
  const decryptedSecretBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    encryptedSecretBytes
  );
  const apiSecret = decoder.decode(decryptedSecretBuffer);
  
  return { apiKey, apiSecret };
}

async function getBinanceFuturesPositions(apiKey: string, apiSecret: string): Promise<FuturesPosition[]> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[binance-futures-positions] Position risk error:', errorText);
    throw new Error(`Binance API error: ${response.status}`);
  }
  
  const positions = await response.json();
  
  // Filter to only positions with non-zero amounts
  return positions
    .filter((p: any) => parseFloat(p.positionAmt) !== 0)
    .map((p: any) => ({
      symbol: p.symbol,
      positionAmt: parseFloat(p.positionAmt),
      entryPrice: parseFloat(p.entryPrice),
      markPrice: parseFloat(p.markPrice),
      unrealizedProfit: parseFloat(p.unRealizedProfit),
      liquidationPrice: parseFloat(p.liquidationPrice),
      leverage: parseInt(p.leverage),
      marginType: p.marginType,
      positionSide: p.positionSide,
      isolatedMargin: parseFloat(p.isolatedMargin || '0'),
      notional: parseFloat(p.notional),
    }));
}

async function getBinanceFuturesAccount(apiKey: string, apiSecret: string): Promise<{ 
  totalMarginBalance: number; 
  availableBalance: number;
  totalUnrealizedProfit: number;
}> {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = await hmacSha256(queryString, apiSecret);
  
  const response = await fetch(
    `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`,
    {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[binance-futures-positions] Account error:', errorText);
    throw new Error(`Binance API error: ${response.status}`);
  }
  
  const account = await response.json();
  
  return {
    totalMarginBalance: parseFloat(account.totalMarginBalance),
    availableBalance: parseFloat(account.availableBalance),
    totalUnrealizedProfit: parseFloat(account.totalUnrealizedProfit),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[binance-futures-positions] Request received');
    
    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Invalid authorization');
    }
    
    console.log('[binance-futures-positions] User:', user.id);
    
    // Get exchange credentials (case-insensitive match)
    const { data: connection, error: connError } = await supabase
      .from('exchange_connections')
      .select('*')
      .eq('user_id', user.id)
      .ilike('exchange_name', 'binance')
      .eq('is_connected', true)
      .single();
    
    if (connError || !connection) {
      console.log('[binance-futures-positions] No Binance connection found');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Binance connection found',
          positions: [],
          account: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check for encrypted credentials
    if (!connection.encrypted_api_key || !connection.encrypted_api_secret || !connection.encryption_iv) {
      throw new Error('Missing encrypted credentials');
    }
    
    // Decrypt credentials
    const { apiKey, apiSecret } = await decryptCredentials(
      connection.encrypted_api_key,
      connection.encrypted_api_secret,
      connection.encryption_iv,
      encryptionKey
    );
    
    console.log('[binance-futures-positions] Fetching positions and account data...');
    
    // Fetch positions and account in parallel
    const [positions, account] = await Promise.all([
      getBinanceFuturesPositions(apiKey, apiSecret),
      getBinanceFuturesAccount(apiKey, apiSecret),
    ]);
    
    console.log('[binance-futures-positions] Found', positions.length, 'positions');
    
    // Calculate liquidation distances for each position
    const positionsWithDistance = positions.map(p => {
      let liquidationDistance = 0;
      if (p.liquidationPrice > 0 && p.markPrice > 0) {
        if (p.positionAmt > 0) {
          // LONG position
          liquidationDistance = ((p.markPrice - p.liquidationPrice) / p.markPrice) * 100;
        } else {
          // SHORT position
          liquidationDistance = ((p.liquidationPrice - p.markPrice) / p.markPrice) * 100;
        }
      }
      return {
        ...p,
        liquidationDistance: Math.max(0, liquidationDistance),
      };
    });
    
    const response: FuturesAccountInfo = {
      totalMarginBalance: account.totalMarginBalance,
      availableBalance: account.availableBalance,
      totalUnrealizedProfit: account.totalUnrealizedProfit,
      positions: positionsWithDistance,
    };
    
    return new Response(
      JSON.stringify({
        success: true,
        ...response,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[binance-futures-positions] Error:', errorMessage);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        positions: [],
        account: null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
