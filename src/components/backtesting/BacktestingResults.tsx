
import { useState, useEffect } from "react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EquityCurveChart } from "./charts/EquityCurveChart";
import { TradeStatsCards } from "./TradeStatsCards";
import { TradingMetricsTable } from "./TradingMetricsTable";
import { TradeList } from "./TradeList";
import { HeatmapChart } from "./charts/HeatmapChart";
import { MonteCarloChart } from "./charts/MonteCarloChart";
import { Download, Share, Zap, Robot, Info, BarChart4, ChartLine, Flame, Dice6 } from "lucide-react";

interface BacktestingResultsProps {
  hasResults: boolean;
  isRunning?: boolean;
  progress?: number;
}

export function BacktestingResults({ hasResults, isRunning = false, progress = 0 }: BacktestingResultsProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);
  
  useEffect(() => {
    // If we have results, show the optimization panel after a short delay
    if (hasResults && !isRunning) {
      const timer = setTimeout(() => {
        setShowOptimizationPanel(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
    
    // Hide the panel when running a new backtest
    if (isRunning) {
      setShowOptimizationPanel(false);
    }
  }, [hasResults, isRunning]);
  
  if (!hasResults && !isRunning) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="max-w-md space-y-4">
          <h3 className="text-2xl font-bold">No Backtest Results</h3>
          <p className="text-muted-foreground">
            Configure your backtest parameters in the left panel and click "Run Backtest" to see results here.
          </p>
        </div>
      </div>
    );
  }
  
  // Show loading state while backtest is running
  if (isRunning) {
    return (
      <ScrollArea className="h-full w-full">
        <div className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Return</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Win Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Profit Factor</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-12 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Max Drawdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 w-16 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Equity Curve</CardTitle>
              <CardDescription>Generating equity curve based on backtest data...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex flex-col items-center justify-center">
                <div className="text-center space-y-3">
                  <Skeleton className="h-[300px] w-full" />
                  <p className="text-sm text-muted-foreground">Processed {progress}% of historical data</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Trade List</CardTitle>
              <CardDescription>Processing trades...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    );
  }
  
  return (
    <div className="h-full grid grid-cols-4">
      <ScrollArea className="col-span-3 h-full w-full">
        <div className="p-6 space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-4"
          >
            <TabsList>
              <TabsTrigger value="overview" className="flex gap-1.5 items-center">
                <BarChart4 className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="equity" className="flex gap-1.5 items-center">
                <ChartLine className="h-4 w-4" />
                Equity Curve
              </TabsTrigger>
              <TabsTrigger value="heatmap" className="flex gap-1.5 items-center">
                <Flame className="h-4 w-4" />
                Trade Heatmap
              </TabsTrigger>
              <TabsTrigger value="montecarlo" className="flex gap-1.5 items-center">
                <Dice6 className="h-4 w-4" />
                Monte Carlo
              </TabsTrigger>
              <TabsTrigger value="trades" className="flex gap-1.5 items-center">
                <Info className="h-4 w-4" />
                Trades
              </TabsTrigger>
              <TabsTrigger value="metrics" className="flex gap-1.5 items-center">
                <Zap className="h-4 w-4" />
                Metrics
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <TradeStatsCards />
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">Equity Curve</CardTitle>
                      <CardDescription>Account growth over time</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <EquityCurveChart chartHeight={300} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">Key Risk Metrics</CardTitle>
                      <CardDescription>Performance indicators</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <TradingMetricsTable />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base">Recent Trades</CardTitle>
                    <CardDescription>Last 5 trades of the backtest</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <TradeList limit={5} />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="equity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Equity Curve</CardTitle>
                  <CardDescription>
                    Growth of capital over the backtest period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[500px]">
                    <EquityCurveChart chartHeight={500} />
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex justify-between items-center">
                <div className="space-x-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Download Chart
                  </Button>
                  <Button variant="outline" size="sm">
                    <Share className="h-4 w-4 mr-2" />
                    Share
                  </Button>
                </div>
                <div className="space-x-2">
                  <Button variant="outline" size="sm">Linear</Button>
                  <Button variant="outline" size="sm">Log Scale</Button>
                  <Button variant="outline" size="sm">Drawdowns</Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="heatmap" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Trade Distribution Heatmap</CardTitle>
                  <CardDescription>
                    Visualize trade performance across different time periods
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" size="sm">Time of Day</Button>
                      <Button variant="outline" size="sm">Day of Week</Button>
                      <Button variant="outline" size="sm">Monthly</Button>
                    </div>
                    
                    <div className="h-[500px]">
                      <HeatmapChart />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="montecarlo" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Monte Carlo Simulation</CardTitle>
                  <CardDescription>
                    1000 alternative scenarios based on your strategy's performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[500px]">
                    <MonteCarloChart />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Worst Case Drawdown (95% CI)</p>
                      <p className="text-lg font-semibold text-red-500">-24.7%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Expected Return (Median)</p>
                      <p className="text-lg font-semibold">+28.3%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Best Case Return (95% CI)</p>
                      <p className="text-lg font-semibold text-green-500">+42.1%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="trades" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Trade List</CardTitle>
                  <CardDescription>
                    Detailed information about each trade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TradeList />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="metrics" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <TradeStatsCards />
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Trading Metrics</CardTitle>
                  <CardDescription>
                    Detailed performance and risk metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TradingMetricsTable full />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-between items-center">
            <div className="space-x-2">
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </Button>
              <Button variant="outline">
                <Share className="mr-2 h-4 w-4" />
                Share Results
              </Button>
            </div>
            <Button variant="outline">
              <Zap className="mr-2 h-4 w-4" />
              Re-run with Adjustments
            </Button>
          </div>
        </div>
      </ScrollArea>
      
      {showOptimizationPanel && (
        <div className="border-l h-full overflow-auto">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center">
                <Robot className="h-4 w-4 mr-2" />
                AI Suggestions
              </h3>
              <Button variant="ghost" size="sm">Refresh</Button>
            </div>
            
            <div className="mt-4 space-y-3">
              <OptimizationSuggestion 
                title="Tighten your stop loss"
                description="Reducing stop loss from 2% to 1.5% increases your win rate by 8%."
              />
              
              <OptimizationSuggestion 
                title="Avoid Monday trades"
                description="Your strategy performs 23% worse on Mondays than other days."
                chipText="Low win rate"
                chipColor="red"
              />
              
              <OptimizationSuggestion 
                title="Tweak MACD settings"
                description="Try MACD(12,26,9) instead of current settings for better signals."
                chipText="Improvement"
                chipColor="amber"
              />
              
              <OptimizationSuggestion 
                title="Increase position size"
                description="Your max drawdown is low. Consider raising position size to 7%."
                chipText="Opportunity"
                chipColor="green"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface OptimizationSuggestionProps {
  title: string;
  description: string;
  chipText?: string;
  chipColor?: 'green' | 'amber' | 'red';
}

function OptimizationSuggestion({ title, description, chipText, chipColor }: OptimizationSuggestionProps) {
  const getBadgeVariant = () => {
    switch (chipColor) {
      case 'green':
        return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800";
      case 'amber':
        return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800";
      case 'red':
        return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800";
      default:
        return "";
    }
  };
  
  return (
    <Card>
      <CardContent className="p-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">{title}</h4>
            {chipText && (
              <Badge variant="outline" className={getBadgeVariant()}>
                {chipText}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          <div className="flex justify-end mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Apply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
