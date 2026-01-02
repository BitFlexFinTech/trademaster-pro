-- Migration: Remove withdrawal columns from bot_config and bot_runs
-- These columns are no longer used after withdrawal feature removal

ALTER TABLE bot_config 
DROP COLUMN IF EXISTS withdrawal_wallet_address,
DROP COLUMN IF EXISTS withdrawal_network,
DROP COLUMN IF EXISTS withdrawal_min_amount,
DROP COLUMN IF EXISTS auto_convert_to_usdt,
DROP COLUMN IF EXISTS auto_withdraw_on_target;

ALTER TABLE bot_runs
DROP COLUMN IF EXISTS profits_withdrawn;