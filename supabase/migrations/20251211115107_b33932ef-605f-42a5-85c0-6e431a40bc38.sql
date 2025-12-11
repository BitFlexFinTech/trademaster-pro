-- Create table for chart drawings persistence
CREATE TABLE public.chart_drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.chart_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own drawings" ON public.chart_drawings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own drawings" ON public.chart_drawings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drawings" ON public.chart_drawings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drawings" ON public.chart_drawings
  FOR DELETE USING (auth.uid() = user_id);

-- Create table for research articles
CREATE TABLE public.research_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  author TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assets TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  tier TEXT DEFAULT 'free',
  external_url TEXT,
  source TEXT DEFAULT 'internal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.research_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read research articles" ON public.research_articles
  FOR SELECT USING (true);

-- Create table for news cache
CREATE TABLE public.news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  category TEXT DEFAULT 'general',
  assets TEXT[] DEFAULT '{}',
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read news cache" ON public.news_cache
  FOR SELECT USING (true);

-- Create table for user watchlists
CREATE TABLE public.user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Watchlist',
  symbols TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watchlists" ON public.user_watchlists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own watchlists" ON public.user_watchlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists" ON public.user_watchlists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists" ON public.user_watchlists
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for chart_drawings
ALTER PUBLICATION supabase_realtime ADD TABLE public.chart_drawings;