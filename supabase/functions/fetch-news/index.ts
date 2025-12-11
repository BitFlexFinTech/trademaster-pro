import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  timestamp: string;
  url: string;
}

async function fetchCryptoCompareNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest');
    if (!response.ok) throw new Error('CryptoCompare API failed');
    
    const data = await response.json();
    return (data.Data || []).slice(0, 10).map((item: any) => ({
      id: `cc-${item.id}`,
      title: item.title,
      summary: item.body?.substring(0, 150) + '...' || '',
      source: item.source_info?.name || 'CryptoCompare',
      timestamp: new Date(item.published_on * 1000).toISOString(),
      url: item.url,
    }));
  } catch (error) {
    console.error('CryptoCompare fetch error:', error);
    return [];
  }
}

async function fetchCoinGeckoNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/news');
    if (!response.ok) throw new Error('CoinGecko API failed');
    
    const data = await response.json();
    return (data.data || []).slice(0, 10).map((item: any) => ({
      id: `cg-${item.id || Math.random().toString(36)}`,
      title: item.title,
      summary: item.description?.substring(0, 150) + '...' || '',
      source: item.author || 'CoinGecko',
      timestamp: item.updated_at || new Date().toISOString(),
      url: item.url,
    }));
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching news from multiple sources...');
    
    // Fetch from all sources in parallel
    const [cryptoCompareNews, coinGeckoNews] = await Promise.all([
      fetchCryptoCompareNews(),
      fetchCoinGeckoNews(),
    ]);

    console.log(`CryptoCompare: ${cryptoCompareNews.length}, CoinGecko: ${coinGeckoNews.length}`);

    // Merge and deduplicate by similar titles
    const allNews = [...cryptoCompareNews, ...coinGeckoNews];
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(item => {
      const key = item.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by timestamp (newest first)
    uniqueNews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Return top 15
    const finalNews = uniqueNews.slice(0, 15);
    console.log(`Returning ${finalNews.length} news items`);

    return new Response(JSON.stringify({ news: finalNews }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching news:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch news', news: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
