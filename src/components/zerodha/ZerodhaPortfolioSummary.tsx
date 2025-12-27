/**
 * Zerodha Portfolio Summary Component
 * Displays overall portfolio performance and analytics
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  PieChart,
  BarChart3,
  Target,
  AlertCircle,
  DollarSign
} from 'lucide-react';

export interface ZerodhaPortfolioSummary {
  total_value: number;
  invested_value: number;
  available_cash: number;
  used_margin: number;
  available_margin: number;
  total_pnl: number;
  day_pnl: number;
  total_pnl_percentage: number;
  day_pnl_percentage: number;
  positions_count: number;
  holdings_count: number;
  orders_count: number;
  margin_utilization_percentage: number;
}

interface ZerodhaPortfolioSummaryProps {
  className?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  showDetails?: boolean;
}

export function ZerodhaPortfolioSummary({
  className = '',
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  showDetails = true,
}: ZerodhaPortfolioSummaryProps) {
  const [summary, setSummary] = useState<ZerodhaPortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch portfolio summary
  const fetchSummary = async (showLoader = true) => {
    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const response = await fetch('/api/zerodha/portfolio/summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch portfolio summary');
      }

      const data = await response.json();
      
      if (data.success && data.data) {
        setSummary(data.data);
      } else {
        throw new Error('No portfolio data available');
      }
    } catch (error) {
      console.error('Failed to fetch portfolio summary:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch portfolio summary');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchSummary();
  }, []);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchSummary(false);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSummary(false);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toFixed(2)}`;
  };

  const formatPnL = (pnl: number, showSign = true) => {
    const color = pnl >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = showSign && pnl >= 0 ? '+' : '';
    return (
      <span className={color}>
        {sign}{formatCurrency(pnl)}
      </span>
    );
  };

  const formatPercentage = (percentage: number, showSign = true) => {
    const color = percentage >= 0 ? 'text-green-600' : 'text-red-600';
    const sign = showSign && percentage >= 0 ? '+' : '';
    return (
      <span className={color}>
        {sign}{percentage.toFixed(2)}%
      </span>
    );
  };

  const getMarginUtilizationColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-red-500';
    if (percentage >= 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getMarginUtilizationStatus = (percentage: number) => {
    if (percentage >= 80) return { text: 'High Risk', color: 'text-red-600' };
    if (percentage >= 60) return { text: 'Moderate', color: 'text-yellow-600' };
    return { text: 'Safe', color: 'text-green-600' };
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-20" />
              </div>
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
            <Wallet className="h-12 w-12 text-red-500 mx-auto" />
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

  if (!summary) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center space-y-2">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No portfolio data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const marginStatus = getMarginUtilizationStatus(summary.margin_utilization_percentage);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wallet className="h-5 w-5" />
            <span>Portfolio Summary</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Portfolio Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{formatCurrency(summary.total_value)}</div>
            <div className="text-sm text-muted-foreground">Total Value</div>
          </div>
          
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold">{formatCurrency(summary.invested_value)}</div>
            <div className="text-sm text-muted-foreground">Invested</div>
          </div>
          
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className={`text-2xl font-bold ${summary.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnL(summary.total_pnl, false).props.children}
            </div>
            <div className="text-sm">
              {formatPercentage(summary.total_pnl_percentage)}
            </div>
            <div className="text-xs text-muted-foreground">Total P&L</div>
          </div>
          
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <div className={`text-2xl font-bold ${summary.day_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnL(summary.day_pnl, false).props.children}
            </div>
            <div className="text-sm">
              {formatPercentage(summary.day_pnl_percentage)}
            </div>
            <div className="text-xs text-muted-foreground">Day P&L</div>
          </div>
        </div>

        {showDetails && (
          <>
            {/* Portfolio Breakdown */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <PieChart className="h-5 w-5" />
                <span>Portfolio Breakdown</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Positions</span>
                  </div>
                  <Badge variant="outline">{summary.positions_count}</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">Holdings</span>
                  </div>
                  <Badge variant="outline">{summary.holdings_count}</Badge>
                </div>
                
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">Active Orders</span>
                  </div>
                  <Badge variant="outline">{summary.orders_count}</Badge>
                </div>
              </div>
            </div>

            {/* Margin Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center space-x-2">
                <AlertCircle className="h-5 w-5" />
                <span>Margin Status</span>
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Available Cash</span>
                  <span className="font-medium">{formatCurrency(summary.available_cash)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Used Margin</span>
                  <span className="font-medium">{formatCurrency(summary.used_margin)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Available Margin</span>
                  <span className="font-medium">{formatCurrency(summary.available_margin)}</span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Margin Utilization</span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-medium ${marginStatus.color}`}>
                        {summary.margin_utilization_percentage.toFixed(1)}%
                      </span>
                      <Badge variant="outline" className={marginStatus.color}>
                        {marginStatus.text}
                      </Badge>
                    </div>
                  </div>
                  
                  <Progress 
                    value={summary.margin_utilization_percentage} 
                    className={`h-2 [&>div]:${getMarginUtilizationColor(summary.margin_utilization_percentage)}`}
                  />
                </div>
              </div>
            </div>

            {/* Risk Warning */}
            {summary.margin_utilization_percentage >= 80 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200">
                      High Margin Utilization Warning
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      Your margin utilization is {summary.margin_utilization_percentage.toFixed(1)}%. 
                      Consider reducing positions or adding funds to avoid margin calls.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ZerodhaPortfolioSummary;