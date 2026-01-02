-- Add new columns for $1 profit target strategy, auto-apply AI, and auto-compound

-- Add to bot_config
ALTER TABLE public.bot_config
ADD COLUMN IF NOT EXISTS auto_apply_ai boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_compound_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS compound_percentage numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS compound_threshold numeric DEFAULT 5,
ADD COLUMN IF NOT EXISTS compound_max_multiplier numeric DEFAULT 2,
ADD COLUMN IF NOT EXISTS target_profit_usd numeric DEFAULT 1.00;

-- Add target_profit_usd to trades table
ALTER TABLE public.trades
ADD COLUMN IF NOT EXISTS target_profit_usd numeric DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS holding_for_profit boolean DEFAULT false;