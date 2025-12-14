-- Fix profiles RLS policy - restrict to own profile view only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles 
  FOR SELECT USING (auth.uid() = user_id);

-- Enable realtime on portfolio_holdings for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_holdings;
ALTER TABLE public.portfolio_holdings REPLICA IDENTITY FULL;

-- Enable realtime on bot_runs for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_runs;
ALTER TABLE public.bot_runs REPLICA IDENTITY FULL;

-- Add analysis_report column to bot_runs for AI performance analysis
ALTER TABLE public.bot_runs ADD COLUMN IF NOT EXISTS analysis_report JSONB DEFAULT NULL;

-- Add profits_withdrawn column to track withdrawn profits
ALTER TABLE public.bot_runs ADD COLUMN IF NOT EXISTS profits_withdrawn NUMERIC DEFAULT 0;