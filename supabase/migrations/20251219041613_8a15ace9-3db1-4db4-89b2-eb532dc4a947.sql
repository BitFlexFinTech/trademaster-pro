-- Add min_profit_threshold column to bot_config
-- Default 0.0005 = 0.05% profit threshold above fees
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS min_profit_threshold numeric NOT NULL DEFAULT 0.0005;

-- Add comment for documentation
COMMENT ON COLUMN public.bot_config.min_profit_threshold IS 'Minimum profit percentage threshold for adaptive profit-taking (e.g., 0.0005 = 0.05%)';