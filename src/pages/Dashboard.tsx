import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { 
  PanelLeft, 
  LayoutDashboard, 
  LineChart, 
  Zap, 
  Settings, 
  Plus, 
  Rocket, 
  FileText, 
  Search, 
  Bell, 
  Calendar, 
  ChevronDown, 
  Filter, 
  Download, 
  Clock, 
  BarChart4,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Bot,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarInset,
  useSidebar
} from "@/components/ui/sidebar";
import { DashboardMarketOverview } from "@/components/dashboard/MarketOverview";
import { DashboardActiveStrategies } from "@/components/dashboard/ActiveStrategies";
import { DashboardRecentBacktests } from "@/components/dashboard/RecentBacktests";

const Dashboard = () => {
  useEffect(() => {
    document.title = "Dashboard | TradeFlow";
  }, []);
  
  const [activeTimeFrame, setActiveTimeFrame] = useState("1w");
  const [activeStrategy, setActiveStrategy] = useState("all");
  const { toast } = useToast();

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen w-full flex bg-muted/10">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          <div className="h-16 border-b bg-background/95 backdrop-blur-sm fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              
              <Button variant="ghost" size="icon" asChild className="mr-2">
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              
              <div className="hidden md:flex items-center gap-2 min-w-[200px]">
                <Select value={activeStrategy} onValueChange={setActiveStrategy}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Strategies</SelectItem>
                    <SelectItem value="momentum">Momentum Strategy</SelectItem>
                    <SelectItem value="mean-reversion">Mean Reversion</SelectItem>
                    <SelectItem value="breakout">Breakout Strategy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="hidden lg:flex items-center gap-2">
                <Tabs defaultValue={activeTimeFrame} onValueChange={setActiveTimeFrame}>
                  <TabsList className="bg-muted/50">
                    <TabsTrigger value="1d">1D</TabsTrigger>
                    <TabsTrigger value="1w">1W</TabsTrigger>
                    <TabsTrigger value="1m">1M</TabsTrigger>
                    <TabsTrigger value="3m">3M</TabsTrigger>
                    <TabsTrigger value="1y">1Y</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
            
            <div className="flex items-center">
              <div className="hidden md:flex relative mr-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="search" 
                  placeholder="Search strategies, trades..." 
                  className="w-[200px] lg:w-[300px] pl-8 rounded-full bg-muted/50" 
                />
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full mr-2 relative"
                onClick={() => {
                  toast({
                    title: "New notifications",
                    description: "You have 3 unread alerts",
                  });
                }}
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">
                  3
                </span>
              </Button>
              
              <Button asChild size="sm" className="rounded-full">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                  T
                </div>
              </Button>
            </div>
          </div>
          
          <SidebarInset className="pt-16">
            <div className="container px-4 md:px-6">
              <div className="py-6 space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">Welcome back! Here's an overview of your trading activities.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" className="gap-1">
                      <Link to="/backtesting">
                        <LineChart className="h-4 w-4" />
                        <span className="hidden sm:inline">Backtest</span>
                      </Link>
                    </Button>
                    <Button asChild size="sm" className="gap-1">
                      <Link to="/strategy-builder">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">New Strategy</span>
                      </Link>
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-500">+₹12,586.45</div>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                        <span className="text-green-500 font-medium">+8.2%</span> from last period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">64.8%</div>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <ArrowUp className="h-3 w-3 mr-1 text-green-500" />
                        <span className="text-green-500 font-medium">+2.1%</span> from last period
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Active Strategies</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">3</div>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        <span>Last updated 2 mins ago</span>
                      </p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-500">-14.2%</div>
                      <p className="text-xs text-muted-foreground flex items-center mt-1">
                        <ArrowDown className="h-3 w-3 mr-1 text-red-500" />
                        <span className="text-red-500 font-medium">+1.8%</span> from last period
                      </p>
                    </CardContent>
                  </Card>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <Card>
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Strategy Performance</CardTitle>
                          <CardDescription>Equity curve over time</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="h-[300px] relative">
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          Performance chart would be displayed here
                        </div>
                      </CardContent>
                    </Card>
                    
                    <DashboardMarketOverview />
                    
                    <Card>
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Recent Trades</CardTitle>
                          <CardDescription>Last 10 executed trades</CardDescription>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1">
                          View All
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[300px]" orientation="both">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Instrument</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Entry</TableHead>
                                <TableHead>Exit</TableHead>
                                <TableHead>P&L</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Array.from({ length: 10 }).map((_, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">HDFC Bank</TableCell>
                                  <TableCell>
                                    <Badge variant={i % 2 === 0 ? "default" : "secondary"}>
                                      {i % 2 === 0 ? "Buy" : "Sell"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>₹1,642.50</TableCell>
                                  <TableCell>₹1,698.25</TableCell>
                                  <TableCell className={i % 3 === 0 ? "text-red-500" : "text-green-500"}>
                                    {i % 3 === 0 ? "-₹215.75" : "+₹342.50"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm">
                                    {new Date(Date.now() - i * 86400000).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </CardContent>
                      <CardFooter className="border-t pt-4">
                        <Button variant="outline" className="gap-2 w-full">
                          <Download className="h-4 w-4" />
                          Export Trade Data
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                  
                  <div className="space-y-6">
                    <DashboardActiveStrategies />
                    
                    <DashboardRecentBacktests />
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle>Alerts & Notifications</CardTitle>
                        <CardDescription>Recent system notifications</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">High Volatility Detected</p>
                              <p className="text-xs text-muted-foreground">VIX is above 20. Consider reducing position sizes.</p>
                              <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
                            </div>
                          </div>
                          
                          <div className="flex gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                            <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">Trade Executed Successfully</p>
                              <p className="text-xs text-muted-foreground">Bought 10 shares of Reliance at ₹2,450.75</p>
                              <p className="text-xs text-muted-foreground mt-1">3 hours ago</p>
                            </div>
                          </div>
                          
                          <div className="flex gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Bot className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">Strategy Optimization</p>
                              <p className="text-xs text-muted-foreground">AI suggests reducing trade frequency for Momentum strategy.</p>
                              <p className="text-xs text-muted-foreground mt-1">1 day ago</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button variant="ghost" className="w-full justify-between">
                          <span>View all notifications</span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </SidebarInset>
          
          <div className="fixed bottom-8 right-8 flex flex-col gap-2">
            <Button asChild size="icon" className="rounded-full h-14 w-14 shadow-lg">
              <Link to="/strategy-builder">
                <Plus className="h-6 w-6" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

const AppSidebar = () => {
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === "expanded";

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            <span className="text-primary-foreground font-semibold">T</span>
          </div>
          {isExpanded && <span className="font-semibold text-xl">TradeFlow</span>}
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive tooltip="Dashboard">
              <Link to="/dashboard">
                <LayoutDashboard className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Strategy Builder">
              <Link to="/strategy-builder">
                <PanelLeft className="h-5 w-5" />
                <span>Strategy Builder</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Backtesting">
              <Link to="/backtesting">
                <LineChart className="h-5 w-5" />
                <span>Backtesting</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Live Trading">
              <Link to="/live-trading">
                <Zap className="h-5 w-5" />
                <span>Live Trading</span>
                <Badge className="ml-auto bg-green-500">New</Badge>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Performance Reports">
              <Link to="/performance">
                <FileText className="h-5 w-5" />
                <span>Performance Reports</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <Link to="/settings">
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button asChild variant="outline" className="w-full flex items-center gap-2">
          <Link to="/">
            <Rocket className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default Dashboard;
