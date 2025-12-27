/**
 * Zerodha Historical Chart Component
 * Displays historical price data with candlestick charts
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  RefreshCw,
  Download
} from 'lucide-react';

export interface ZerodhaHistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

interface ZerodhaHistoricalChartProps {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  className?: string;
  defaultTimeframe?: string;
  showControls?: boolean;
  height?: number;
}

const TIMEFRAMES = [
  { value: '1d', label: '1 Day', days: 1 },
  { value: '1w', label: '1 Week', days: 7 },
  { value: '1M', label: '1 Month', days: 30 },
  { value: '3M', label: '3 Months', days: 90 },
  { value: '6M', label: '6 Months', days: 180 },
  { value: '1Y', label: '1 Year', days: 365 },
];

export function ZerodhaHistoricalChart({
  symbol,
  exchange,
  className = '',
  defaultTimeframe = '1M',
  showControls = true,
  height = 400,
}: ZerodhaHistoricalChartProps) {
  const [historicalData, setHistoricalData] = useState<ZerodhaHistoricalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate date range based on timeframe
  const getDateRange = (tf: string) => {
    const endDate = new Date();
    const startDate = new Date();
    const timeframeConfig = TIMEFRAMES.find(t => t.value === tf);
    
    if (timeframeConfig) {
      startDate.setDate(endDate.getDate() - timeframeConfig.days);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  };

  // Fetch historical data
  const fetchHistoricalData = async (tf: string = timeframe) => {
    try {
      setIsLoading(true);
      setError(null);

      const { start, end } = getDateRange(tf);
      
      const response = await fetch(
        `/api/zerodha/market/historical?symbol=${symbol}&exchange=${exchange}&timeframe=${tf}&start=${start}&end=${end}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch historical data');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setHistoricalData(data.data);
      } else {
        throw new Error('No historical data available');
      }
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch historical data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData();
  }, [symbol, exchange, timeframe]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchHistoricalData();
  };

  const handleTimeframeChange = (newTimeframe: string) => {
    setTimeframe(newTimeframe);
  };

  const handleDownload = () => {
    if (historicalData.length === 0) return;

    const csvContent = [
      'Date,Open,High,Low,Close,Volume',
      ...historicalData.map(item => 
        `${item.date},${item.open},${item.high},${item.low},${item.close},${item.volume}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${exchange}_${timeframe}_historical.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Calculate price statistics
  const priceStats = useMemo(() => {
    if (historicalData.length === 0) return null;

    const prices = historicalData.map(d => d.close);
    const firstPrice = historicalData[0].close;
    const lastPrice = historicalData[historicalData.length - 1].close;
    const change = lastPrice - firstPrice;
    const changePercent = (change / firstPrice) * 100;
    const high = Math.max(...historicalData.map(d => d.high));
    const low = Math.min(...historicalData.map(d => d.low));
    const avgVolume = historicalData.reduce((sum, d) => sum + d.volume, 0) / historicalData.length;

    return {
      firstPrice,
      lastPrice,
      change,
      changePercent,
      high,
      low,
      avgVolume,
    };
  }, [historicalData]);

  // Simple candlestick visualization (SVG-based)
  const renderCandlestickChart = () => {
    if (historicalData.length === 0) return null;

    const chartWidth = 800;
    const chartHeight = height - 100;
    const padding = 40;
    const candleWidth = Math.max(2, (chartWidth - 2 * padding) / historicalData.length - 2);

    const prices = historicalData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    const getY = (price: number) => {
      return chartHeight - padding - ((price - minPrice) / priceRange) * (chartHeight - 2 * padding);
    };

    const getX = (index: number) => {
      return padding + (index * (chartWidth - 2 * padding)) / historicalData.length;
    };

    return (
      <div className="w-full overflow-x-auto">
        <svg width={chartWidth} height={chartHeight} className="border rounded">
          {/* Grid lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = padding + (i * (chartHeight - 2 * padding)) / 4;
            const price = maxPrice - (i * priceRange) / 4;
            return (
              <g key={i}>
                <line
                  x1={padding}
                  y1={y}
                  x2={chartWidth - padding}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                />
                <text
                  x={padding - 5}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#6b7280"
                >
                  ₹{price.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Candlesticks */}
          {historicalData.map((candle, index) => {
            const x = getX(index);
            const openY = getY(candle.open);
            const closeY = getY(candle.close);
            const highY = getY(candle.high);
            const lowY = getY(candle.low);
            
            const isGreen = candle.close > candle.open;
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.abs(closeY - openY);
            
            return (
              <g key={index}>
                {/* Wick */}
                <line
                  x1={x + candleWidth / 2}
                  y1={highY}
                  x2={x + candleWidth / 2}
                  y2={lowY}
                  stroke={isGreen ? '#16a34a' : '#dc2626'}
                  strokeWidth={1}
                />
                
                {/* Body */}
                <rect
                  x={x}
                  y={bodyTop}
                  width={candleWidth}
                  height={Math.max(1, bodyHeight)}
                  fill={isGreen ? '#16a34a' : '#dc2626'}
                  opacity={0.8}
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-80" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <BarChart3 className="h-12 w-12 text-red-500 mx-auto" />
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
            <BarChart3 className="h-5 w-5" />
            <span>{symbol} Historical Chart</span>
            <Badge variant="outline">{exchange}</Badge>
          </div>
          
          {showControls && (
            <div className="flex items-center space-x-2">
              <Select value={timeframe} onValueChange={handleTimeframeChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map(tf => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={historicalData.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Price Statistics */}
        {priceStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Current</div>
              <div className="font-bold text-lg">₹{priceStats.lastPrice.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Change</div>
              <div className={`font-bold text-lg flex items-center justify-center space-x-1 ${
                priceStats.change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {priceStats.change >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{priceStats.changePercent.toFixed(2)}%</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">High</div>
              <div className="font-bold text-lg text-green-600">₹{priceStats.high.toFixed(2)}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Low</div>
              <div className="font-bold text-lg text-red-600">₹{priceStats.low.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>
                {historicalData.length > 0 && (
                  `${historicalData[0].date} to ${historicalData[historicalData.length - 1].date}`
                )}
              </span>
            </div>
            <span>{historicalData.length} data points</span>
          </div>
          
          {historicalData.length > 0 ? (
            renderCandlestickChart()
          ) : (
            <div className="flex items-center justify-center h-80 border rounded">
              <div className="text-center space-y-2">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">No chart data available</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ZerodhaHistoricalChart;