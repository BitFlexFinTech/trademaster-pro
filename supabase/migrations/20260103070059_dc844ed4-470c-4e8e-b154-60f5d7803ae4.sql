-- Trade Speed Analytics table for learning system
CREATE TABLE IF NOT EXISTS trade_speed_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  pattern_type TEXT,
  timeframe TEXT NOT NULL,
  avg_duration_seconds INTEGER DEFAULT 0,
  sample_size INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  momentum_avg NUMERIC,
  volatility_avg NUMERIC,
  volume_surge_avg NUMERIC,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, symbol, timeframe, pattern_type, hour_of_day)
);

-- Rejected Trades audit log
CREATE TABLE IF NOT EXISTS rejected_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  exchange TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  rejection_reason TEXT NOT NULL,
  pattern_type TEXT,
  momentum NUMERIC,
  volatility NUMERIC,
  volume_surge NUMERIC,
  spread_percent NUMERIC,
  expected_duration INTEGER,
  price_at_rejection NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE trade_speed_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejected_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trade_speed_analytics
CREATE POLICY "Users can view their own speed analytics"
  ON trade_speed_analytics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own speed analytics"
  ON trade_speed_analytics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own speed analytics"
  ON trade_speed_analytics FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for rejected_trades
CREATE POLICY "Users can view their own rejected trades"
  ON rejected_trades FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rejected trades"
  ON rejected_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_speed_analytics_symbol ON trade_speed_analytics(user_id, symbol, timeframe);
CREATE INDEX IF NOT EXISTS idx_speed_analytics_pattern ON trade_speed_analytics(pattern_type, timeframe);
CREATE INDEX IF NOT EXISTS idx_rejected_trades_symbol ON rejected_trades(user_id, symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rejected_trades_reason ON rejected_trades(rejection_reason);

-- Add duration tracking to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS expected_duration_seconds INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS momentum_at_entry NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS volatility_at_entry NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS volume_surge_at_entry NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS spread_at_entry NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS qualification_confidence NUMERIC;