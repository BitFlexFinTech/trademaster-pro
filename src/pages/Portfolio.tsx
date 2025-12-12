import { useState } from 'react';
import { usePortfolioManagement } from '@/hooks/usePortfolioManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Wallet, 
  Plus, 
  Edit2, 
  Trash2, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const POPULAR_ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC'];
const EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Kraken', 'Coinbase', 'KuCoin', 'Other'];

export default function Portfolio() {
  const { holdings, loading, totalValue, totalPnl, addHolding, updateHolding, deleteHolding } = usePortfolioManagement();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [assetSymbol, setAssetSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [exchange, setExchange] = useState('');
  
  // Edit state
  const [editQuantity, setEditQuantity] = useState('');
  const [editAvgPrice, setEditAvgPrice] = useState('');

  const handleAddHolding = async () => {
    if (!assetSymbol || !quantity || !avgPrice) return;
    
    const success = await addHolding({
      assetSymbol,
      quantity: parseFloat(quantity),
      averageBuyPrice: parseFloat(avgPrice),
      exchangeName: exchange || undefined,
    });

    if (success) {
      setIsAddDialogOpen(false);
      resetForm();
    }
  };

  const handleUpdateHolding = async (id: string) => {
    if (!editQuantity || !editAvgPrice) return;
    
    const success = await updateHolding(id, {
      quantity: parseFloat(editQuantity),
      averageBuyPrice: parseFloat(editAvgPrice),
    });

    if (success) {
      setEditingId(null);
    }
  };

  const handleDeleteHolding = async (id: string) => {
    await deleteHolding(id);
  };

  const startEditing = (holding: typeof holdings[0]) => {
    setEditingId(holding.id);
    setEditQuantity(holding.quantity.toString());
    setEditAvgPrice(holding.averageBuyPrice.toString());
  };

  const resetForm = () => {
    setAssetSymbol('');
    setQuantity('');
    setAvgPrice('');
    setExchange('');
  };

  const totalPnlPercent = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Portfolio Holdings</h1>
          <span className="live-indicator">{holdings.length} Assets</span>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Add Holding
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Holding</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Asset Symbol</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {POPULAR_ASSETS.slice(0, 5).map(asset => (
                    <Button
                      key={asset}
                      size="sm"
                      variant={assetSymbol === asset ? 'default' : 'outline'}
                      onClick={() => setAssetSymbol(asset)}
                      className="h-7 text-xs"
                    >
                      {asset}
                    </Button>
                  ))}
                </div>
                <Input
                  placeholder="e.g., BTC, ETH, SOL"
                  value={assetSymbol}
                  onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Quantity</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    step="any"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Avg Buy Price ($)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    step="any"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Exchange (Optional)</label>
                <Select value={exchange} onValueChange={setExchange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select exchange" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXCHANGES.map(ex => (
                      <SelectItem key={ex} value={ex}>{ex}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full btn-primary" onClick={handleAddHolding}>
                Add to Portfolio
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 flex-shrink-0">
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <DollarSign className="w-3 h-3" />
            Total Value
          </div>
          <p className="text-xl font-bold text-foreground font-mono">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card-terminal p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            {totalPnl >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            Total P&L
          </div>
          <p className={cn('text-xl font-bold font-mono', totalPnl >= 0 ? 'text-primary' : 'text-destructive')}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card-terminal p-4">
          <div className="text-muted-foreground text-xs mb-1">P&L %</div>
          <p className={cn('text-xl font-bold font-mono', totalPnlPercent >= 0 ? 'text-primary' : 'text-destructive')}>
            {totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%
          </p>
        </div>
        <div className="card-terminal p-4">
          <div className="text-muted-foreground text-xs mb-1">Assets</div>
          <p className="text-xl font-bold text-foreground font-mono">{holdings.length}</p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="card-terminal flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-foreground">Holdings</h3>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Holdings Yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Add your first cryptocurrency holding to start tracking your portfolio
            </p>
            <Button className="btn-primary gap-2" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4" />
              Add First Holding
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <table className="w-full">
              <thead className="sticky top-0 bg-card">
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-3 font-medium">Asset</th>
                  <th className="text-right p-3 font-medium">Quantity</th>
                  <th className="text-right p-3 font-medium">Avg Price</th>
                  <th className="text-right p-3 font-medium">Current Price</th>
                  <th className="text-right p-3 font-medium">Value</th>
                  <th className="text-right p-3 font-medium">P&L</th>
                  <th className="text-center p-3 font-medium">Exchange</th>
                  <th className="text-center p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr key={holding.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3">
                      <span className="font-semibold text-foreground">{holding.assetSymbol}</span>
                    </td>
                    <td className="p-3 text-right">
                      {editingId === holding.id ? (
                        <Input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="h-7 w-24 text-right text-xs ml-auto"
                        />
                      ) : (
                        <span className="font-mono text-foreground">{holding.quantity}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {editingId === holding.id ? (
                        <Input
                          type="number"
                          value={editAvgPrice}
                          onChange={(e) => setEditAvgPrice(e.target.value)}
                          className="h-7 w-24 text-right text-xs ml-auto"
                        />
                      ) : (
                        <span className="font-mono text-muted-foreground">${holding.averageBuyPrice.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-foreground">${holding.currentPrice.toLocaleString()}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono text-foreground">${holding.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className={cn('font-mono', holding.pnl >= 0 ? 'text-primary' : 'text-destructive')}>
                        <div>{holding.pnl >= 0 ? '+' : ''}${holding.pnl.toFixed(2)}</div>
                        <div className="text-xs opacity-75">{holding.pnlPercent >= 0 ? '+' : ''}{holding.pnlPercent.toFixed(2)}%</div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-xs text-muted-foreground">{holding.exchangeName || '-'}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        {editingId === holding.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-primary"
                              onClick={() => handleUpdateHolding(holding.id)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startEditing(holding)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteHolding(holding.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
