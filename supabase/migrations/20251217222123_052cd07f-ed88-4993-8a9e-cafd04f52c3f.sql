-- Add explicit write protection for user_roles table (defense in depth)
-- These RESTRICTIVE policies ensure no direct manipulation is possible
DO $$ 
BEGIN
  -- Only create if doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Prevent direct role insertion' AND tablename = 'user_roles') THEN
    CREATE POLICY "Prevent direct role insertion" ON public.user_roles
      AS RESTRICTIVE FOR INSERT WITH CHECK (false);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Prevent direct role updates' AND tablename = 'user_roles') THEN
    CREATE POLICY "Prevent direct role updates" ON public.user_roles
      AS RESTRICTIVE FOR UPDATE USING (false);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Prevent direct role deletion' AND tablename = 'user_roles') THEN
    CREATE POLICY "Prevent direct role deletion" ON public.user_roles
      AS RESTRICTIVE FOR DELETE USING (false);
  END IF;
END $$;