-- Phase 12 & 13: Manual balance in Jarvis settings
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS manual_spot_balance numeric DEFAULT 0;
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS manual_futures_balance numeric DEFAULT 0;
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS use_manual_balance boolean DEFAULT false;

-- Phase 14: Regime alert thresholds
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS regime_alert_thresholds jsonb DEFAULT '{
  "BULL": { "profitWarning": 2.0, "profitCritical": 5.0, "lossWarning": -1.0, "lossCritical": -3.0 },
  "BEAR": { "profitWarning": 1.5, "profitCritical": 3.0, "lossWarning": -0.5, "lossCritical": -2.0 },
  "CHOP": { "profitWarning": 1.0, "profitCritical": 2.0, "lossWarning": -0.3, "lossCritical": -1.0 }
}';

-- Phase 16: Trade journal fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS lessons_learned text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS emotion text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_context text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS setup_quality integer;

-- Phase 19: Smart trailing stop settings
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean DEFAULT true;
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS trailing_activation_pct numeric DEFAULT 0.75;
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS trailing_distance_pct numeric DEFAULT 0.25;
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS regime_trailing_adjustments jsonb DEFAULT '{
  "BULL": { "activationMultiplier": 0.9, "distanceMultiplier": 0.8 },
  "BEAR": { "activationMultiplier": 1.1, "distanceMultiplier": 1.2 },
  "CHOP": { "activationMultiplier": 1.2, "distanceMultiplier": 1.5 }
}';
ALTER TABLE jarvis_settings ADD COLUMN IF NOT EXISTS risk_tolerance text DEFAULT 'medium';