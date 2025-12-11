import { riskData } from '@/lib/mockData';
import { Shield, AlertTriangle, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Risk() {
  const getRiskBadge = (risk: string) => {
    const classes = {
      LOW: 'risk-low',
      MEDIUM: 'risk-medium',
      HIGH: 'risk-high',
    }[risk] || 'risk-low';
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded font-medium', classes)}>
        ○ {risk}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Risk Dashboard</h1>
        </div>
        <div className="flex items-center gap-2 text-warning text-sm">
          <AlertTriangle className="w-4 h-4" />
          {riskData.assetsRequiringHedge} assets require hedging
        </div>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-terminal p-4">
          <span className="text-xs text-muted-foreground block mb-1">Total Exposure</span>
          <p className="text-2xl font-bold text-foreground font-mono">
            ${riskData.totalExposure.toLocaleString()}
          </p>
        </div>
        <div className="card-terminal p-4">
          <span className="text-xs text-muted-foreground block mb-1">Portfolio VaR (95%)</span>
          <p className="text-2xl font-bold text-warning font-mono">
            {riskData.portfolioVaR}%
          </p>
          <span className="text-xs text-muted-foreground">Max daily loss probability</span>
        </div>
        <div className="card-terminal p-4">
          <span className="text-xs text-muted-foreground block mb-1">Sharpe Ratio</span>
          <p className="text-2xl font-bold text-primary font-mono">
            {riskData.sharpeRatio}
          </p>
          <span className="text-xs text-primary">Above benchmark</span>
        </div>
        <div className="card-terminal p-4">
          <span className="text-xs text-muted-foreground block mb-1">Overall Risk Score</span>
          <div className="mt-2">
            <span className={cn(
              'px-3 py-1 rounded font-medium text-sm flex items-center gap-2 w-fit',
              riskData.overallRisk === 'LOW' ? 'risk-low' :
              riskData.overallRisk === 'MEDIUM' ? 'risk-medium' : 'risk-high'
            )}>
              <AlertTriangle className="w-4 h-4" />
              {riskData.overallRisk}
            </span>
          </div>
        </div>
      </div>

      {/* Asset Risk Table */}
      <div className="card-terminal">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Asset Risk Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="table-terminal">
            <thead>
              <tr className="bg-secondary/50">
                <th>Asset</th>
                <th>Exposure (USD)</th>
                <th>VaR (95%)</th>
                <th>Sharpe Ratio</th>
                <th>Risk Score</th>
                <th>Suggested Hedge</th>
              </tr>
            </thead>
            <tbody>
              {riskData.assets.map((asset, index) => (
                <tr key={index} className="hover:bg-secondary/30">
                  <td className="font-medium text-foreground">{asset.asset}</td>
                  <td className="font-mono text-foreground">
                    ${asset.exposure.toLocaleString()}
                  </td>
                  <td className={cn(
                    'font-mono',
                    asset.var95 > 4 ? 'text-destructive' :
                    asset.var95 > 3 ? 'text-warning' : 'text-primary'
                  )}>
                    {asset.var95}%
                  </td>
                  <td className="font-mono text-foreground">{asset.sharpeRatio}</td>
                  <td>{getRiskBadge(asset.riskScore)}</td>
                  <td className="text-muted-foreground text-sm">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      {asset.suggestedHedge}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
