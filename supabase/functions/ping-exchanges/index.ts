import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public endpoints for each exchange (no auth required)
const EXCHANGE_ENDPOINTS: Record<string, string> = {
  Binance: 'https://api.binance.com/api/v3/ping',
  OKX: 'https://www.okx.com/api/v5/public/time',
  Bybit: 'https://api.bybit.com/v5/market/time',
  KuCoin: 'https://api.kucoin.com/api/v1/timestamp',
  Kraken: 'https://api.kraken.com/0/public/Time',
  Nexo: 'https://api.nexo.io/api/v1/health', // May not exist, will gracefully fail
};

interface PingResult {
  success: boolean;
  latency: number | null;
  error?: string;
}

async function pingExchange(name: string, url: string): Promise<PingResult> {
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);
    
    if (response.ok) {
      return { success: true, latency };
    } else {
      return { success: false, latency, error: `HTTP ${response.status}` };
    }
  } catch (error: unknown) {
    const err = error as Error;
    return { 
      success: false, 
      latency: null, 
      error: err.name === 'AbortError' ? 'Timeout' : err.message 
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[ping-exchanges] Starting ping for all exchanges');
    
    // Ping all exchanges in parallel
    const pingPromises = Object.entries(EXCHANGE_ENDPOINTS).map(
      async ([name, url]) => {
        const result = await pingExchange(name, url);
        console.log(`[ping-exchanges] ${name}: ${result.success ? `${result.latency}ms` : result.error}`);
        return [name, result] as const;
      }
    );
    
    const results = await Promise.all(pingPromises);
    const resultsObject = Object.fromEntries(results);
    
    // Calculate average latency for successful pings
    const successfulPings = results.filter(([, r]) => r.success && r.latency !== null);
    const avgLatency = successfulPings.length > 0
      ? Math.round(successfulPings.reduce((sum, [, r]) => sum + (r.latency || 0), 0) / successfulPings.length)
      : null;
    
    console.log(`[ping-exchanges] Complete. Avg latency: ${avgLatency}ms, ${successfulPings.length}/${results.length} successful`);
    
    return new Response(
      JSON.stringify({
        success: true,
        results: resultsObject,
        avgLatency,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[ping-exchanges] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
