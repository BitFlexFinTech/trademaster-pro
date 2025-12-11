import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: 10 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user ID for rate limiting (use IP as fallback)
    const authHeader = req.headers.get("Authorization");
    let userId = req.headers.get("x-forwarded-for") || "anonymous";
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Rate limiting
    const rateCheck = checkRateLimit(userId);
    if (!rateCheck.allowed) {
      console.log(`Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter),
          } 
        }
      );
    }

    // Fetch current prices for analysis
    const { data: prices } = await supabase
      .from("price_cache")
      .select("*")
      .order("market_cap", { ascending: false })
      .limit(10);

    const priceData = prices?.map(p => 
      `${p.symbol}: $${p.price} (24h: ${p.change_24h?.toFixed(2)}%)`
    ).join(", ") || "BTC: $97000, ETH: $3400, SOL: $180";

    const systemPrompt = `You are an expert cryptocurrency trading analyst. Generate exactly 10 trading signals (5 long, 5 short) based on technical analysis patterns. 

For each signal, provide:
- pair: The trading pair (e.g., "BTC/USDT")
- direction: "long" or "short"
- entry: Entry price (realistic based on current prices)
- tp1: Take Profit 1 (0.6% from entry)
- tp2: Take Profit 2 (1.4% from entry)
- tp3: Take Profit 3 (2.2% from entry)
- sl: Stop Loss (based on ATR, typically 1-2% from entry)
- confidence: Low, Medium, or High
- reasoning: Brief 1-sentence reasoning

Current market data: ${priceData}

Return ONLY valid JSON array with exactly 10 signals, no markdown or explanation.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate 10 trading signals for the current market conditions. Return only JSON array." }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let signals;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        signals = JSON.parse(jsonMatch[0]);
      } else {
        signals = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Generate fallback signals
      signals = generateFallbackSignals(prices);
    }

    // Add expiry timestamps and IDs
    const enhancedSignals = signals.map((signal: any, index: number) => ({
      ...signal,
      id: `signal-${Date.now()}-${index}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
      createdAt: new Date().toISOString(),
    }));

    console.log(`Generated ${enhancedSignals.length} signals for user ${userId}`);

    return new Response(
      JSON.stringify({ signals: enhancedSignals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating signals:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateFallbackSignals(prices: any[] | null) {
  const pairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "XRP/USDT", "ADA/USDT"];
  const signals = [];
  
  for (let i = 0; i < 5; i++) {
    const pair = pairs[i % pairs.length];
    const price = prices?.find(p => p.symbol === pair.split("/")[0])?.price || 1000;
    
    // Long signal
    signals.push({
      pair,
      direction: "long",
      entry: price,
      tp1: price * 1.006,
      tp2: price * 1.014,
      tp3: price * 1.022,
      sl: price * 0.985,
      confidence: "Medium",
      reasoning: "Bullish momentum detected with support at current levels.",
    });
    
    // Short signal
    signals.push({
      pair: pairs[(i + 2) % pairs.length],
      direction: "short",
      entry: price,
      tp1: price * 0.994,
      tp2: price * 0.986,
      tp3: price * 0.978,
      sl: price * 1.015,
      confidence: "Medium",
      reasoning: "Bearish divergence forming at resistance.",
    });
  }
  
  return signals.slice(0, 10);
}
