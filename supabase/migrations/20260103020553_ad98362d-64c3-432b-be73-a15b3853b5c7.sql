-- Add auto_extract_profits and use_dynamic_sizing columns to bot_config
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS auto_extract_profits boolean DEFAULT false;
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS use_dynamic_sizing boolean DEFAULT true;