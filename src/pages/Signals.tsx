import { useState } from 'react';
import { signalsData } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, TrendingDown, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Signals() {
  const [signals, setSignals] = useState(signalsData);

  const handleAmountChange = (id: number, amount: number) => {
    setSignals((prev) =>
      prev.map((sig) => (sig.id === id ? { ...sig, amount } : sig))
    );
  };

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
          <TrendingUp className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">AI Trading Signals</h1>
          <span className="live-indicator">10 Active</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Win Rate: <span className="text-primary font-mono">72.5%</span>
          </span>
          <span className="flex items-center gap-1 text-warning">
            <AlertTriangle className="w-4 h-4" />
            Signals expire in 5 minutes
          </span>
        </div>
      </div>

      <div className="card-terminal overflow-x-auto">
        <table className="table-terminal">
          <thead>
            <tr className="bg-secondary/50">
              <th>Pair</th>
              <th>Exchange</th>
              <th>Direction</th>
              <th>Entry</th>
              <th>TP1</th>
              <th>TP2</th>
              <th>TP3</th>
              <th>SL</th>
              <th>Amount</th>
              <th>Leverage</th>
              <th>Risk</th>
              <th>Profit</th>
              <th>Expires</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <tr key={signal.id} className="hover:bg-secondary/30">
                <td className="font-medium text-foreground">{signal.pair}</td>
                <td className="text-muted-foreground">{signal.exchange}</td>
                <td>
                  <span className={signal.direction === 'LONG' ? 'badge-long' : 'badge-short'}>
                    {signal.direction === 'LONG' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {signal.direction}
                  </span>
                </td>
                <td className="font-mono text-foreground">
                  ${signal.entry.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="font-mono text-primary">
                  ${signal.tp1.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="font-mono text-primary">
                  ${signal.tp2.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="font-mono text-primary">
                  ${signal.tp3.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="font-mono text-destructive">
                  ${signal.sl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <Input
                    type="number"
                    value={signal.amount}
                    onChange={(e) => handleAmountChange(signal.id, Number(e.target.value))}
                    className="w-20 h-8 text-sm font-mono bg-secondary border-border"
                  />
                </td>
                <td className="font-mono text-foreground">{signal.leverage}</td>
                <td>{getRiskBadge(signal.risk)}</td>
                <td className="font-mono text-primary">{signal.profit}</td>
                <td>
                  <span className="flex items-center gap-1 text-warning font-mono">
                    <Clock className="w-3 h-3" />
                    {signal.expires}
                  </span>
                </td>
                <td>
                  <Button size="sm" className="btn-primary h-7 px-4">
                    Trade
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
