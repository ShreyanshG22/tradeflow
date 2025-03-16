
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart4, Download, FileDown, Filter, FileType, CalendarRange } from "lucide-react";
import { BackButton } from "@/components/BackButton";

const PerformanceReports = () => {
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-6 py-3 bg-background">
        <div className="flex items-center">
          <BackButton to="/dashboard" className="mr-2" />
          <div>
            <h1 className="text-xl font-semibold">Performance Reports</h1>
            <p className="text-sm text-muted-foreground">Analyze and export your trading performance</p>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-auto">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="w-full md:w-auto">
              <Select defaultValue="all">
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="ema-cross">EMA Crossover</SelectItem>
                  <SelectItem value="rsi-strategy">RSI Strategy</SelectItem>
                  <SelectItem value="macd">MACD Strategy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-auto">
              <Select defaultValue="3m">
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="1m">Last 30 Days</SelectItem>
                  <SelectItem value="3m">Last 3 Months</SelectItem>
                  <SelectItem value="6m">Last 6 Months</SelectItem>
                  <SelectItem value="1y">Last Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline">
              <FileDown className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline">
              <FileType className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="pnl">P&L Analysis</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Total Return</CardTitle>
                  <CardDescription>All strategies combined</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">+15.73%</div>
                  <p className="text-xs text-muted-foreground">+$4,719.45</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Win Rate</CardTitle>
                  <CardDescription>Success percentage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">67.3%</div>
                  <p className="text-xs text-muted-foreground">21 wins / 10 losses</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Profit Factor</CardTitle>
                  <CardDescription>Gross profit / gross loss</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1.93</div>
                  <p className="text-xs text-muted-foreground">Strong risk-reward</p>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Equity Curve</CardTitle>
                <CardDescription>Account balance over time</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                  <p className="text-muted-foreground mt-4">Equity curve chart will be displayed here</p>
                </div>
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Returns</CardTitle>
                  <CardDescription>Performance breakdown by month</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                    <p className="text-muted-foreground mt-4">Monthly returns chart will be displayed here</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Drawdown Analysis</CardTitle>
                  <CardDescription>Maximum drawdown periods</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                    <p className="text-muted-foreground mt-4">Drawdown chart will be displayed here</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="trades">
            <Card>
              <CardHeader>
                <CardTitle>Trading History</CardTitle>
                <CardDescription>Complete record of all executed trades</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="h-10 px-4 text-left font-medium">Date</th>
                        <th className="h-10 px-4 text-left font-medium">Strategy</th>
                        <th className="h-10 px-4 text-left font-medium">Symbol</th>
                        <th className="h-10 px-4 text-left font-medium">Direction</th>
                        <th className="h-10 px-4 text-left font-medium">Entry</th>
                        <th className="h-10 px-4 text-left font-medium">Exit</th>
                        <th className="h-10 px-4 text-left font-medium">P&L</th>
                        <th className="h-10 px-4 text-left font-medium">P&L %</th>
                        <th className="h-10 px-4 text-left font-medium">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2 align-middle">07/12/2023</td>
                        <td className="p-2 align-middle">EMA Crossover</td>
                        <td className="p-2 align-middle">BTC/USDT</td>
                        <td className="p-2 align-middle">Long</td>
                        <td className="p-2 align-middle">$27,354.23</td>
                        <td className="p-2 align-middle">$27,823.45</td>
                        <td className="p-2 align-middle text-green-500">+$469.22</td>
                        <td className="p-2 align-middle text-green-500">+1.72%</td>
                        <td className="p-2 align-middle">4h 12m</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2 align-middle">07/11/2023</td>
                        <td className="p-2 align-middle">RSI Strategy</td>
                        <td className="p-2 align-middle">ETH/USD</td>
                        <td className="p-2 align-middle">Short</td>
                        <td className="p-2 align-middle">$1,876.32</td>
                        <td className="p-2 align-middle">$1,823.15</td>
                        <td className="p-2 align-middle text-green-500">+$53.17</td>
                        <td className="p-2 align-middle text-green-500">+2.83%</td>
                        <td className="p-2 align-middle">2h 45m</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2 align-middle">07/10/2023</td>
                        <td className="p-2 align-middle">EMA Crossover</td>
                        <td className="p-2 align-middle">BTC/USDT</td>
                        <td className="p-2 align-middle">Long</td>
                        <td className="p-2 align-middle">$26,987.12</td>
                        <td className="p-2 align-middle">$26,843.78</td>
                        <td className="p-2 align-middle text-red-500">-$143.34</td>
                        <td className="p-2 align-middle text-red-500">-0.53%</td>
                        <td className="p-2 align-middle">1h 32m</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="pnl">
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Daily P&L</CardTitle>
                  <CardDescription>Profit and loss by day</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                    <p className="text-muted-foreground mt-4">Daily P&L chart will be displayed here</p>
                  </div>
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>P&L Distribution</CardTitle>
                    <CardDescription>Distribution of trade outcomes</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">P&L distribution chart will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Cumulative P&L</CardTitle>
                    <CardDescription>Running total of profits and losses</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">Cumulative P&L chart will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="statistics">
            <div className="grid grid-cols-1 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Key Performance Metrics</CardTitle>
                  <CardDescription>Statistical analysis of trading performance</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="text-lg font-semibold">67.3%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Profit Factor</p>
                      <p className="text-lg font-semibold">1.93</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Win</p>
                      <p className="text-lg font-semibold text-green-500">2.15%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Loss</p>
                      <p className="text-lg font-semibold text-red-500">-0.97%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Max Drawdown</p>
                      <p className="text-lg font-semibold">-8.43%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                      <p className="text-lg font-semibold">1.87</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total Trades</p>
                      <p className="text-lg font-semibold">31</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Avg Trade Duration</p>
                      <p className="text-lg font-semibold">3h 42m</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Strategy Comparison</CardTitle>
                    <CardDescription>Performance by strategy</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">Strategy comparison chart will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Time Analysis</CardTitle>
                    <CardDescription>Performance by time of day</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">Time analysis chart will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Market Correlation</CardTitle>
                    <CardDescription>Strategy vs market performance</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px] flex items-center justify-center">
                    <div className="text-center">
                      <BarChart4 className="h-16 w-16 mx-auto text-muted-foreground/60" />
                      <p className="text-muted-foreground mt-4">Correlation chart will be displayed here</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PerformanceReports;
