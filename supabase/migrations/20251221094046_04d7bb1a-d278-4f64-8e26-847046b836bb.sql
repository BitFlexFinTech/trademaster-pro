-- Add bot_run_id column to link trades to specific bot sessions
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS bot_run_id uuid REFERENCES public.bot_runs(id) ON DELETE SET NULL;

-- Create index for faster queries when filtering trades by bot session
CREATE INDEX IF NOT EXISTS idx_trades_bot_run_id ON public.trades(bot_run_id);