import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated and is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Not authenticated');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Not authenticated');
    }

    // Check if user is super_admin
    const { data: hasRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin'
    });

    if (!hasRole) {
      throw new Error('Unauthorized: Admin access required');
    }

    // Check encryption key status
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    const isConfigured = !!encryptionKey && encryptionKey.length >= 32;
    
    let maskedKey = null;
    if (isConfigured && encryptionKey) {
      maskedKey = encryptionKey.slice(0, 4) + '••••••••' + encryptionKey.slice(-2);
    }

    console.log('Encryption status check:', isConfigured ? 'Configured' : 'Not configured');

    return new Response(
      JSON.stringify({
        isConfigured,
        maskedKey,
        keyLength: encryptionKey?.length || 0,
        algorithm: 'AES-256-GCM',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Encryption status check error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: message.includes('Unauthorized') ? 403 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
