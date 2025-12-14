-- Create paper_test_runs table for tracking test history
CREATE TABLE public.paper_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Test configuration
  num_trades INTEGER NOT NULL DEFAULT 100,
  target_hit_rate NUMERIC NOT NULL DEFAULT 80,
  min_signal_score NUMERIC NOT NULL DEFAULT 0.85,
  min_confluence INTEGER NOT NULL DEFAULT 2,
  min_volume_ratio NUMERIC NOT NULL DEFAULT 1.2,
  
  -- Results
  passed BOOLEAN NOT NULL DEFAULT false,
  hit_rate NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  trades_skipped INTEGER NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  avg_signal_score NUMERIC,
  avg_confluence NUMERIC,
  
  -- Failure analysis
  failed_trades_breakdown JSONB,
  ai_analysis JSONB
);

-- Enable RLS
ALTER TABLE public.paper_test_runs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own paper test runs"
  ON public.paper_test_runs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own paper test runs"
  ON public.paper_test_runs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own paper test runs"
  ON public.paper_test_runs
  FOR DELETE
  USING (auth.uid() = user_id);