-- Add mtf_analysis column to trades table for multi-timeframe analysis storage
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS mtf_analysis JSONB DEFAULT NULL;

-- Create profit_goals table for tracking user profit targets
CREATE TABLE IF NOT EXISTS public.profit_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_target NUMERIC NOT NULL DEFAULT 10,
  weekly_target NUMERIC NOT NULL DEFAULT 70,
  monthly_target NUMERIC NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_profit_goals UNIQUE (user_id)
);

-- Enable RLS on profit_goals
ALTER TABLE public.profit_goals ENABLE ROW LEVEL SECURITY;

-- RLS policies for profit_goals
CREATE POLICY "Users can view their own profit goals"
  ON public.profit_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profit goals"
  ON public.profit_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profit goals"
  ON public.profit_goals FOR UPDATE
  USING (auth.uid() = user_id);

-- Create profit_badges table for achievement tracking
CREATE TABLE IF NOT EXISTS public.profit_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB DEFAULT NULL
);

-- Enable RLS on profit_badges
ALTER TABLE public.profit_badges ENABLE ROW LEVEL SECURITY;

-- RLS policies for profit_badges
CREATE POLICY "Users can view their own badges"
  ON public.profit_badges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own badges"
  ON public.profit_badges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster badge queries
CREATE INDEX IF NOT EXISTS idx_profit_badges_user_id ON public.profit_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_profit_goals_user_id ON public.profit_goals(user_id);