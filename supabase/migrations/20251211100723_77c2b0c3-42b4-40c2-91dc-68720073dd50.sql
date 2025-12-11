-- Add encrypted storage columns to exchange_connections
ALTER TABLE public.exchange_connections 
ADD COLUMN IF NOT EXISTS encrypted_api_secret TEXT,
ADD COLUMN IF NOT EXISTS encrypted_passphrase TEXT,
ADD COLUMN IF NOT EXISTS encryption_iv TEXT,
ADD COLUMN IF NOT EXISTS exchange_uid TEXT,
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;