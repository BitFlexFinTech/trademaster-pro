-- Add is_sandbox column to bot_runs table
ALTER TABLE public.bot_runs ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT true;

-- Update existing records to have is_sandbox = true (demo mode)
UPDATE public.bot_runs SET is_sandbox = true WHERE is_sandbox IS NULL;