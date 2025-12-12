import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  timestamp: string;
  url: string;
}

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchFromCache = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error: dbError } = await supabase
        .from('news_cache')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(20);

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setNews(data.map(item => ({
          id: item.id,
          title: item.title,
          summary: item.summary || '',
          source: item.source,
          timestamp: item.published_at,
          url: item.url || '#',
        })));
        setLastUpdated(new Date());
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error fetching from cache:', err);
      return false;
    }
  }, []);

  const fetchNews = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First try to get from cache
      const hasCache = await fetchFromCache();
      
      if (!hasCache) {
        // If no cache, call edge function to populate it
        const { data, error: fnError } = await supabase.functions.invoke('fetch-news');
        
        if (fnError) throw fnError;
        
        if (data?.news && data.news.length > 0) {
          setNews(data.news);
          setLastUpdated(new Date());
        } else {
          throw new Error('No news received');
        }
      }
    } catch (err) {
      console.error('Error fetching news:', err);
      setError('Failed to load news');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFromCache]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Force refresh from edge function
      const { data, error: fnError } = await supabase.functions.invoke('fetch-news');
      
      if (fnError) throw fnError;
      
      if (data?.news && data.news.length > 0) {
        setNews(data.news);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error refreshing news:', err);
      setError('Failed to refresh news');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    
    // Auto-refresh every 30 minutes
    const interval = setInterval(fetchNews, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  return { news, isLoading, error, lastUpdated, refresh };
}
