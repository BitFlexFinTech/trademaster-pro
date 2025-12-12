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

// Known airdrop protocols and eligibility criteria
const KNOWN_AIRDROPS = [
  { id: 'layerzero', protocol: 'LayerZero', name: 'LayerZero Airdrop', chain: 'Multi-chain', claimUrl: 'https://layerzero.network' },
  { id: 'zksync', protocol: 'zkSync', name: 'zkSync Era Airdrop', chain: 'zkSync Era', claimUrl: 'https://zksync.io' },
  { id: 'starknet', protocol: 'Starknet', name: 'STRK Token Airdrop', chain: 'Starknet', claimUrl: 'https://starknet.io' },
  { id: 'eigenlayer', protocol: 'EigenLayer', name: 'EIGEN Restaking Rewards', chain: 'Ethereum', claimUrl: 'https://eigenlayer.xyz' },
  { id: 'blast', protocol: 'Blast', name: 'Blast Points Airdrop', chain: 'Blast L2', claimUrl: 'https://blast.io' },
  { id: 'scroll', protocol: 'Scroll', name: 'Scroll Marks Airdrop', chain: 'Scroll', claimUrl: 'https://scroll.io' },
  { id: 'linea', protocol: 'Linea', name: 'Linea Voyage NFT', chain: 'Linea', claimUrl: 'https://linea.build' },
  { id: 'base', protocol: 'Base', name: 'Base Ecosystem Rewards', chain: 'Base', claimUrl: 'https://base.org' },
];

function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidSolAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function generateMockEligibility(walletAddress: string): Airdrop[] {
  // Use wallet address hash to generate consistent but "random" eligibility
  const hash = walletAddress.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  return KNOWN_AIRDROPS.map((airdrop, index) => {
    // Deterministic eligibility based on wallet + airdrop index
    const seed = (hash + index) % 100;
    let status: Airdrop['status'];
    let estimatedValue: string;
    
    if (seed < 15) {
      status = 'eligible';
      estimatedValue = `$${(500 + (seed * 50)).toLocaleString()}`;
    } else if (seed < 25) {
      status = 'claimed';
      estimatedValue = `$${(200 + (seed * 20)).toLocaleString()}`;
    } else if (seed < 40) {
      status = 'pending';
      estimatedValue = 'TBD';
    } else {
      status = 'not_eligible';
      estimatedValue = '-';
    }

    return {
      id: airdrop.id,
      protocol: airdrop.protocol,
      name: airdrop.name,
      status,
      estimatedValue,
      deadline: status === 'eligible' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
      chain: airdrop.chain,
      claimUrl: status === 'eligible' ? airdrop.claimUrl : null,
    };
  });
}

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

    // Generate eligibility results (simulated for now)
    // In production, this would query real airdrop APIs like DeBank, Earni.fi, etc.
    const airdrops = generateMockEligibility(walletAddress);

    console.log(`Found ${airdrops.filter(a => a.status === 'eligible').length} eligible airdrops`);

    return new Response(
      JSON.stringify({ 
        airdrops,
        walletAddress,
        checkedAt: new Date().toISOString(),
        chain: isEth ? 'ethereum' : 'solana',
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
