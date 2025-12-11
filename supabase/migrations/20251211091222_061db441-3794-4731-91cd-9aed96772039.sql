-- Add super_admin to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Create subscriptions table
CREATE TABLE public.subscriptions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscriptions
CREATE POLICY "Users can view their own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscription"
ON public.subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscription"
ON public.subscriptions FOR UPDATE
USING (auth.uid() = user_id);

-- Create usage_limits table
CREATE TABLE public.usage_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    signals_used INTEGER NOT NULL DEFAULT 0,
    trades_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

-- RLS policies for usage_limits
CREATE POLICY "Users can view their own usage"
ON public.usage_limits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage"
ON public.usage_limits FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
ON public.usage_limits FOR UPDATE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_usage_limits_updated_at
BEFORE UPDATE ON public.usage_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();