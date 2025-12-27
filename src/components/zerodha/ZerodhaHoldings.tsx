/**
 * Zerodha Holdings Component
 * Displays long-term investment holdings with P&L information
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { 
  Briefcase,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  PieChart,
  BarChart3
} from 'lucide-react';

export interface ZerodhaHolding {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  price: number;
  quantity: number;
  used_quantity: number;
  t1_quantity: number;
  realised_quantity: number;
  authorised_quantity: number;
  authorised_date: string;
  opening_quantity: number;
  collateral_quantity: number;
  collateral_type: string;
  discrepancy: boolean;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

interface ZerodhaHoldingsProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showSearch?: boolean;
}

export function ZerodhaHoldings({
  className = '',
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
  showSearch = true,
}: ZerodhaHoldingsProps) {
  const [holdings, setHoldings] = useState<ZerodhaHolding[]>([]);
  const [filteredHoldings, setFilteredHoldings] = useState<ZerodhaHolding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch holdings
  const fetchHoldings = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const response = await fetch('/api/zerodha/portfolio/holdings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch holdings');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setHoldings(data.data);
        setFilteredHoldings(data.data);
      } else {
        throw new Error('No holdings data available');
      }
    } catch (error) {
      console.error('Failed to fetch holdings:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch holdings');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchHoldings();
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchHoldings(false);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  // Filter holdings based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredHoldings(holdings);
    } else {
      const filtered = holdings.filter(holding =>
        holding.tradingsymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        holding.isin.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredHoldings(filtered);
    }
  }, [holdings, searchQuery]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchHoldings(false);
  };

  const formatPrice = (price: number) => {
    return `₹${price.toFixed(2)}`;
  };

  const formatPnL = (pnl: number) => {
    const color = pnl >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = pnl >= 0 ? '+' : '';
    return (
      <span className={color}>
        {sign}₹{pnl.toFixed(2)}
      </span>
    );
  };

  const formatPercentage = (percentage: number) => {
    const color = percentage >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = percentage >= 0 ? '+' : '';
    return (
      <span className={color}>
        {sign}{percentage.toFixed(2)}%
      </span>
    );
  };

  const calculateCurrentValue = (holding: ZerodhaHolding) => {
    return holding.quantity * holding.last_price;
  };

  const calculateInvestedValue = (holding: ZerodhaHolding) => {
    return holding.quantity * holding.average_price;
  };

  const calculatePnLPercentage = (holding: ZerodhaHolding) => {
    const investedValue = calculateInvestedValue(holding);
    if (investedValue === 0) return 0;
    return (holding.pnl / investedValue) * 100;
  };

  // Calculate summary statistics
  const summary = {
    totalHoldings: filteredHoldings.length,
    totalInvested: filteredHoldings.reduce((sum, holding) => sum + calculateInvestedValue(holding), 0),
    totalCurrent: filteredHoldings.reduce((sum, holding) => sum + calculateCurrentValue(holding), 0),
    totalPnL: filteredHoldings.reduce((sum, holding) => sum + holding.pnl, 0),
    totalDayChange: filteredHoldings.reduce((sum, holding) => sum + holding.day_change, 0),
    gainers: filteredHoldings.filter(holding => holding.pnl > 0).length,
    losers: filteredHoldings.filter(holding => holding.pnl < 0).length,
  };

  const overallPnLPercentage = summary.totalInvested > 0 
    ? (summary.totalPnL / summary.totalInvested) * 100 
    : 0;

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
            <Briefcase className="h-12 w-12 text-red-500 mx-auto" />
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
            <Briefcase className="h-5 w-5" />
            <span>Holdings</span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {summary.totalHoldings} {summary.totalHoldings === 1 ? 'Stock' : 'Stocks'}
            </Badge>
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
            <div className="text-2xl font-bold">₹{summary.totalCurrent.toFixed(0)}</div>
            <div className="text-sm text-muted-foreground">Current Value</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">₹{summary.totalInvested.toFixed(0)}</div>
            <div className="text-sm text-muted-foreground">Invested</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnL(summary.totalPnL).props.children}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPercentage(overallPnLPercentage).props.children}
            </div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${summary.totalDayChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnL(summary.totalDayChange).props.children}
            </div>
            <div className="text-sm text-muted-foreground">Day Change</div>
          </div>
        </div>

        {/* Gainers/Losers Summary */}
        <div className="flex justify-center space-x-8 text-sm">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-green-600 font-medium">{summary.gainers} Gainers</span>
          </div>
          <div className="flex items-center space-x-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="text-red-600 font-medium">{summary.losers} Losers</span>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search holdings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        )}

        {/* Holdings Table */}
        {filteredHoldings.length === 0 ? (
          <div className="text-center py-8">
            <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No holdings match your search' : 'No holdings found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Avg Price</TableHead>
                  <TableHead>LTP</TableHead>
                  <TableHead>Current Value</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Day Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHoldings.map((holding) => (
                  <TableRow key={holding.isin}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{holding.tradingsymbol}</div>
                        <div className="text-xs text-muted-foreground">
                          {holding.exchange}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{holding.quantity}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(holding.average_price)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(holding.last_price)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        ₹{calculateCurrentValue(holding).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{formatPnL(holding.pnl)}</div>
                        <div className="text-xs">
                          {formatPercentage(calculatePnLPercentage(holding))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{formatPnL(holding.day_change)}</div>
                        <div className="text-xs">
                          {formatPercentage(holding.day_change_percentage)}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Portfolio Allocation Hint */}
        {filteredHoldings.length > 0 && (
          <div className="text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center space-x-2">
              <PieChart className="h-4 w-4" />
              <span>Portfolio diversified across {summary.totalHoldings} stocks</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaHoldings;