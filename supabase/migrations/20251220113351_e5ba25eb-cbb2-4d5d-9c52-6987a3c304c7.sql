-- Create profit_audit_log table for tracking all profit-taking attempts
CREATE TABLE public.profit_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES public.trades(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Action details
  action TEXT NOT NULL, -- 'profit_take', 'stale_close', 'manual_close', 'oco_check', 'diagnose'
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  
  -- Computed values
  entry_price NUMERIC,
  current_price NUMERIC,
  quantity NUMERIC,
  gross_pnl NUMERIC,
  fees NUMERIC,
  net_pnl NUMERIC,
  
  -- Exchange interaction
  lot_size_used TEXT,
  quantity_sent TEXT,
  exchange_response JSONB,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  
  -- Diagnostics
  credential_found BOOLEAN,
  oco_status TEXT,
  balance_available NUMERIC
);

-- Enable Row Level Security
ALTER TABLE public.profit_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view their own audit logs" 
ON public.profit_audit_log 
FOR SELECT 
USING (auth.uid() = user_id);

-- Allow inserts from edge functions (service role)
CREATE POLICY "Service can insert audit logs"
ON public.profit_audit_log
FOR INSERT
WITH CHECK (true);

-- Create index for faster user queries
CREATE INDEX idx_profit_audit_log_user_id ON public.profit_audit_log(user_id);
CREATE INDEX idx_profit_audit_log_trade_id ON public.profit_audit_log(trade_id);
CREATE INDEX idx_profit_audit_log_created_at ON public.profit_audit_log(created_at DESC);