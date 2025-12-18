-- Phase 2: Create bot_config table for persistent settings
CREATE TABLE IF NOT EXISTS public.bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  daily_target DECIMAL NOT NULL DEFAULT 40,
  profit_per_trade DECIMAL NOT NULL DEFAULT 0.01,
  amount_per_trade DECIMAL NOT NULL DEFAULT 10,
  trade_interval_ms INTEGER NOT NULL DEFAULT 3000,
  daily_stop_loss DECIMAL NOT NULL DEFAULT 5,
  per_trade_stop_loss DECIMAL NOT NULL DEFAULT 0.002,
  focus_pairs TEXT[] DEFAULT ARRAY['BTC', 'ETH', 'SOL', 'XRP', 'BNB'],
  leverage_defaults JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own config"
  ON public.bot_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own config"
  ON public.bot_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own config"
  ON public.bot_config FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Realtime for instant sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_config;

-- Add updated_at trigger
CREATE TRIGGER update_bot_config_updated_at
  BEFORE UPDATE ON public.bot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();