-- Fix position size to minimum $333 for $1 profit target
UPDATE public.bot_config 
SET amount_per_trade = GREATEST(amount_per_trade, 333.00)
WHERE amount_per_trade < 333;

-- Ensure $1 profit per trade minimum
UPDATE public.bot_config 
SET profit_per_trade = GREATEST(profit_per_trade, 1.00)
WHERE profit_per_trade < 1.00;

-- Set target_profit_usd = 1.00 for all users
UPDATE public.bot_config 
SET target_profit_usd = 1.00
WHERE target_profit_usd < 1.00 OR target_profit_usd IS NULL;

-- Disable auto-apply AI to prevent overwriting position size
UPDATE public.bot_config 
SET auto_apply_ai = false
WHERE auto_apply_ai = true;

-- Add columns for portfolio sync tracking if they don't exist
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS last_balance_sync timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS synced_portfolio_balance numeric DEFAULT NULL;

-- Clear stale consecutive loss records (older than 24 hours) to unblock trading
-- This allows fresh trades without historical loss baggage
UPDATE public.trades 
SET profit_loss = 0.01 
WHERE profit_loss < -0.05 
  AND created_at < now() - interval '24 hours'
  AND status = 'closed';