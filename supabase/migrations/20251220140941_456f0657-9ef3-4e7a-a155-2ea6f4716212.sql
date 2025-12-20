-- Add auto_withdraw_on_target column to bot_config for automated profit withdrawal
ALTER TABLE public.bot_config 
ADD COLUMN IF NOT EXISTS auto_withdraw_on_target BOOLEAN DEFAULT true;