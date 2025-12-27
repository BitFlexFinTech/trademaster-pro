import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Airdrop {
  id: string;
  protocol: string;
  name: string;
  status: 'eligible' | 'claimed' | 'not_eligible' | 'pending';
  estimatedValue: string;
  deadline: string | null;
  chain: string;
  claimUrl: string | null;
}

interface DeBankProtocol {
  id: string;
  name: string;
  chain: string;
  site_url: string;
  logo_url: string;
  net_usd_value: number;
}

interface DeBankToken {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  amount: number;
  price: number;
  is_claimable?: boolean;
}

// Known airdrop protocols to check
const AIRDROP_PROTOCOLS = [
  { id: 'layerzero', name: 'LayerZero', chain: 'Multi-chain' },
  { id: 'zksync', name: 'zkSync Era', chain: 'zkSync Era' },
  { id: 'starknet', name: 'Starknet', chain: 'Starknet' },
  { id: 'eigenlayer', name: 'EigenLayer', chain: 'Ethereum' },
  { id: 'blast', name: 'Blast', chain: 'Blast L2' },
  { id: 'scroll', name: 'Scroll', chain: 'Scroll' },
  { id: 'linea', name: 'Linea', chain: 'Linea' },
  { id: 'base', name: 'Base', chain: 'Base' },
  { id: 'arbitrum', name: 'Arbitrum', chain: 'Arbitrum' },
  { id: 'optimism', name: 'Optimism', chain: 'Optimism' },
];

function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidSolAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Fetch wallet data from DeBank API (REAL DATA)
 * DeBank Pro API: https://docs.cloud.debank.com/
 */
async function fetchDeBankData(walletAddress: string): Promise<{
  protocols: DeBankProtocol[];
  tokens: DeBankToken[];
} | null> {
  const apiKey = Deno.env.get('DEBANK_API_KEY');
  
  if (!apiKey) {
    console.log('DEBANK_API_KEY not configured - using fallback');
    return null;
  }

  try {
    // Fetch user's protocol list (DeFi positions that may have airdrops)
    const [protocolsRes, tokensRes] = await Promise.all([
      fetch(`https://pro-openapi.debank.com/v1/user/simple_protocol_list?id=${walletAddress}`, {
        headers: { 'AccessKey': apiKey },
      }),
      fetch(`https://pro-openapi.debank.com/v1/user/all_token_list?id=${walletAddress}&is_all=false`, {
        headers: { 'AccessKey': apiKey },
      }),
    ]);

    if (!protocolsRes.ok || !tokensRes.ok) {
      console.error('DeBank API error:', protocolsRes.status, tokensRes.status);
      return null;
    }

    const protocols = await protocolsRes.json();
    const tokens = await tokensRes.json();

    return { protocols, tokens };
  } catch (error) {
    console.error('DeBank fetch error:', error);
    return null;
  }
}

/**
 * Analyze DeBank data to find potential airdrops
 */
function analyzeForAirdrops(
  walletAddress: string,
  debankData: { protocols: DeBankProtocol[]; tokens: DeBankToken[] } | null
): Airdrop[] {
  const airdrops: Airdrop[] = [];
  
  if (debankData) {
    // Check protocols user has interacted with for potential airdrops
    for (const protocol of debankData.protocols) {
      const knownAirdrop = AIRDROP_PROTOCOLS.find(
        p => protocol.name.toLowerCase().includes(p.name.toLowerCase()) ||
             protocol.id.toLowerCase().includes(p.id.toLowerCase())
      );
      
      if (knownAirdrop) {
        // User has positions in this protocol - likely eligible
        airdrops.push({
          id: knownAirdrop.id,
          protocol: knownAirdrop.name,
          name: `${knownAirdrop.name} Airdrop`,
          status: protocol.net_usd_value > 100 ? 'eligible' : 'pending',
          estimatedValue: protocol.net_usd_value > 0 
            ? `$${Math.round(protocol.net_usd_value * 0.1).toLocaleString()}` // Estimate 10% of TVL as airdrop
            : 'TBD',
          deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          chain: knownAirdrop.chain,
          claimUrl: protocol.site_url || null,
        });
      }
    }
    
    // Check for claimable tokens (unclaimed airdrops)
    for (const token of debankData.tokens) {
      if (token.is_claimable && token.amount > 0) {
        airdrops.push({
          id: `claimable-${token.id}`,
          protocol: token.name,
          name: `${token.symbol} Claimable`,
          status: 'eligible',
          estimatedValue: `$${(token.amount * token.price).toFixed(2)}`,
          deadline: null,
          chain: token.chain,
          claimUrl: null,
        });
      }
    }
  }
  
  // Add protocols user hasn't interacted with as not_eligible
  for (const known of AIRDROP_PROTOCOLS) {
    if (!airdrops.find(a => a.id === known.id)) {
      airdrops.push({
        id: known.id,
        protocol: known.name,
        name: `${known.name} Airdrop`,
        status: 'not_eligible',
        estimatedValue: '-',
        deadline: null,
        chain: known.chain,
        claimUrl: null,
      });
    }
  }
  
  return airdrops;
}

// NOTE: Removed generateFallbackEligibility - NO MOCK DATA in live mode
// When DeBank API is unavailable, return empty array with error message

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { walletAddress } = await req.json();

    if (!walletAddress) {
      return new Response(
        JSON.stringify({ error: 'Wallet address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking airdrop eligibility for: ${walletAddress}`);

    // Validate address format
    const isEth = isValidEthAddress(walletAddress);
    const isSol = isValidSolAddress(walletAddress);

    if (!isEth && !isSol) {
      return new Response(
        JSON.stringify({ error: 'Invalid wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to fetch REAL data from DeBank API
    const debankData = isEth ? await fetchDeBankData(walletAddress) : null;
    
    let airdrops: Airdrop[];
    let dataSource: string;
    let error: string | undefined;
    
    if (debankData) {
      // Use REAL DeBank data
      airdrops = analyzeForAirdrops(walletAddress, debankData);
      dataSource = 'debank';
      console.log(`DeBank API: Found ${debankData.protocols.length} protocols, ${debankData.tokens.length} tokens`);
    } else {
      // NO MOCK DATA - Return empty array with error when API unavailable
      airdrops = [];
      dataSource = 'none';
      error = 'DEBANK_API_KEY not configured - unable to fetch real airdrop data';
      console.log('No fallback: DEBANK_API_KEY not configured, returning empty array');
    }

    const eligibleCount = airdrops.filter(a => a.status === 'eligible').length;
    console.log(`Found ${eligibleCount} eligible airdrops`);

    return new Response(
      JSON.stringify({ 
        airdrops,
        walletAddress,
        checkedAt: new Date().toISOString(),
        chain: isEth ? 'ethereum' : 'solana',
        dataSource,
        ...(error && { error }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking airdrops:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to check airdrop eligibility' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
