import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ResearchArticle {
  id: string;
  title: string;
  summary: string;
  author: string;
  source: string;
  publishedAt: string;
  tags: string[];
  assets: string[];
  tier: string;
  externalUrl: string;
  content: string;
}

export function useResearch() {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchFromCache = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error: dbError } = await supabase
        .from('research_articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50);

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setArticles(data.map(item => ({
          id: item.id,
          title: item.title,
          summary: item.summary || '',
          author: item.author,
          source: item.source || 'Internal',
          publishedAt: item.published_at || item.created_at || '',
          tags: item.tags || [],
          assets: item.assets || [],
          tier: item.tier || 'free',
          externalUrl: item.external_url || '#',
          content: item.content || '',
        })));
        setLastUpdated(new Date());
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error fetching research from cache:', err);
      return false;
    }
  }, []);

  const fetchResearch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First try to get from cache
      const hasCache = await fetchFromCache();
      
      if (!hasCache) {
        // If no cache, call edge function to populate it
        const { data, error: fnError } = await supabase.functions.invoke('fetch-research');
        
        if (fnError) throw fnError;
        
        if (data?.articles && data.articles.length > 0) {
          setArticles(data.articles.map((item: any) => ({
            id: item.id,
            title: item.title,
            summary: item.summary || '',
            author: item.author,
            source: item.source || 'Messari',
            publishedAt: item.publishedAt || item.published_at || '',
            tags: item.tags || [],
            assets: item.assets || [],
            tier: item.tier || 'free',
            externalUrl: item.externalUrl || item.external_url || '#',
            content: item.content || '',
          })));
          setLastUpdated(new Date());
        } else {
          throw new Error('No research articles received');
        }
      }
    } catch (err) {
      console.error('Error fetching research:', err);
      setError('Failed to load research articles');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFromCache]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Force refresh from edge function
      const { data, error: fnError } = await supabase.functions.invoke('fetch-research');
      
      if (fnError) throw fnError;
      
      if (data?.articles && data.articles.length > 0) {
        setArticles(data.articles.map((item: any) => ({
          id: item.id,
          title: item.title,
          summary: item.summary || '',
          author: item.author,
          source: item.source || 'Messari',
          publishedAt: item.publishedAt || item.published_at || '',
          tags: item.tags || [],
          assets: item.assets || [],
          tier: item.tier || 'free',
          externalUrl: item.externalUrl || item.external_url || '#',
          content: item.content || '',
        })));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Error refreshing research:', err);
      setError('Failed to refresh research');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResearch();
    
    // Auto-refresh every 2 hours
    const interval = setInterval(fetchResearch, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchResearch]);

  return { articles, isLoading, error, lastUpdated, refresh };
}
