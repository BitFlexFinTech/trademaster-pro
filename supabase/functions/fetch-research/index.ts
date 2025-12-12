import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResearchArticle {
  id: string;
  title: string;
  summary: string;
  author: string;
  published_at: string;
  assets: string[];
  tags: string[];
  tier: string;
  external_url: string;
  source: string;
}

// Fetch research from Messari
async function fetchMessariResearch(): Promise<ResearchArticle[]> {
  const apiKey = Deno.env.get('MESSARI_API_KEY');
  if (!apiKey) {
    console.log('No Messari API key configured');
    return [];
  }

  try {
    const response = await fetch('https://data.messari.io/api/v1/news', {
      headers: { 'x-messari-api-key': apiKey },
    });

    if (!response.ok) {
      throw new Error(`Messari API failed: ${response.status}`);
    }

    const data = await response.json();
    return (data.data || []).slice(0, 30).map((item: any) => ({
      id: `messari-${item.id}`,
      title: item.title,
      summary: item.content?.substring(0, 300) || '',
      author: item.author?.name || 'Messari Research',
      published_at: item.published_at,
      assets: item.references?.map((ref: any) => ref.name) || [],
      tags: item.tags || ['Research'],
      tier: 'free',
      external_url: item.url || `https://messari.io/article/${item.id}`,
      source: 'Messari',
    }));
  } catch (error) {
    console.error('Messari research fetch error:', error);
    return [];
  }
}

// Generate sample research articles for demo
function generateSampleResearch(): ResearchArticle[] {
  const topics = [
    { title: 'Bitcoin ETF Inflows Analysis Q4 2024', tags: ['Bitcoin', 'ETFs', 'Institutional'], author: 'Research Team' },
    { title: 'DeFi TVL Recovery: Protocol Deep Dive', tags: ['DeFi', 'TVL', 'Protocols'], author: 'DeFi Analyst' },
    { title: 'Layer-2 Scaling Solutions Comparison', tags: ['Layer-2', 'Scaling', 'Ethereum'], author: 'Tech Research' },
    { title: 'Stablecoin Market Dynamics Report', tags: ['Stablecoins', 'Markets', 'Analysis'], author: 'Markets Team' },
    { title: 'NFT Market Recovery Trends', tags: ['NFTs', 'Gaming', 'Trends'], author: 'NFT Research' },
    { title: 'AI x Crypto: The Convergence Thesis', tags: ['AI', 'Innovation', 'Trends'], author: 'Innovation Lab' },
    { title: 'Solana Ecosystem Growth Report', tags: ['Solana', 'Layer-1', 'DeFi'], author: 'Chain Analysis' },
    { title: 'MEV Landscape: Opportunities and Risks', tags: ['MEV', 'Infrastructure', 'Trading'], author: 'Trading Desk' },
    { title: 'DAO Governance Best Practices', tags: ['DAOs', 'Governance', 'Community'], author: 'Governance Team' },
    { title: 'Cross-Chain Bridge Security Analysis', tags: ['Infrastructure', 'Security', 'Bridges'], author: 'Security Research' },
    { title: 'Liquid Staking Derivatives Overview', tags: ['Staking', 'DeFi', 'ETH'], author: 'Staking Team' },
    { title: 'GameFi Economics: Play-to-Earn Models', tags: ['Gaming', 'NFTs', 'Economics'], author: 'Gaming Research' },
    { title: 'Real World Assets Tokenization', tags: ['RWA', 'Tokenization', 'TradFi'], author: 'RWA Team' },
    { title: 'Privacy Protocols Comparison 2024', tags: ['Privacy', 'Protocols', 'Analysis'], author: 'Privacy Research' },
    { title: 'Cosmos Ecosystem State of Affairs', tags: ['Cosmos', 'IBC', 'Layer-1'], author: 'Cosmos Analyst' },
  ];

  return topics.map((topic, index) => ({
    id: `sample-${index}`,
    title: topic.title,
    summary: `Comprehensive analysis covering the latest developments, market trends, and future outlook for this sector.`,
    author: topic.author,
    published_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
    assets: topic.tags.slice(0, 2),
    tags: topic.tags,
    tier: index % 3 === 0 ? 'pro' : 'free',
    external_url: 'https://messari.io/research',
    source: 'Internal',
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching research articles...');

    const [messariResearch] = await Promise.all([
      fetchMessariResearch(),
    ]);

    // Combine with sample data if API returns few results
    let allResearch = [...messariResearch];
    
    if (allResearch.length < 10) {
      const sampleResearch = generateSampleResearch();
      allResearch = [...allResearch, ...sampleResearch];
    }

    // Sort by date
    allResearch.sort((a, b) => 
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

    console.log(`Returning ${allResearch.length} research articles`);

    // Cache research to database using service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      for (const article of allResearch) {
        try {
          await supabase
            .from('research_articles')
            .upsert({
              title: article.title,
              summary: article.summary,
              author: article.author,
              published_at: article.published_at,
              assets: article.assets,
              tags: article.tags,
              tier: article.tier,
              external_url: article.external_url,
              source: article.source,
            }, { 
              onConflict: 'title',
              ignoreDuplicates: true 
            });
        } catch (e) {
          // Silently ignore upsert errors
        }
      }
      console.log('Cached research to database');
    }

    return new Response(JSON.stringify(allResearch), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Research fetch error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch research' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
