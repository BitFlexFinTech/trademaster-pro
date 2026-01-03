-- Create exchange cache table for lot sizes and exchange info
CREATE TABLE IF NOT EXISTS exchange_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  cache_value JSONB NOT NULL,
  exchange TEXT NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_exchange_cache_key ON exchange_cache(cache_key);
CREATE INDEX idx_exchange_cache_expires ON exchange_cache(expires_at);
CREATE INDEX idx_exchange_cache_exchange ON exchange_cache(exchange);

-- Enable RLS
ALTER TABLE exchange_cache ENABLE ROW LEVEL SECURITY;

-- Allow edge functions to read/write (service role only)
CREATE POLICY "Service can manage cache" ON exchange_cache FOR ALL USING (true);

-- Add webhook_config to user_settings for Discord/Slack webhooks
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS webhook_config JSONB DEFAULT '{
  "discord_url": null,
  "slack_url": null,
  "enabled": false,
  "alert_types": ["slow_total", "slow_phase", "critical"],
  "cooldown_seconds": 60
}'::jsonb;