-- Create user_exchange_fees table for VIP tier and discount settings
CREATE TABLE public.user_exchange_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exchange_name text NOT NULL,
  fee_tier text DEFAULT 'standard',
  maker_fee numeric DEFAULT 0.001,
  taker_fee numeric DEFAULT 0.001,
  bnb_discount boolean DEFAULT false,
  okx_discount boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, exchange_name)
);

-- Enable RLS
ALTER TABLE public.user_exchange_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own fee settings"
  ON public.user_exchange_fees FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fee settings"
  ON public.user_exchange_fees FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fee settings"
  ON public.user_exchange_fees FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fee settings"
  ON public.user_exchange_fees FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_exchange_fees_updated_at
  BEFORE UPDATE ON public.user_exchange_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce $1 minimum profit for existing bot_config rows
UPDATE public.bot_config 
SET profit_per_trade = 1.00 
WHERE profit_per_trade < 1.00 OR profit_per_trade IS NULL;

UPDATE public.bot_config 
SET target_profit_usd = 1.00 
WHERE target_profit_usd < 1.00 OR target_profit_usd IS NULL;