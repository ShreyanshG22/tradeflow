/**
 * Zerodha Positions Component
 * Displays current trading positions with P&L information
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  TrendingUp,
  TrendingDown,
  RefreshCw,
  PieChart,
  AlertTriangle,
  Target,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export interface ZerodhaPosition {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  overnight_quantity: number;
  multiplier: number;
  average_price: number;
  close_price: number;
  last_price: number;
  value: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  buy_quantity: number;
  buy_price: number;
  buy_value: number;
  buy_m2m: number;
  sell_quantity: number;
  sell_price: number;
  sell_value: number;
  sell_m2m: number;
  day_buy_quantity: number;
  day_buy_price: number;
  day_buy_value: number;
  day_sell_quantity: number;
  day_sell_price: number;
  day_sell_value: number;
}

interface ZerodhaPositionsProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showActions?: boolean;
  onSquareOff?: (position: ZerodhaPosition) => void;
}

export function ZerodhaPositions({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  showActions = true,
  onSquareOff,
}: ZerodhaPositionsProps) {
  const [positions, setPositions] = useState<ZerodhaPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch positions
  const fetchPositions = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const response = await fetch('/api/zerodha/portfolio/positions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch positions');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        // Filter out zero quantity positions
        const activePositions = data.data.filter((pos: ZerodhaPosition) => pos.quantity !== 0);
        setPositions(activePositions);
      } else {
        throw new Error('No position data available');
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch positions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchPositions();
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchPositions(false);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPositions(false);
  };

  const handleSquareOff = async (position: ZerodhaPosition) => {
    try {
      // Create opposite order to square off position
      const orderData = {
        exchange: position.exchange,
        tradingsymbol: position.tradingsymbol,
        transaction_type: position.quantity > 0 ? 'SELL' : 'BUY',
        quantity: Math.abs(position.quantity),
        product: position.product,
        order_type: 'MARKET',
        validity: 'DAY',
      };

      const response = await fetch('/api/zerodha/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Failed to square off position');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success(`Square off order placed for ${position.tradingsymbol}`);
        fetchPositions(false); // Refresh positions
        onSquareOff?.(position);
      } else {
        throw new Error(result.error?.message || 'Square off failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Square off failed';
      toast.error(errorMessage);
    }
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

  const formatPnLPercent = (pnl: number, value: number) => {
    if (value === 0) return '0.00%';
    const percent = (pnl / Math.abs(value)) * 100;
    const color = percent >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = percent >= 0 ? '+' : '';
    return (
      <span className={color}>
        {sign}{percent.toFixed(2)}%
      </span>
    );
  };

  const getPositionIcon = (quantity: number) => {
    return quantity > 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const getPositionBadge = (quantity: number) => {
    return (
      <Badge 
        variant={quantity > 0 ? 'default' : 'destructive'}
        className={quantity > 0 ? 'bg-green-100 text-green-800 border-green-200' : ''}
      >
        {quantity > 0 ? 'LONG' : 'SHORT'}
      </Badge>
    );
  };

  // Calculate summary statistics
  const summary = {
    totalPositions: positions.length,
    totalPnL: positions.reduce((sum, pos) => sum + pos.pnl, 0),
    totalUnrealised: positions.reduce((sum, pos) => sum + pos.unrealised, 0),
    totalValue: positions.reduce((sum, pos) => sum + Math.abs(pos.value), 0),
    longPositions: positions.filter(pos => pos.quantity > 0).length,
    shortPositions: positions.filter(pos => pos.quantity < 0).length,
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
            <PieChart className="h-12 w-12 text-red-500 mx-auto" />
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
            <PieChart className="h-5 w-5" />
            <span>Positions</span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {summary.totalPositions} {summary.totalPositions === 1 ? 'Position' : 'Positions'}
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
            <div className="text-2xl font-bold">{summary.totalPositions}</div>
            <div className="text-sm text-muted-foreground">Total Positions</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnL(summary.totalPnL).props.children}
            </div>
            <div className="text-sm text-muted-foreground">Total P&L</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.longPositions}</div>
            <div className="text-sm text-muted-foreground">Long</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.shortPositions}</div>
            <div className="text-sm text-muted-foreground">Short</div>
          </div>
        </div>

        {/* Positions Table */}
        {positions.length === 0 ? (
          <div className="text-center py-8">
            <PieChart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No open positions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Avg Price</TableHead>
                  <TableHead>LTP</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Value</TableHead>
                  {showActions && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={`${position.tradingsymbol}-${position.product}`}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          {getPositionIcon(position.quantity)}
                          <span className="font-medium">{position.tradingsymbol}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {position.exchange} • {position.product}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getPositionBadge(position.quantity)}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{Math.abs(position.quantity)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(position.average_price)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(position.last_price)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{formatPnL(position.pnl)}</div>
                        <div className="text-xs">
                          {formatPnLPercent(position.pnl, position.value)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatPrice(Math.abs(position.value))}</span>
                    </TableCell>
                    {showActions && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleSquareOff(position)}
                              className="text-red-600"
                            >
                              <Target className="mr-2 h-4 w-4" />
                              Square Off
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Risk Warning */}
        {positions.some(pos => pos.product === 'MIS') && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Intraday Positions Alert
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                  MIS positions will be auto-squared off before market close. Please monitor your positions closely.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaPositions;