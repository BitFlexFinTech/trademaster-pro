-- Add encrypted_api_key column to store the encrypted API key for live trading
ALTER TABLE exchange_connections ADD COLUMN encrypted_api_key TEXT;