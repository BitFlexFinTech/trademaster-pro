-- Create regime_history table for persisting BULL/BEAR/CHOP transitions
CREATE TABLE public.regime_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
  regime TEXT NOT NULL CHECK (regime IN ('BULL', 'BEAR', 'CHOP')),
  ema200 DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  deviation DECIMAL(10, 6) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  trades_during_regime INTEGER DEFAULT 0,
  pnl_during_regime DECIMAL(12, 4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.regime_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own regime history" ON public.regime_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own regime history" ON public.regime_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own regime history" ON public.regime_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own regime history" ON public.regime_history
  FOR DELETE USING (auth.uid() = user_id);

-- Add regime_at_entry column to trades table
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS regime_at_entry TEXT CHECK (regime_at_entry IN ('BULL', 'BEAR', 'CHOP'));

-- Enable realtime for regime_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.regime_history;