/**
 * Zerodha Order Book Component
 * Displays current orders with modification and cancellation options
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  MoreHorizontal,
  Edit3,
  X,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export interface ZerodhaOrder {
  order_id: string;
  exchange_order_id?: string;
  parent_order_id?: string;
  status: 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'CANCELLED AMO' | 'REJECTED' | 'MODIFY_PENDING' | 'CANCEL_PENDING';
  status_message?: string;
  order_timestamp: string;
  exchange_timestamp?: string;
  variety: string;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  order_type: string;
  transaction_type: string;
  validity: string;
  product: string;
  quantity: number;
  disclosed_quantity: number;
  price: number;
  trigger_price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  cancelled_quantity: number;
  tag?: string;
}

interface ZerodhaOrderBookProps {
  className?: string;
  showCompleted?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onOrderModify?: (orderId: string) => void;
  onOrderCancel?: (orderId: string) => void;
}

export function ZerodhaOrderBook({
  className = '',
  showCompleted = false,
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  onOrderModify,
  onOrderCancel,
}: ZerodhaOrderBookProps) {
  const [orders, setOrders] = useState<ZerodhaOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch orders
  const fetchOrders = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const response = await fetch('/api/zerodha/orders', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        let orderList = data.data;
        
        // Filter orders based on showCompleted flag
        if (!showCompleted) {
          orderList = orderList.filter((order: ZerodhaOrder) => 
            !['COMPLETE', 'CANCELLED', 'REJECTED'].includes(order.status)
          );
        }
        
        // Sort by order timestamp (newest first)
        orderList.sort((a: ZerodhaOrder, b: ZerodhaOrder) => 
          new Date(b.order_timestamp).getTime() - new Date(a.order_timestamp).getTime()
        );
        
        setOrders(orderList);
      } else {
        throw new Error('No order data available');
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch orders');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchOrders();
  }, [showCompleted]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchOrders(false);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchOrders(false);
  };

  const handleModifyOrder = async (orderId: string) => {
    try {
      onOrderModify?.(orderId);
    } catch (error) {
      console.error('Order modification failed:', error);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/zerodha/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to cancel order');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success('Order cancelled successfully');
        fetchOrders(false); // Refresh orders
        onOrderCancel?.(orderId);
      } else {
        throw new Error(result.error?.message || 'Order cancellation failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Order cancellation failed';
      toast.error(errorMessage);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'OPEN': { variant: 'default' as const, icon: Clock, color: 'text-blue-600' },
      'COMPLETE': { variant: 'default' as const, icon: CheckCircle, color: 'text-green-600' },
      'CANCELLED': { variant: 'secondary' as const, icon: XCircle, color: 'text-gray-600' },
      'CANCELLED AMO': { variant: 'secondary' as const, icon: XCircle, color: 'text-gray-600' },
      'REJECTED': { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' },
      'MODIFY_PENDING': { variant: 'outline' as const, icon: AlertCircle, color: 'text-yellow-600' },
      'CANCEL_PENDING': { variant: 'outline' as const, icon: AlertCircle, color: 'text-yellow-600' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['OPEN'];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center space-x-1">
        <Icon className="h-3 w-3" />
        <span>{status}</span>
      </Badge>
    );
  };

  const getTransactionIcon = (transactionType: string) => {
    return transactionType === 'BUY' ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  const formatPrice = (price: number) => {
    return price > 0 ? `₹${price.toFixed(2)}` : '-';
  };

  const formatDateTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const canModifyOrder = (order: ZerodhaOrder) => {
    return ['OPEN'].includes(order.status) && order.order_type !== 'MARKET';
  };

  const canCancelOrder = (order: ZerodhaOrder) => {
    return ['OPEN', 'MODIFY_PENDING'].includes(order.status);
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
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
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
          <span>Order Book</span>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {orders.length} {orders.length === 1 ? 'Order' : 'Orders'}
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

      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.order_id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          {getTransactionIcon(order.transaction_type)}
                          <span className="font-medium">{order.tradingsymbol}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {order.exchange} • {order.product}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {order.order_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{order.quantity}</div>
                        {order.filled_quantity > 0 && (
                          <div className="text-xs text-green-600">
                            Filled: {order.filled_quantity}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{formatPrice(order.price)}</div>
                        {order.trigger_price > 0 && (
                          <div className="text-xs text-muted-foreground">
                            Trigger: {formatPrice(order.trigger_price)}
                          </div>
                        )}
                        {order.average_price > 0 && (
                          <div className="text-xs text-green-600">
                            Avg: {formatPrice(order.average_price)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(order.status)}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(order.order_timestamp)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(canModifyOrder(order) || canCancelOrder(order)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canModifyOrder(order) && (
                              <DropdownMenuItem
                                onClick={() => handleModifyOrder(order.order_id)}
                              >
                                <Edit3 className="mr-2 h-4 w-4" />
                                Modify
                              </DropdownMenuItem>
                            )}
                            {canCancelOrder(order) && (
                              <DropdownMenuItem
                                onClick={() => handleCancelOrder(order.order_id)}
                                className="text-red-600"
                              >
                                <X className="mr-2 h-4 w-4" />
                                Cancel
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaOrderBook;