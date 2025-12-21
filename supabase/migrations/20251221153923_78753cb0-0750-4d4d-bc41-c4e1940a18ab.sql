-- Add regime_direction_sync column to bot_config table
-- This enables automatic trade direction enforcement based on JARVIS regime detection
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS regime_direction_sync boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.bot_config.regime_direction_sync IS 'When enabled, automatically enforces trade direction based on regime: BULL=long-only, BEAR=short-only, CHOP=both';