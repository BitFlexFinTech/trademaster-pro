-- Add execution_telemetry column to trades table for storing timing data
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS execution_telemetry jsonb DEFAULT NULL;