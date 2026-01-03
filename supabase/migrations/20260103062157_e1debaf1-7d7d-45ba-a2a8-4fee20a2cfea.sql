-- Create trade_error_recovery table for comprehensive error recovery system
CREATE TABLE public.trade_error_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trade_id UUID REFERENCES public.trades(id),
  
  -- Error details
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_code TEXT,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  
  -- Retry tracking
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  backoff_ms INTEGER NOT NULL,
  next_retry_at TIMESTAMPTZ,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  
  -- Context
  original_request JSONB,
  last_response JSONB,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trade_error_recovery ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own error recovery logs"
  ON public.trade_error_recovery FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own error recovery logs"
  ON public.trade_error_recovery FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own error recovery logs"
  ON public.trade_error_recovery FOR UPDATE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_trade_error_recovery_updated_at
  BEFORE UPDATE ON public.trade_error_recovery
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for error recovery monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_error_recovery;