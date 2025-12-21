-- Add regime notification settings columns to user_settings table
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS regime_alerts_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS regime_alert_volume integer DEFAULT 50,
ADD COLUMN IF NOT EXISTS regime_alert_push_types text[] DEFAULT ARRAY['toast', 'push'],
ADD COLUMN IF NOT EXISTS regime_alert_cooldown_seconds integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS regime_alert_sound text DEFAULT 'chime';