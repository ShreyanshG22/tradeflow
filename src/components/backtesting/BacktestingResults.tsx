
import { useState } from "react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EquityCurveChart } from "./charts/EquityCurveChart";
import { TradeStatsCards } from "./TradeStatsCards";
import { TradingMetricsTable } from "./TradingMetricsTable";
import { TradeList } from "./TradeList";

interface BacktestingResultsProps {
  hasResults: boolean;
}

export function BacktestingResults({ hasResults }: BacktestingResultsProps) {
  const [activeTab, setActiveTab] = useState("overview");
  
  if (!hasResults) {
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
  
  return (
    <ScrollArea className="h-full w-full">
      <div className="p-6 space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="equity">Equity Curve</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="metrics">Risk Metrics</TabsTrigger>
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
      </div>
    </ScrollArea>
  );
}
