-- Add withdrawal settings to bot_config
ALTER TABLE bot_config 
ADD COLUMN IF NOT EXISTS withdrawal_wallet_address text,
ADD COLUMN IF NOT EXISTS withdrawal_network text DEFAULT 'TRC20',
ADD COLUMN IF NOT EXISTS withdrawal_min_amount numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS auto_convert_to_usdt boolean DEFAULT true;