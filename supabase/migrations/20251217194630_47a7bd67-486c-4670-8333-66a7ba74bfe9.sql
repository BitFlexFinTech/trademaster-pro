-- Enable realtime on portfolio_holdings for instant balance sync
ALTER TABLE public.portfolio_holdings REPLICA IDENTITY FULL;

-- Create error_logs table for production error tracking
CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  level text NOT NULL CHECK (level IN ('error', 'warning', 'info')),
  message text NOT NULL,
  stack text,
  context jsonb,
  page_url text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all errors
CREATE POLICY "Admins can read all errors"
ON public.error_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Anyone authenticated can insert errors
CREATE POLICY "Authenticated users can insert errors"
ON public.error_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_error_logs_created_at ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_level ON public.error_logs(level);