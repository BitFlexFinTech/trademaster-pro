-- Add unique constraints for UPSERT to work properly
CREATE UNIQUE INDEX IF NOT EXISTS news_cache_title_unique ON public.news_cache (title);
CREATE UNIQUE INDEX IF NOT EXISTS research_articles_title_unique ON public.research_articles (title);