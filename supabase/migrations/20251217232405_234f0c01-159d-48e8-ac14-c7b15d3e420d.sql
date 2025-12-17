-- PHASE 1: Database indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_trades_user_pair_direction_created ON trades(user_id, pair, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_sandbox ON trades(user_id, is_sandbox);
CREATE INDEX IF NOT EXISTS idx_trades_pair_direction ON trades(pair, direction);
CREATE INDEX IF NOT EXISTS idx_trades_pair_created_profit ON trades(pair, created_at DESC, profit_loss);

-- ML models table for storing trained weights
CREATE TABLE IF NOT EXISTS ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  model_type TEXT NOT NULL DEFAULT 'direction_predictor',
  weights JSONB NOT NULL DEFAULT '{}',
  accuracy DECIMAL DEFAULT 0,
  training_samples INTEGER DEFAULT 0,
  last_trained_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own models" ON ml_models FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own models" ON ml_models FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own models" ON ml_models FOR UPDATE USING (auth.uid() = user_id);

-- Kill events table for tracking emergency stops
CREATE TABLE IF NOT EXISTS kill_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  trigger_pnl DECIMAL NOT NULL,
  threshold_used DECIMAL NOT NULL,
  bots_killed INTEGER DEFAULT 0,
  positions_closed JSONB DEFAULT '[]',
  total_usdt_recovered DECIMAL DEFAULT 0,
  total_loss_locked DECIMAL DEFAULT 0,
  config_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kill_events_user_created ON kill_events(user_id, created_at DESC);

ALTER TABLE kill_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own kill events" ON kill_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own kill events" ON kill_events FOR INSERT WITH CHECK (auth.uid() = user_id);