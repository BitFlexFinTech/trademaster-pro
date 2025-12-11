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
    // Use the status updates endpoint as the news endpoint requires pro
    const response = await fetch('https://api.coingecko.com/api/v3/status_updates?per_page=10');
    if (!response.ok) throw new Error('CoinGecko API failed');
    
    const data = await response.json();
    return (data.status_updates || []).slice(0, 10).map((item: any) => ({
      id: `cg-${item.created_at}-${Math.random().toString(36).slice(2, 8)}`,
      title: item.project?.name ? `${item.project.name}: ${item.user_title || 'Update'}` : item.user_title || 'Crypto Update',
      summary: item.description?.substring(0, 150) + '...' || '',
      source: 'CoinGecko',
      timestamp: item.created_at || new Date().toISOString(),
      url: item.project?.links?.homepage?.[0] || 'https://coingecko.com',
    }));
  } catch (error) {
    console.error('CoinGecko fetch error:', error);
    return [];
  }
}

async function fetchMessariNews(): Promise<NewsItem[]> {
  try {
    const apiKey = Deno.env.get('MESSARI_API_KEY');
    if (!apiKey) {
      console.log('MESSARI_API_KEY not configured, skipping Messari fetch');
      return [];
    }
    
    const response = await fetch('https://data.messari.io/api/v1/news', {
      headers: {
        'x-messari-api-key': apiKey,
      },
    });
    
    if (!response.ok) throw new Error(`Messari API failed: ${response.status}`);
    
    const data = await response.json();
    return (data.data || []).slice(0, 10).map((item: any) => ({
      id: `ms-${item.id || Math.random().toString(36).slice(2, 8)}`,
      title: item.title || 'Messari News',
      summary: item.content?.substring(0, 150) + '...' || item.previewText || '',
      source: item.author?.name || 'Messari',
      timestamp: item.publishedAt || item.published_at || new Date().toISOString(),
      url: item.url || item.link || 'https://messari.io',
    }));
  } catch (error) {
    console.error('Messari fetch error:', error);
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
    const [cryptoCompareNews, coinGeckoNews, messariNews] = await Promise.all([
      fetchCryptoCompareNews(),
      fetchCoinGeckoNews(),
      fetchMessariNews(),
    ]);

    console.log(`CryptoCompare: ${cryptoCompareNews.length}, CoinGecko: ${coinGeckoNews.length}, Messari: ${messariNews.length}`);

    // Merge and deduplicate by similar titles
    const allNews = [...cryptoCompareNews, ...coinGeckoNews, ...messariNews];
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(item => {
      const key = item.title.toLowerCase().substring(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by timestamp (newest first)
    uniqueNews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Return top 20
    const finalNews = uniqueNews.slice(0, 20);
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
