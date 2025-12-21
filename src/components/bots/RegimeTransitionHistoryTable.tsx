import { useState, useMemo } from 'react';
import { useRegimeHistory, RegimeHistoryEntry } from '@/hooks/useRegimeHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  ArrowUpDown, 
  TrendingUp, 
  TrendingDown, 
  Waves, 
  Calendar, 
  Clock, 
  Download, 
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { cn, exportToCSV } from '@/lib/utils';

interface RegimeTransitionHistoryTableProps {
  symbol?: string;
  className?: string;
}

type SortField = 'started_at' | 'pnl_during_regime' | 'duration_minutes' | 'trades_during_regime';
type SortDirection = 'asc' | 'desc';
type RegimeFilter = 'all' | 'BULL' | 'BEAR' | 'CHOP';

const ITEMS_PER_PAGE = 10;

export function RegimeTransitionHistoryTable({ 
  symbol = 'BTCUSDT',
  className 
}: RegimeTransitionHistoryTableProps) {
  const { history, stats, isLoading, error } = useRegimeHistory(symbol, 30);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('started_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Filter state
  const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Get regime icon
  const getRegimeIcon = (regime: string) => {
    switch (regime) {
      case 'BULL': return <TrendingUp className="w-3 h-3" />;
      case 'BEAR': return <TrendingDown className="w-3 h-3" />;
      case 'CHOP': return <Waves className="w-3 h-3" />;
      default: return null;
    }
  };

  // Get regime color class
  const getRegimeColor = (regime: string) => {
    switch (regime) {
      case 'BULL': return 'bg-chart-2/20 text-chart-2 border-chart-2/30';
      case 'BEAR': return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'CHOP': return 'bg-chart-4/20 text-chart-4 border-chart-4/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Format duration
  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (hours < 24) return `${hours}h ${remainingMins}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  };

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filtered and sorted data
  const processedData = useMemo(() => {
    let filtered = history;
    
    // Apply regime filter
    if (regimeFilter !== 'all') {
      filtered = filtered.filter(h => h.regime === regimeFilter);
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortField) {
        case 'started_at':
          aVal = new Date(a.started_at).getTime();
          bVal = new Date(b.started_at).getTime();
          break;
        case 'pnl_during_regime':
          aVal = a.pnl_during_regime || 0;
          bVal = b.pnl_during_regime || 0;
          break;
        case 'duration_minutes':
          aVal = a.duration_minutes || 0;
          bVal = b.duration_minutes || 0;
          break;
        case 'trades_during_regime':
          aVal = a.trades_during_regime || 0;
          bVal = b.trades_during_regime || 0;
          break;
        default:
          return 0;
      }
      
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    
    return sorted;
  }, [history, regimeFilter, sortField, sortDirection]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [processedData, currentPage]);

  const totalPages = Math.ceil(processedData.length / ITEMS_PER_PAGE);

  // Reset to page 1 when filter changes
  const handleFilterChange = (value: RegimeFilter) => {
    setRegimeFilter(value);
    setCurrentPage(1);
  };

  // Export to CSV
  const handleExport = () => {
    if (processedData.length === 0) return;
    
    const csvData = processedData.map(entry => ({
      'Started': format(new Date(entry.started_at), 'yyyy-MM-dd HH:mm'),
      'Ended': entry.ended_at ? format(new Date(entry.ended_at), 'yyyy-MM-dd HH:mm') : 'Active',
      'Regime': entry.regime,
      'Duration (min)': entry.duration_minutes || 0,
      'P&L ($)': (entry.pnl_during_regime || 0).toFixed(2),
      'Trades': entry.trades_during_regime || 0,
      'Avg P&L/Trade': entry.trades_during_regime > 0 
        ? ((entry.pnl_during_regime || 0) / entry.trades_during_regime).toFixed(2) 
        : '0.00',
    }));
    
    exportToCSV(csvData, `regime-history-${symbol}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  // Sort indicator
  const SortIndicator = ({ field }: { field: SortField }) => (
    <ArrowUpDown 
      className={cn(
        "w-3 h-3 ml-1 inline-block transition-colors",
        sortField === field ? "text-primary" : "text-muted-foreground"
      )} 
    />
  );

  if (isLoading) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardHeader className="p-3 pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("card-terminal", className)}>
        <CardContent className="p-4">
          <p className="text-destructive text-sm">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("card-terminal", className)}>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Regime Transition History
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {/* Filter */}
            <Select value={regimeFilter} onValueChange={(v) => handleFilterChange(v as RegimeFilter)}>
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="BULL">BULL</SelectItem>
                <SelectItem value="BEAR">BEAR</SelectItem>
                <SelectItem value="CHOP">CHOP</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Export */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 text-xs"
              onClick={handleExport}
              disabled={processedData.length === 0}
            >
              <Download className="w-3 h-3 mr-1" />
              CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 pt-0">
        {processedData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No regime transitions found
          </div>
        ) : (
          <>
            <ScrollArea className="h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead 
                      className="text-xs cursor-pointer hover:text-foreground w-[120px]"
                      onClick={() => handleSort('started_at')}
                    >
                      Started <SortIndicator field="started_at" />
                    </TableHead>
                    <TableHead className="text-xs w-[80px]">Regime</TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:text-foreground text-right w-[90px]"
                      onClick={() => handleSort('duration_minutes')}
                    >
                      Duration <SortIndicator field="duration_minutes" />
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:text-foreground text-right w-[80px]"
                      onClick={() => handleSort('pnl_during_regime')}
                    >
                      P&L <SortIndicator field="pnl_during_regime" />
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:text-foreground text-right w-[70px]"
                      onClick={() => handleSort('trades_during_regime')}
                    >
                      Trades <SortIndicator field="trades_during_regime" />
                    </TableHead>
                    <TableHead className="text-xs text-right w-[80px]">Avg P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((entry) => {
                    const avgPnL = entry.trades_during_regime > 0 
                      ? (entry.pnl_during_regime || 0) / entry.trades_during_regime 
                      : 0;
                    const isActive = !entry.ended_at;
                    
                    return (
                      <TableRow key={entry.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs py-2">
                          <div className="flex flex-col">
                            <span>{format(new Date(entry.started_at), 'MMM dd HH:mm')}</span>
                            {isActive && (
                              <span className="text-[10px] text-chart-2 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 animate-pulse" />
                                Active
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px] px-1.5 py-0 gap-1", getRegimeColor(entry.regime))}
                          >
                            {getRegimeIcon(entry.regime)}
                            {entry.regime}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-right py-2 font-mono">
                          {formatDuration(entry.duration_minutes)}
                        </TableCell>
                        <TableCell className={cn(
                          "text-xs text-right py-2 font-mono font-medium",
                          (entry.pnl_during_regime || 0) >= 0 ? "text-chart-2" : "text-destructive"
                        )}>
                          {(entry.pnl_during_regime || 0) >= 0 ? '+' : ''}
                          ${(entry.pnl_during_regime || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-right py-2 font-mono">
                          {entry.trades_during_regime || 0}
                        </TableCell>
                        <TableCell className={cn(
                          "text-xs text-right py-2 font-mono",
                          avgPnL >= 0 ? "text-chart-2" : "text-destructive"
                        )}>
                          {avgPnL >= 0 ? '+' : ''}${avgPnL.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                  {Math.min(currentPage * ITEMS_PER_PAGE, processedData.length)} of {processedData.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        
        {/* Summary Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
          <span>{stats.transitionsCount} total transitions</span>
          <div className="flex items-center gap-3">
            <span className="text-chart-2">BULL: ${stats.bullPnL.toFixed(2)}</span>
            <span className="text-destructive">BEAR: ${stats.bearPnL.toFixed(2)}</span>
            <span className="text-chart-4">CHOP: ${stats.chopPnL.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}