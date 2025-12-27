/**
 * Zerodha Trade History Component
 * Displays completed trades and trade history
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { 
  History,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Search,
  Calendar,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';

export interface ZerodhaTrade {
  trade_id: string;
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  product: string;
  fill_timestamp: string;
  exchange_timestamp: string;
  order_timestamp: string;
}

interface ZerodhaTradeHistoryProps {
  className?: string;
  pageSize?: number;
  showFilters?: boolean;
  autoRefresh?: boolean;
}

export function ZerodhaTradeHistory({
  className = '',
  pageSize = 50,
  showFilters = true,
  autoRefresh = false,
}: ZerodhaTradeHistoryProps) {
  const [trades, setTrades] = useState<ZerodhaTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filters
  const [symbolFilter, setSymbolFilter] = useState('');
  const [transactionFilter, setTransactionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);

  // Fetch trades
  const fetchTrades = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
      });

      if (symbolFilter) params.append('symbol', symbolFilter);
      if (transactionFilter !== 'ALL') params.append('transaction_type', transactionFilter);
      if (dateFilter) params.append('date', dateFilter);

      const response = await fetch(`/api/zerodha/trades?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch trades');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setTrades(data.data);
        setTotalTrades(data.pagination?.total || data.data.length);
      } else {
        throw new Error('No trade data available');
      }
    } catch (error) {
      console.error('Failed to fetch trades:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch trades');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchTrades();
  }, [currentPage, symbolFilter, transactionFilter, dateFilter]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchTrades(false);
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTrades(false);
  };

  const handleExport = () => {
    if (trades.length === 0) {
      toast.error('No trades to export');
      return;
    }

    const csvContent = [
      'Trade ID,Order ID,Symbol,Exchange,Type,Quantity,Price,Value,Product,Fill Time',
      ...trades.map(trade => 
        `${trade.trade_id},${trade.order_id},${trade.tradingsymbol},${trade.exchange},${trade.transaction_type},${trade.quantity},${trade.price},${(trade.quantity * trade.price).toFixed(2)},${trade.product},${trade.fill_timestamp}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zerodha_trades_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast.success('Trade history exported successfully');
  };

  const clearFilters = () => {
    setSymbolFilter('');
    setTransactionFilter('ALL');
    setDateFilter('');
    setCurrentPage(1);
  };

  const getTransactionIcon = (transactionType: string) => {
    return transactionType === 'BUY' ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const getTransactionBadge = (transactionType: string) => {
    return (
      <Badge 
        variant={transactionType === 'BUY' ? 'default' : 'destructive'}
        className={transactionType === 'BUY' ? 'bg-green-100 text-green-800 border-green-200' : ''}
      >
        {transactionType}
      </Badge>
    );
  };

  const formatPrice = (price: number) => {
    return `₹${price.toFixed(2)}`;
  };

  const formatDateTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const calculateTradeValue = (quantity: number, price: number) => {
    return quantity * price;
  };

  // Calculate summary statistics
  const tradeSummary = {
    totalTrades: trades.length,
    totalBuyTrades: trades.filter(t => t.transaction_type === 'BUY').length,
    totalSellTrades: trades.filter(t => t.transaction_type === 'SELL').length,
    totalValue: trades.reduce((sum, trade) => sum + calculateTradeValue(trade.quantity, trade.price), 0),
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <History className="h-12 w-12 text-red-500 mx-auto" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5" />
            <span>Trade History</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={trades.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold">{tradeSummary.totalTrades}</div>
            <div className="text-sm text-muted-foreground">Total Trades</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{tradeSummary.totalBuyTrades}</div>
            <div className="text-sm text-muted-foreground">Buy Trades</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{tradeSummary.totalSellTrades}</div>
            <div className="text-sm text-muted-foreground">Sell Trades</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">₹{tradeSummary.totalValue.toFixed(0)}</div>
            <div className="text-sm text-muted-foreground">Total Value</div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-4 p-4 border rounded-lg">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search symbol..."
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="w-40"
              />
            </div>
            
            <Select value={transactionFilter} onValueChange={(value: 'ALL' | 'BUY' | 'SELL') => setTransactionFilter(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="BUY">Buy Only</SelectItem>
                <SelectItem value="SELL">Sell Only</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-40"
              />
            </div>

            <Button variant="outline" size="sm" onClick={clearFilters}>
              <Filter className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        )}

        {/* Trade Table */}
        {trades.length === 0 ? (
          <div className="text-center py-8">
            <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No trades found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Fill Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade.trade_id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{trade.tradingsymbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {trade.exchange}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getTransactionIcon(trade.transaction_type)}
                        {getTransactionBadge(trade.transaction_type)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{trade.quantity}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(trade.price)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        ₹{calculateTradeValue(trade.quantity, trade.price).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {trade.product}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {formatDateTime(trade.fill_timestamp)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalTrades > pageSize && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalTrades)} of {totalTrades} trades
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {Math.ceil(totalTrades / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={currentPage >= Math.ceil(totalTrades / pageSize)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaTradeHistory;