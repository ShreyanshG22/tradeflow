/**
 * Zerodha Market Depth Component
 * Displays order book with bid/ask levels
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown,
  Activity,
  RefreshCw
} from 'lucide-react';

export interface MarketDepthItem {
  price: number;
  quantity: number;
  orders: number;
}

export interface MarketDepthData {
  instrument_token: number;
  tradingsymbol: string;
  exchange: string;
  last_price: number;
  depth: {
    buy: MarketDepthItem[];
    sell: MarketDepthItem[];
  };
  timestamp: string;
}

interface ZerodhaMarketDepthProps {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  className?: string;
  levels?: number;
  showSpread?: boolean;
}

export function ZerodhaMarketDepth({
  symbol,
  exchange,
  className = '',
  levels = 5,
  showSpread = true,
}: ZerodhaMarketDepthProps) {
  const [depthData, setDepthData] = useState<MarketDepthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch initial market depth data
  useEffect(() => {
    const fetchMarketDepth = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/zerodha/market/depth?symbol=${symbol}&exchange=${exchange}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch market depth');
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          setDepthData(data.data);
          setLastUpdated(new Date());
        } else {
          throw new Error('No market depth data available');
        }
      } catch (error) {
        console.error('Failed to fetch market depth:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch market depth');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketDepth();
  }, [symbol, exchange]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/market-data`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected for market depth');
          setIsConnected(true);
          
          // Subscribe to depth updates
          ws?.send(JSON.stringify({
            type: 'subscribe_depth',
            symbols: [`${exchange}:${symbol}`],
          }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'depth' && message.data) {
              const depthUpdate = message.data;
              
              if (depthUpdate.tradingsymbol === symbol) {
                setDepthData(prev => ({
                  ...prev,
                  ...depthUpdate,
                  timestamp: new Date().toISOString(),
                }));
                setLastUpdated(new Date());
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
          
          // Attempt to reconnect after 5 seconds
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [symbol, exchange]);

  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  const formatQuantity = (quantity: number) => {
    if (quantity >= 100000) {
      return `${(quantity / 100000).toFixed(1)}L`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toString();
  };

  const calculateSpread = () => {
    if (!depthData || !depthData.depth.buy[0] || !depthData.depth.sell[0]) {
      return { absolute: 0, percentage: 0 };
    }

    const bestBid = depthData.depth.buy[0].price;
    const bestAsk = depthData.depth.sell[0].price;
    const absolute = bestAsk - bestBid;
    const percentage = ((absolute / bestBid) * 100);

    return { absolute, percentage };
  };

  const getMaxQuantity = () => {
    if (!depthData) return 0;
    
    const allQuantities = [
      ...depthData.depth.buy.map(item => item.quantity),
      ...depthData.depth.sell.map(item => item.quantity),
    ];
    
    return Math.max(...allQuantities);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: levels * 2 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center space-y-2">
            <Activity className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!depthData) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center space-y-2">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No market depth data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const spread = calculateSpread();
  const maxQuantity = getMaxQuantity();

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center space-x-2">
            <span>Market Depth</span>
            <Badge variant="outline">{symbol}</Badge>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-600">Live</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {lastUpdated?.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Spread Information */}
        {showSpread && spread.absolute > 0 && (
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Bid-Ask Spread:</span>
              <div className="text-right">
                <div className="font-medium">₹{spread.absolute.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">
                  {spread.percentage.toFixed(3)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Book */}
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground border-b pb-2">
            <div className="text-left">Bid Qty</div>
            <div className="text-center">Bid Price</div>
            <div className="text-center">Ask Price</div>
            <div className="text-right">Ask Qty</div>
          </div>

          {/* Depth Levels */}
          {Array.from({ length: levels }).map((_, index) => {
            const buyLevel = depthData.depth.buy[index];
            const sellLevel = depthData.depth.sell[index];

            return (
              <div key={index} className="grid grid-cols-4 gap-2 text-sm py-1 hover:bg-muted/30 rounded">
                {/* Bid Side */}
                <div className="text-left">
                  {buyLevel ? (
                    <div className="relative">
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="font-medium text-green-700">
                          {formatQuantity(buyLevel.quantity)}
                        </span>
                      </div>
                      <Progress 
                        value={(buyLevel.quantity / maxQuantity) * 100}
                        className="h-1 mt-1 [&>div]:bg-green-200"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>

                <div className="text-center">
                  {buyLevel ? (
                    <span className="font-medium text-green-600">
                      ₹{formatPrice(buyLevel.price)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>

                <div className="text-center">
                  {sellLevel ? (
                    <span className="font-medium text-red-600">
                      ₹{formatPrice(sellLevel.price)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>

                {/* Ask Side */}
                <div className="text-right">
                  {sellLevel ? (
                    <div className="relative">
                      <div className="flex items-center justify-end space-x-1">
                        <span className="font-medium text-red-700">
                          {formatQuantity(sellLevel.quantity)}
                        </span>
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      </div>
                      <Progress 
                        value={(sellLevel.quantity / maxQuantity) * 100}
                        className="h-1 mt-1 [&>div]:bg-red-200"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="border-t pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Total Bid Qty:</span>
            <span className="font-medium">
              {formatQuantity(depthData.depth.buy.reduce((sum, item) => sum + item.quantity, 0))}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total Ask Qty:</span>
            <span className="font-medium">
              {formatQuantity(depthData.depth.sell.reduce((sum, item) => sum + item.quantity, 0))}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ZerodhaMarketDepth;