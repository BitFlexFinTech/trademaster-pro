-- Fix duplicate portfolio_holdings by keeping only the most recent per user/exchange/asset
-- First, delete duplicates keeping only the row with the latest updated_at
DELETE FROM public.portfolio_holdings
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, exchange_name, asset_symbol) id
  FROM public.portfolio_holdings
  ORDER BY user_id, exchange_name, asset_symbol, updated_at DESC
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE public.portfolio_holdings
ADD CONSTRAINT portfolio_holdings_unique_per_exchange 
UNIQUE (user_id, exchange_name, asset_symbol);