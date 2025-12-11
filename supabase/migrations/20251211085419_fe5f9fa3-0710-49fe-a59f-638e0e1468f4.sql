-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'trader', 'viewer');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'trader',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- User profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User settings table (for API keys, preferences)
CREATE TABLE public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    notification_sounds BOOLEAN DEFAULT true,
    push_notifications BOOLEAN DEFAULT true,
    profit_threshold DECIMAL(10,2) DEFAULT 0.5,
    theme TEXT DEFAULT 'dark',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Exchange connections table (encrypted API keys stored separately)
CREATE TABLE public.exchange_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    exchange_name TEXT NOT NULL,
    api_key_hash TEXT,
    is_connected BOOLEAN DEFAULT false,
    permissions TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, exchange_name)
);

-- Portfolio holdings table
CREATE TABLE public.portfolio_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    asset_symbol TEXT NOT NULL,
    quantity DECIMAL(20,8) NOT NULL DEFAULT 0,
    average_buy_price DECIMAL(20,8),
    exchange_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trades history table
CREATE TABLE public.trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    pair TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
    entry_price DECIMAL(20,8) NOT NULL,
    exit_price DECIMAL(20,8),
    amount DECIMAL(20,8) NOT NULL,
    leverage INTEGER DEFAULT 1,
    profit_loss DECIMAL(20,8),
    profit_percentage DECIMAL(10,4),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    exchange_name TEXT,
    is_sandbox BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- Price cache table for real-time prices
CREATE TABLE public.price_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL UNIQUE,
    price DECIMAL(20,8) NOT NULL,
    change_24h DECIMAL(10,4),
    volume_24h DECIMAL(20,2),
    market_cap DECIMAL(20,2),
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Arbitrage opportunities cache
CREATE TABLE public.arbitrage_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pair TEXT NOT NULL,
    buy_exchange TEXT NOT NULL,
    sell_exchange TEXT NOT NULL,
    buy_price DECIMAL(20,8) NOT NULL,
    sell_price DECIMAL(20,8) NOT NULL,
    profit_percentage DECIMAL(10,4) NOT NULL,
    volume_24h DECIMAL(20,2),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Alerts/notifications table
CREATE TABLE public.alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    alert_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitrage_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
    FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_settings
CREATE POLICY "Users can view their own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for exchange_connections
CREATE POLICY "Users can view their own connections" ON public.exchange_connections
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own connections" ON public.exchange_connections
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for portfolio_holdings
CREATE POLICY "Users can view their own holdings" ON public.portfolio_holdings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own holdings" ON public.portfolio_holdings
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for trades
CREATE POLICY "Users can view their own trades" ON public.trades
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own trades" ON public.trades
    FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for price_cache (public read)
CREATE POLICY "Anyone can read price cache" ON public.price_cache
    FOR SELECT USING (true);

-- RLS Policies for arbitrage_opportunities (public read)
CREATE POLICY "Anyone can read arbitrage opportunities" ON public.arbitrage_opportunities
    FOR SELECT USING (true);

-- RLS Policies for alerts
CREATE POLICY "Users can view their own alerts" ON public.alerts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own alerts" ON public.alerts
    FOR ALL USING (auth.uid() = user_id);

-- Enable realtime for price updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE public.arbitrage_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- Function to create profile and settings on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
    
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'trader');
    
    RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_exchange_connections_updated_at BEFORE UPDATE ON public.exchange_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_portfolio_holdings_updated_at BEFORE UPDATE ON public.portfolio_holdings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();