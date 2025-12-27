/**
 * Zerodha Price Widget Component
 * Displays real-time price data for a single instrument
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Activity,
  Volume2,
  Clock
} from 'lucide-react';

export interface ZerodhaQuote {
  instrument_token: number;
  timestamp: string;
  last_price: number;
  last_quantity: number;
  last_trade_time: string;
  average_price: number;
  volume: number;
  buy_quantity: number;
  sell_quantity: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  net_change: number;
  change_percent?: number;
}

interface ZerodhaPriceWidgetProps {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  instrumentToken?: number;
  className?: string;
  compact?: boolean;
  showVolume?: boolean;
  showOHLC?: boolean;
}

export function ZerodhaPriceWidget({
  symbol,
  exchange,
  instrumentToken,
  className = '',
  compact = false,
  showVolume = true,
  showOHLC = true,
}: ZerodhaPriceWidgetProps) {
  const [quote, setQuote] = useState<ZerodhaQuote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch initial quote data
  useEffect(() => {
    const fetchQuote = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/zerodha/market/quotes?symbols=${symbol}&exchange=${exchange}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quote data');
        }

        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
          const quoteData = data.data[0];
          // Calculate change percentage
          const changePercent = quoteData.ohlc.close > 0 
            ? ((quoteData.net_change / quoteData.ohlc.close) * 100)
            : 0;
          
          setQuote({
            ...quoteData,
            change_percent: changePercent,
          });
        } else {
          throw new Error('No quote data available');
        }
      } catch (error) {
        console.error('Failed to fetch quote:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch quote');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuote();
  }, [symbol, exchange]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      try {
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/market-data`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected for price updates');
          setIsConnected(true);
          
          // Subscribe to symbol updates
          ws?.send(JSON.stringify({
            type: 'subscribe',
            symbols: [`${exchange}:${symbol}`],
          }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'tick' && message.data) {
              const tickData = message.data;
              
              // Update quote if it matches our symbol
              if (tickData.tradingsymbol === symbol) {
                const changePercent = tickData.ohlc.close > 0 
                  ? (((tickData.last_price - tickData.ohlc.close) / tickData.ohlc.close) * 100)
                  : 0;

                setQuote(prev => ({
                  ...prev,
                  ...tickData,
                  net_change: tickData.last_price - tickData.ohlc.close,
                  change_percent: changePercent,
                  timestamp: new Date().toISOString(),
                }));
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

  const formatVolume = (volume: number) => {
    if (volume >= 10000000) {
      return `${(volume / 10000000).toFixed(1)}Cr`;
    } else if (volume >= 100000) {
      return `${(volume / 100000).toFixed(1)}L`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  };

  const getPriceChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getPriceChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4" />;
    if (change < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-16" />
          {!compact && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </>
          )}
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

  if (!quote) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center space-y-2">
            <Activity className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className={`flex items-center justify-between p-3 border rounded-lg ${className}`}>
        <div className="flex items-center space-x-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">{symbol}</span>
              <Badge variant="outline" className="text-xs">{exchange}</Badge>
              {isConnected && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(quote.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-lg font-bold">₹{formatPrice(quote.last_price)}</div>
          <div className={`flex items-center space-x-1 text-sm ${getPriceChangeColor(quote.net_change)}`}>
            {getPriceChangeIcon(quote.net_change)}
            <span>₹{Math.abs(quote.net_change).toFixed(2)}</span>
            <span>({quote.change_percent?.toFixed(2)}%)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center space-x-2">
            <span>{symbol}</span>
            <Badge variant="outline">{exchange}</Badge>
          </div>
          <div className="flex items-center space-x-2">
            {isConnected ? (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-600">Live</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-xs text-red-600">Offline</span>
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Price */}
        <div className="space-y-1">
          <div className="text-3xl font-bold">₹{formatPrice(quote.last_price)}</div>
          <div className={`flex items-center space-x-2 ${getPriceChangeColor(quote.net_change)}`}>
            {getPriceChangeIcon(quote.net_change)}
            <span className="font-medium">
              ₹{Math.abs(quote.net_change).toFixed(2)} ({quote.change_percent?.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* OHLC Data */}
        {showOHLC && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open:</span>
                <span className="font-medium">₹{formatPrice(quote.ohlc.open)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">High:</span>
                <span className="font-medium text-green-600">₹{formatPrice(quote.ohlc.high)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Low:</span>
                <span className="font-medium text-red-600">₹{formatPrice(quote.ohlc.low)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prev Close:</span>
                <span className="font-medium">₹{formatPrice(quote.ohlc.close)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Volume and Additional Info */}
        {showVolume && (
          <div className="flex items-center justify-between text-sm border-t pt-3">
            <div className="flex items-center space-x-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Volume:</span>
              <span className="font-medium">{formatVolume(quote.volume)}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {new Date(quote.last_trade_time).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaPriceWidget;