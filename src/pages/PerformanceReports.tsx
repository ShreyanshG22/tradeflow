
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { 
  BarChart, 
  LineChart, 
  PieChart, 
  Download, 
  CalendarDays, 
  ArrowUpRight, 
  ArrowDownRight, 
  FileText, 
  ChevronRight,
  BarChart2,
  TrendingUp,
  AlertTriangle,
  Clock,
  BriefcaseBusiness,
  Settings,
  Share2,
  ArrowLeft
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as ReBarChart, Bar, Legend, PieChart as RePieChart, Pie, Cell, ComposedChart, Line } from "recharts";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset
} from "@/components/ui/sidebar";

const PerformanceReports = () => {
  // Update the page title
  useEffect(() => {
    document.title = "Performance Reports | TradeFlow";
  }, []);

  // State for active report category
  const [activeCategory, setActiveCategory] = useState("overview");
  const [dateRange, setDateRange] = useState("all");
  const [selectedStrategy, setSelectedStrategy] = useState("all");

  // Sample performance data
  const performanceData = [
    { date: "Jan", profit: 1200, trades: 28, winRate: 65, benchmark: 800 },
    { date: "Feb", profit: 1800, trades: 32, winRate: 72, benchmark: 1100 },
    { date: "Mar", profit: 800, trades: 24, winRate: 54, benchmark: 900 },
    { date: "Apr", profit: -400, trades: 18, winRate: 40, benchmark: -200 },
    { date: "May", profit: 1500, trades: 30, winRate: 70, benchmark: 1000 },
    { date: "Jun", profit: 2200, trades: 36, winRate: 78, benchmark: 1600 },
    { date: "Jul", profit: 1900, trades: 34, winRate: 68, benchmark: 1400 },
    { date: "Aug", profit: 1000, trades: 26, winRate: 62, benchmark: 800 },
  ];

  // Asset allocation data
  const assetAllocationData = [
    { name: "BTC", value: 45, color: "#3498db" },
    { name: "ETH", value: 25, color: "#2ecc71" },
    { name: "AAPL", value: 15, color: "#e74c3c" },
    { name: "MSFT", value: 10, color: "#f39c12" },
    { name: "Other", value: 5, color: "#9b59b6" },
  ];

  // Strategy performance data
  const strategyPerformanceData = [
    { 
      name: "Moving Average Crossover", 
      profit: 3800, 
      trades: 58, 
      winRate: 72, 
      riskRewardRatio: 1.8,
      sharpeRatio: 2.1,
      profitFactor: 2.4,
      drawdown: 12.5
    },
    { 
      name: "RSI Counter-Trend", 
      profit: 2200, 
      trades: 42, 
      winRate: 65, 
      riskRewardRatio: 1.5,
      sharpeRatio: 1.8,
      profitFactor: 2.0,
      drawdown: 14.8
    },
    { 
      name: "Breakout Strategy", 
      profit: 1400, 
      trades: 36, 
      winRate: 58, 
      riskRewardRatio: 1.4,
      sharpeRatio: 1.5,
      profitFactor: 1.8,
      drawdown: 18.2
    },
    { 
      name: "Bollinger Bands", 
      profit: 900, 
      trades: 28, 
      winRate: 50, 
      riskRewardRatio: 1.2,
      sharpeRatio: 1.2,
      profitFactor: 1.5,
      drawdown: 22.5
    },
  ];
  
  // Risk metrics data
  const riskMetricsData = [
    { name: "Max Drawdown", value: "15.2%" },
    { name: "Sharpe Ratio", value: "1.8" },
    { name: "Sortino Ratio", value: "2.1" },
    { name: "Avg Risk Per Trade", value: "1.2%" },
    { name: "Max Consecutive Losses", value: "4" },
    { name: "Value at Risk (95%)", value: "$420" },
  ];

  // Benchmark data
  const benchmarkData = [
    { name: "Your Portfolio", return: "18.5%", color: "#3498db" },
    { name: "S&P 500", return: "12.3%", color: "#2ecc71" },
    { name: "NIFTY 50", return: "9.8%", color: "#e74c3c" },
    { name: "BTC", return: "22.1%", color: "#f39c12" },
  ];

  // Report categories
  const reportCategories = [
    { id: "overview", name: "Performance Overview", icon: BarChart },
    { id: "equity", name: "Equity Curve Analysis", icon: LineChart },
    { id: "distribution", name: "Trade Distribution", icon: BarChart2 },
    { id: "risk", name: "Risk Metrics", icon: AlertTriangle },
    { id: "execution", name: "Execution Report", icon: Clock },
    { id: "benchmarking", name: "Benchmarking", icon: BriefcaseBusiness },
    { id: "custom", name: "Custom Reports", icon: Settings },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen bg-background">
        {/* Left Sidebar - Report Categories */}
        <Sidebar>
          <SidebarHeader className="border-b">
            <div className="py-2 px-4">
              <h2 className="text-lg font-semibold">Reports</h2>
              <p className="text-sm text-muted-foreground">Trading Analysis</p>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Quick Summary</SidebarGroupLabel>
              <SidebarGroupContent className="grid gap-2">
                <div className="grid grid-cols-2 gap-2 px-2">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Net P&L</p>
                    <p className="text-sm font-medium text-green-500">+$9,000</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-sm font-medium">68.5%</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Top Strategy</p>
                    <p className="text-sm font-medium truncate">MA Crossover</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Risk/Reward</p>
                    <p className="text-sm font-medium">1.8</p>
                  </div>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Report Categories</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {reportCategories.map((category) => (
                    <SidebarMenuItem key={category.id}>
                      <SidebarMenuButton
                        isActive={activeCategory === category.id}
                        onClick={() => setActiveCategory(category.id)}
                      >
                        <category.icon className="h-4 w-4" />
                        <span>{category.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t p-4">
            <Button className="w-full" size="sm" variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              <span>Export All Reports</span>
            </Button>
          </SidebarFooter>
        </Sidebar>
        
        {/* Main Content Area */}
        <SidebarInset>
          <div className="container p-4 md:p-6 space-y-6">
            {/* Top Bar Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
              <div className="flex items-center">
                <Button variant="outline" size="icon" asChild className="mr-2">
                  <Link to="/dashboard">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Performance Reports</h1>
                  <p className="text-muted-foreground">
                    Analyze your trading performance and strategy metrics
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Time Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="3m">Last 3 Months</SelectItem>
                    <SelectItem value="6m">Last 6 Months</SelectItem>
                    <SelectItem value="1y">Last Year</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    <SelectItem value="ma">Moving Average</SelectItem>
                    <SelectItem value="rsi">RSI Counter-Trend</SelectItem>
                    <SelectItem value="breakout">Breakout Strategy</SelectItem>
                    <SelectItem value="bollinger">Bollinger Bands</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Main Content - Performance Overview */}
            <div className="grid grid-cols-1 gap-6">
              {/* Performance Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Profit</p>
                        <h3 className="text-2xl font-bold text-green-500">$9,000</h3>
                      </div>
                      <div className="rounded-full bg-green-500/10 p-3">
                        <ArrowUpRight className="h-6 w-6 text-green-500" />
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex items-center">
                      <ArrowUpRight className="inline h-3 w-3 text-green-500 mr-1" />
                      <span className="text-green-500 font-medium">+15.3%</span>
                      <span className="ml-1">from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                        <h3 className="text-2xl font-bold">68.5%</h3>
                      </div>
                      <div className="rounded-full bg-blue-500/10 p-3">
                        <BarChart className="h-6 w-6 text-blue-500" />
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex items-center">
                      <ArrowUpRight className="inline h-3 w-3 text-green-500 mr-1" />
                      <span className="text-green-500 font-medium">+2.1%</span>
                      <span className="ml-1">from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Trades</p>
                        <h3 className="text-2xl font-bold">228</h3>
                      </div>
                      <div className="rounded-full bg-purple-500/10 p-3">
                        <LineChart className="h-6 w-6 text-purple-500" />
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex items-center">
                      <ArrowUpRight className="inline h-3 w-3 text-green-500 mr-1" />
                      <span className="text-green-500 font-medium">+8.4%</span>
                      <span className="ml-1">from last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Max Drawdown</p>
                        <h3 className="text-2xl font-bold text-red-500">-15.2%</h3>
                      </div>
                      <div className="rounded-full bg-red-500/10 p-3">
                        <ArrowDownRight className="h-6 w-6 text-red-500" />
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex items-center">
                      <ArrowDownRight className="inline h-3 w-3 text-red-500 mr-1" />
                      <span className="text-red-500 font-medium">+2.8%</span>
                      <span className="ml-1">from last month</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content and Right Panel Split */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Panel - Charts and Tables (3/4 width) */}
                <div className="lg:col-span-3 space-y-6">
                  {/* Performance Charts */}
                  <Tabs defaultValue="profits">
                    <TabsList>
                      <TabsTrigger value="profits">Profits</TabsTrigger>
                      <TabsTrigger value="trades">Trades Analysis</TabsTrigger>
                      <TabsTrigger value="allocation">Asset Allocation</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profits" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Profit & Loss Over Time</CardTitle>
                          <CardDescription>Monthly profit and loss performance</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart
                                data={performanceData}
                                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                              >
                                <defs>
                                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" />
                                <YAxis />
                                <CartesianGrid strokeDasharray="3 3" />
                                <Tooltip />
                                <Area
                                  type="monotone"
                                  dataKey="profit"
                                  stroke="#10b981"
                                  fillOpacity={1}
                                  fill="url(#colorProfit)"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="trades" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Trade Metrics Analysis</CardTitle>
                          <CardDescription>
                            Number of trades and win rate over time
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <ReBarChart
                                data={performanceData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis yAxisId="left" orientation="left" />
                                <YAxis
                                  yAxisId="right"
                                  orientation="right"
                                  domain={[0, 100]}
                                />
                                <Tooltip />
                                <Legend />
                                <Bar
                                  yAxisId="left"
                                  dataKey="trades"
                                  fill="#8884d8"
                                  name="Number of Trades"
                                />
                                <Bar
                                  yAxisId="right"
                                  dataKey="winRate"
                                  fill="#82ca9d"
                                  name="Win Rate (%)"
                                />
                              </ReBarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="allocation" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>Asset Allocation</CardTitle>
                          <CardDescription>
                            Distribution of capital across different trading instruments
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80 flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                              <RePieChart>
                                <Pie
                                  data={assetAllocationData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={120}
                                  fill="#8884d8"
                                  paddingAngle={5}
                                  dataKey="value"
                                  label={({ name, percent }) =>
                                    `${name} ${(percent * 100).toFixed(0)}%`
                                  }
                                >
                                  {assetAllocationData.map((entry, index) => (
                                    <Cell
                                      key={`cell-${index}`}
                                      fill={entry.color}
                                    />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </RePieChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>

                  {/* Strategy Performance Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Strategy Performance</CardTitle>
                      <CardDescription>
                        Detailed performance metrics for each trading strategy
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Strategy</TableHead>
                            <TableHead>Profit</TableHead>
                            <TableHead>Trades</TableHead>
                            <TableHead>Win Rate</TableHead>
                            <TableHead>Risk/Reward</TableHead>
                            <TableHead>Sharpe Ratio</TableHead>
                            <TableHead>Profit Factor</TableHead>
                            <TableHead>Max Drawdown</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {strategyPerformanceData.map((strategy) => (
                            <TableRow key={strategy.name}>
                              <TableCell className="font-medium">{strategy.name}</TableCell>
                              <TableCell className={strategy.profit >= 0 ? "text-green-500" : "text-red-500"}>
                                ${strategy.profit.toLocaleString()}
                              </TableCell>
                              <TableCell>{strategy.trades}</TableCell>
                              <TableCell>{strategy.winRate}%</TableCell>
                              <TableCell>{strategy.riskRewardRatio}</TableCell>
                              <TableCell>{strategy.sharpeRatio}</TableCell>
                              <TableCell>{strategy.profitFactor}</TableCell>
                              <TableCell className="text-red-500">-{strategy.drawdown}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Recent Trades */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Trades</CardTitle>
                      <CardDescription>
                        Your most recent trading activity
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Strategy</TableHead>
                            <TableHead>Symbol</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Entry</TableHead>
                            <TableHead>Exit</TableHead>
                            <TableHead>Profit/Loss</TableHead>
                            <TableHead>Duration</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <span>Aug 28, 2023</span>
                              </div>
                            </TableCell>
                            <TableCell>Moving Average Crossover</TableCell>
                            <TableCell>BTC/USD</TableCell>
                            <TableCell>
                              <Badge className="bg-green-500">Long</Badge>
                            </TableCell>
                            <TableCell>$39,456.12</TableCell>
                            <TableCell>$40,982.45</TableCell>
                            <TableCell className="text-green-500">+$1,526.33 (3.87%)</TableCell>
                            <TableCell>2d 4h</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <span>Aug 25, 2023</span>
                              </div>
                            </TableCell>
                            <TableCell>RSI Counter-Trend</TableCell>
                            <TableCell>ETH/USD</TableCell>
                            <TableCell>
                              <Badge className="bg-red-500">Short</Badge>
                            </TableCell>
                            <TableCell>$2,298.15</TableCell>
                            <TableCell>$2,198.75</TableCell>
                            <TableCell className="text-green-500">+$99.40 (4.32%)</TableCell>
                            <TableCell>14h 22m</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <span>Aug 22, 2023</span>
                              </div>
                            </TableCell>
                            <TableCell>Breakout Strategy</TableCell>
                            <TableCell>AAPL</TableCell>
                            <TableCell>
                              <Badge className="bg-green-500">Long</Badge>
                            </TableCell>
                            <TableCell>$178.52</TableCell>
                            <TableCell>$176.89</TableCell>
                            <TableCell className="text-red-500">-$1.63 (0.91%)</TableCell>
                            <TableCell>1d 8h</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                <span>Aug 20, 2023</span>
                              </div>
                            </TableCell>
                            <TableCell>Bollinger Bands</TableCell>
                            <TableCell>MSFT</TableCell>
                            <TableCell>
                              <Badge className="bg-green-500">Long</Badge>
                            </TableCell>
                            <TableCell>$325.12</TableCell>
                            <TableCell>$328.45</TableCell>
                            <TableCell className="text-green-500">+$3.33 (1.02%)</TableCell>
                            <TableCell>6h 15m</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
                
                {/* Right Panel - Benchmarking & Strategy Comparison (1/4 width) */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Benchmarking Section */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Performance Benchmarking</CardTitle>
                      <CardDescription>Compare your returns against market benchmarks</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={performanceData}
                              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                            >
                              <CartesianGrid stroke="#f5f5f5" />
                              <XAxis dataKey="date" />
                              <YAxis />
                              <Tooltip />
                              <Area type="monotone" dataKey="profit" fill="#8884d8" stroke="#8884d8" />
                              <Line type="monotone" dataKey="benchmark" stroke="#ff7300" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {benchmarkData.map((benchmark) => (
                            <div 
                              key={benchmark.name} 
                              className="flex items-center justify-between p-2 rounded-md border"
                            >
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: benchmark.color }}
                                ></div>
                                <span>{benchmark.name}</span>
                              </div>
                              <span className={benchmark.name === "Your Portfolio" ? "font-semibold" : ""}>
                                {benchmark.return}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Risk Metrics */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Risk Analysis</CardTitle>
                      <CardDescription>Key risk metrics for your trading strategy</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {riskMetricsData.map((metric) => (
                          <div key={metric.name} className="flex justify-between border-b pb-2 last:border-0 last:pb-0">
                            <span className="text-muted-foreground">{metric.name}</span>
                            <span className="font-medium">{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Export Options */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Export & Share</CardTitle>
                      <CardDescription>Download or share your performance reports</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="w-full justify-start" size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          PDF
                        </Button>
                        <Button variant="outline" className="w-full justify-start" size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          CSV
                        </Button>
                        <Button variant="outline" className="w-full justify-start" size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          Excel
                        </Button>
                        <Button variant="outline" className="w-full justify-start" size="sm">
                          <FileText className="mr-2 h-4 w-4" />
                          JSON
                        </Button>
                      </div>
                      <div className="pt-2 border-t">
                        <Button variant="outline" className="w-full" size="sm">
                          <Share2 className="mr-2 h-4 w-4" />
                          Share Report
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default PerformanceReports;
