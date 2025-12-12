import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface AssetRisk {
  asset: string;
  exposure: number;
  var95: number;
  sharpeRatio: number;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedHedge: string;
}

interface RiskData {
  totalExposure: number;
  portfolioVaR: number;
  sharpeRatio: number;
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  assetsRequiringHedge: number;
  assets: AssetRisk[];
}

export function useRiskAnalysis() {
  const { user } = useAuth();
  const [riskData, setRiskData] = useState<RiskData>({
    totalExposure: 0,
    portfolioVaR: 0,
    sharpeRatio: 0,
    overallRisk: 'LOW',
    assetsRequiringHedge: 0,
    assets: [],
  });
  const [loading, setLoading] = useState(true);

  const calculateRisk = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Fetch portfolio holdings
      const { data: holdings } = await supabase
        .from('portfolio_holdings')
        .select('*')
        .eq('user_id', user.id);

      // Fetch price data for volatility estimation
      const { data: prices } = await supabase
        .from('price_cache')
        .select('*');

      // Fetch trade history for Sharpe calculation
      const { data: trades } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'closed');

      const priceMap = new Map(prices?.map(p => [p.symbol, { price: p.price, change: Math.abs(p.change_24h || 0) }]));

      let totalExposure = 0;
      const assetRisks: AssetRisk[] = [];

      holdings?.forEach(holding => {
        const priceData = priceMap.get(holding.asset_symbol);
        if (priceData) {
          const exposure = holding.quantity * priceData.price;
          totalExposure += exposure;

          // Estimate VaR based on volatility (simplified)
          const volatility = priceData.change;
          const var95 = volatility * 1.65; // 95% confidence

          // Simplified Sharpe calculation
          const sharpe = volatility > 0 ? (priceData.change / volatility) : 0;

          // Determine risk score
          let riskScore: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
          if (var95 > 5) riskScore = 'HIGH';
          else if (var95 > 3) riskScore = 'MEDIUM';

          // Suggest hedge based on asset
          const hedges: Record<string, string> = {
            'BTC': 'Short BTC perp or buy PUT',
            'ETH': 'Short ETH perp or buy PUT',
            'SOL': 'Short SOL perp, diversify to stables',
            'XRP': 'Reduce position, move to BTC',
          };

          assetRisks.push({
            asset: holding.asset_symbol,
            exposure,
            var95: Math.round(var95 * 100) / 100,
            sharpeRatio: Math.round(sharpe * 100) / 100,
            riskScore,
            suggestedHedge: hedges[holding.asset_symbol] || 'Diversify portfolio',
          });
        }
      });

      // Sort by exposure
      assetRisks.sort((a, b) => b.exposure - a.exposure);

      // Calculate portfolio-level metrics
      const avgVaR = assetRisks.length > 0 
        ? assetRisks.reduce((sum, a) => sum + a.var95, 0) / assetRisks.length 
        : 0;

      // Calculate portfolio Sharpe from trades
      let portfolioSharpe = 0;
      if (trades && trades.length > 10) {
        const returns = trades.map(t => t.profit_percentage || 0);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = Math.sqrt(
          returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        );
        portfolioSharpe = stdDev > 0 ? avgReturn / stdDev : 0;
      }

      const highRiskCount = assetRisks.filter(a => a.riskScore === 'HIGH').length;
      const overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 
        highRiskCount > 2 ? 'HIGH' : 
        highRiskCount > 0 || avgVaR > 4 ? 'MEDIUM' : 'LOW';

      setRiskData({
        totalExposure,
        portfolioVaR: Math.round(avgVaR * 100) / 100,
        sharpeRatio: Math.round(portfolioSharpe * 100) / 100,
        overallRisk,
        assetsRequiringHedge: assetRisks.filter(a => a.riskScore !== 'LOW').length,
        assets: assetRisks,
      });
    } catch (error) {
      console.error('Error calculating risk:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    calculateRisk();
  }, [calculateRisk]);

  return { riskData, loading, refetch: calculateRisk };
}
