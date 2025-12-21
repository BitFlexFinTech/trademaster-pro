-- Create JARVIS settings table for user-specific configuration
CREATE TABLE public.jarvis_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  
  -- Capital & Leverage
  base_capital NUMERIC DEFAULT 127,
  leverage INTEGER DEFAULT 4,
  hedge_mode_enabled BOOLEAN DEFAULT true,
  margin_type TEXT DEFAULT 'ISOLATED',
  
  -- Regime Thresholds
  regime_bull_ema_deviation NUMERIC DEFAULT 0.005,
  regime_bear_ema_deviation NUMERIC DEFAULT -0.005,
  
  -- Profit Targets per Regime
  target_bull_profit NUMERIC DEFAULT 2.10,
  target_bear_profit NUMERIC DEFAULT 2.10,
  target_chop_profit NUMERIC DEFAULT 1.00,
  
  -- RateSentinel Limits
  rate_request_interval_ms INTEGER DEFAULT 5000,
  rate_cooldown_threshold NUMERIC DEFAULT 0.80,
  rate_cooldown_duration_ms INTEGER DEFAULT 60000,
  
  -- LiquidationSentinel Limits
  liquidation_min_distance_percent NUMERIC DEFAULT 20,
  liquidation_warning_threshold NUMERIC DEFAULT 25,
  liquidation_critical_threshold NUMERIC DEFAULT 22,
  
  -- Yield Optimization
  yield_fast_close_threshold_ms INTEGER DEFAULT 300000,
  yield_stall_threshold_ms INTEGER DEFAULT 7200000,
  yield_suggest_increase_pct NUMERIC DEFAULT 20,
  yield_suggest_decrease_pct NUMERIC DEFAULT 20,
  yield_auto_apply BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.jarvis_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own JARVIS settings"
  ON public.jarvis_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own JARVIS settings"
  ON public.jarvis_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own JARVIS settings"
  ON public.jarvis_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own JARVIS settings"
  ON public.jarvis_settings FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update trigger for updated_at
CREATE TRIGGER update_jarvis_settings_updated_at
  BEFORE UPDATE ON public.jarvis_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();