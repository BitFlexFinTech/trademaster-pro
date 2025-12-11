import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const { apiSecret, passphrase } = await req.json();

    if (!apiSecret) {
      throw new Error('API secret is required');
    }

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Convert key to bytes (use first 32 chars for AES-256)
    const keyBytes = new TextEncoder().encode(encryptionKey.slice(0, 32));
    
    // Import key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Encrypt API secret
    const secretBytes = new TextEncoder().encode(apiSecret);
    const encryptedSecret = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      secretBytes
    );

    // Encrypt passphrase if provided
    let encryptedPassphrase = null;
    if (passphrase) {
      const passphraseBytes = new TextEncoder().encode(passphrase);
      const encryptedPassphraseBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        passphraseBytes
      );
      encryptedPassphrase = btoa(String.fromCharCode(...new Uint8Array(encryptedPassphraseBuffer)));
    }

    // Convert to base64
    const encryptedSecretBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedSecret)));
    const ivBase64 = btoa(String.fromCharCode(...iv));

    console.log('Successfully encrypted API credentials');

    return new Response(
      JSON.stringify({
        encryptedSecret: encryptedSecretBase64,
        encryptedPassphrase,
        iv: ivBase64,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Encryption error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
